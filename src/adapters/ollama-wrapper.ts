/**
 * Ollama Integration Wrapper
 *
 * Provides abstraction layer for Ollama LLM backend
 * Features:
 * - Health checks and model availability
 * - Automatic fallback strategies
 * - Request/response translation
 * - Stream handling
 * - Error recovery
 */

import type { RequestOptions } from 'node:http';
import { EventEmitter } from 'node:events';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  context?: number[];
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  models: {
    available: string[];
    total_count: number;
  };
  latency_ms: number;
  timestamp: Date;
}

export interface OllamaConfig {
  url: string;
  timeout?: number;
  retry_attempts?: number;
  retry_backoff_ms?: number;
  pool_size?: number;
  tls_verify?: boolean;
  default_model?: string;
}

class OllamaWrapper extends EventEmitter {
  private config: Required<OllamaConfig>;
  private modelCache: Map<string, OllamaModel> = new Map();
  private lastHealthCheck: OllamaHealthStatus | null = null;
  private activeRequests: Set<string> = new Set();
  private requestCounter: number = 0;

  constructor(config: OllamaConfig) {
    super();
    this.config = {
      url: config.url || 'http://localhost:11434',
      timeout: config.timeout || 30000,
      retry_attempts: config.retry_attempts || 3,
      retry_backoff_ms: config.retry_backoff_ms || 1000,
      pool_size: config.pool_size || 10,
      tls_verify: config.tls_verify !== false,
      default_model: config.default_model || 'orca-mini',
    };
  }

  async healthCheck(): Promise<OllamaHealthStatus> {
    const startTime = Date.now();
    try {
      const response = await this.fetch(`${this.config.url}/api/tags`, {
        method: 'GET',
        timeout: 5000,
      });

      if (!response.ok) {
        return this.createHealthStatus('unhealthy', [], Date.now() - startTime);
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map(m => m.name) || [];

      this.modelCache.clear();
      models.forEach(name => {
        this.modelCache.set(name, {
          name,
          modified_at: new Date().toISOString(),
          size: 0
        });
      });

      const health = this.createHealthStatus(
        models.length > 0 ? 'healthy' : 'degraded',
        models,
        Date.now() - startTime
      );

      this.lastHealthCheck = health;
      this.emit('health-check', health);
      return health;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        models: { available: Array.from(this.modelCache.keys()), total_count: 0 },
        latency_ms: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (this.modelCache.size > 0) {
      return Array.from(this.modelCache.keys());
    }

    try {
      const response = await this.fetch(`${this.config.url}/api/tags`);
      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [this.config.default_model];
    }
  }

  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse | AsyncIterable<OllamaGenerateResponse>> {
    const requestId = `req-${++this.requestCounter}-${Date.now()}`;
    this.activeRequests.add(requestId);

    try {
      const model = request.model || this.config.default_model;

      // Validate model exists
      const available = await this.getAvailableModels();
      if (!available.includes(model)) {
        throw new Error(`Model ${model} not available. Available: ${available.join(', ')}`);
      }

      const body = {
        ...request,
        model,
        stream: request.stream ?? false,
      };

      if (body.stream) {
        return this.streamGenerate(requestId, body);
      } else {
        return this.singleGenerate(requestId, body);
      }
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  private async singleGenerate(requestId: string, body: unknown): Promise<OllamaGenerateResponse> {
    return this.retryWithBackoff(async () => {
      const response = await this.fetch(`${this.config.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeout: this.config.timeout,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as OllamaGenerateResponse;
      this.emit('generate', { requestId, success: true, tokens: data.eval_count });
      return data;
    });
  }

  private async *streamGenerate(requestId: string, body: unknown): AsyncIterable<OllamaGenerateResponse> {
    let attempt = 0;

    while (attempt < this.config.retry_attempts) {
      try {
        const response = await this.fetch(`${this.config.url}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          timeout: this.config.timeout,
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line) as OllamaGenerateResponse;
                chunkCount++;
                yield chunk;
              } catch {
                this.emit('error', { requestId, error: `Invalid JSON: ${line}` });
              }
            }
          }
        }

        this.emit('generate', { requestId, success: true, chunks: chunkCount });
        return;
      } catch (error) {
        attempt++;
        if (attempt >= this.config.retry_attempts) {
          this.emit('error', {
            requestId,
            error: error instanceof Error ? error.message : String(error),
            attempt,
          });
          throw error;
        }
        await this.sleep(this.config.retry_backoff_ms * attempt);
      }
    }
  }

  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.config.url}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        timeout: 300000, // 5 minutes for model pull
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`);
      }

      // Consume response body
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      this.modelCache.set(modelName, {
        name: modelName,
        modified_at: new Date().toISOString(),
        size: 0,
      });

      this.emit('model-pulled', { model: modelName });
      return true;
    } catch (error) {
      this.emit('error', {
        event: 'pull-failed',
        model: modelName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  getLastHealthStatus(): OllamaHealthStatus | null {
    return this.lastHealthCheck;
  }

  private async fetch(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = options.timeout || this.config.timeout;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt < this.config.retry_attempts) {
        await this.sleep(this.config.retry_backoff_ms * Math.pow(2, attempt));
        return this.retryWithBackoff(fn, attempt + 1);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createHealthStatus(
    status: 'healthy' | 'degraded' | 'unhealthy',
    models: string[],
    latencyMs: number
  ): OllamaHealthStatus {
    return {
      status,
      models: {
        available: models,
        total_count: models.length,
      },
      latency_ms: latencyMs,
      timestamp: new Date(),
    };
  }
}

export function createOllamaWrapper(config: OllamaConfig): OllamaWrapper {
  return new OllamaWrapper(config);
}

export default OllamaWrapper;
