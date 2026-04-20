/**
 * Circuit Breaker Wrapper for Claude API Client
 *
 * Wraps Claude API calls with circuit breaker pattern.
 * Provides fallback responses when circuit is open to enable graceful degradation.
 */

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerState,
} from '../lib/circuit-breaker.js';

export interface ClaudeApiResponse<T = unknown> {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  data?: T;
}

/**
 * Fallback response generator for when circuit is open.
 */
function createFallbackResponse(model: string): ClaudeApiResponse {
  return {
    id: `fallback-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content:
            'I apologize, but the Claude API is temporarily unavailable. Please try again in a few moments. This is a fallback response generated while the service recovers.',
        },
        finish_reason: 'fallback',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Circuit breaker configuration for Claude API.
 */
interface CircuitBreakerClaudeConfig {
  /** Circuit breaker threshold */
  threshold?: number;

  /** Timeout window for resetting failures (ms) */
  timeoutMs?: number;

  /** Half-open timeout (ms) */
  halfOpenTimeoutMs?: number;

  /** Maximum backoff (ms) */
  backoffMaxMs?: number;

  /** Enable fallback responses when open */
  enableFallback?: boolean;
}

/**
 * Wrapped Claude API client with circuit breaker pattern.
 */
export class CircuitBreakerClaudeClient {
  private breaker: CircuitBreaker<ClaudeApiResponse>;
  private fallbackCount: number = 0;
  private readonly enableFallback: boolean;

  constructor(config: CircuitBreakerClaudeConfig = {}) {
    this.enableFallback = config.enableFallback ?? true;

    this.breaker = new CircuitBreaker({
      threshold: config.threshold ?? 5,
      timeoutMs: config.timeoutMs ?? 60000,
      halfOpenTimeoutMs: config.halfOpenTimeoutMs ?? 30000,
      backoffMaxMs: config.backoffMaxMs ?? 30000,
      name: 'claude-api',
    });
  }

  /**
   * Execute a Claude API call through the circuit breaker.
   * Returns fallback response if circuit is open and fallback is enabled.
   */
  async callWithBreaker<T extends ClaudeApiResponse = ClaudeApiResponse>(
    fn: () => Promise<T>,
    model: string,
  ): Promise<T> {
    try {
      return (await this.breaker.execute(fn)) as T;
    } catch (error) {
      if (
        error instanceof CircuitBreakerOpenError &&
        this.enableFallback
      ) {
        this.fallbackCount++;
        return createFallbackResponse(model) as T;
      }
      throw error;
    }
  }

  /**
   * Get circuit breaker state information for monitoring.
   */
  getState() {
    return {
      state: this.breaker.getState(),
      metrics: this.breaker.getMetrics(),
      fallbackCount: this.fallbackCount,
    };
  }

  /**
   * Reset the circuit breaker (for testing or manual recovery).
   */
  reset(): void {
    this.breaker.reset();
    this.fallbackCount = 0;
  }

  /**
   * Get fallback count.
   */
  getFallbackCount(): number {
    return this.fallbackCount;
  }

  /**
   * Check if currently serving fallback responses.
   */
  isServingFallback(): boolean {
    return this.breaker.getState() === CircuitBreakerState.OPEN;
  }

  /**
   * Get raw circuit breaker instance (for advanced usage).
   */
  getBreaker(): CircuitBreaker<ClaudeApiResponse> {
    return this.breaker;
  }
}

/**
 * Factory function to create a preconfigured circuit breaker client.
 */
export function createCircuitBreakerClaudeClient(
  config?: CircuitBreakerClaudeConfig,
): CircuitBreakerClaudeClient {
  return new CircuitBreakerClaudeClient({
    threshold: config?.threshold ?? 5,
    timeoutMs: config?.timeoutMs ?? 60000,
    halfOpenTimeoutMs: config?.halfOpenTimeoutMs ?? 30000,
    backoffMaxMs: config?.backoffMaxMs ?? 30000,
    enableFallback: config?.enableFallback ?? true,
  });
}
