/**
 * Rate Limiting Middleware
 * Per-IP throttling + per-conversation limits
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitConfigInput {
  windowMs?: number; // Time window in ms
  maxRequests?: number; // Max requests per window
  perConversation?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitConfigResolved {
  windowMs: number;
  maxRequests: number;
  perConversation: boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

interface ClientMetric {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private config: RateLimitConfigResolved;
  private clients: Map<string, ClientMetric> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfigInput = {}) {
    this.config = {
      windowMs: config.windowMs ?? 60 * 1000, // 1 min default
      maxRequests: config.maxRequests ?? 100,
      perConversation: config.perConversation !== false,
      skipSuccessfulRequests: config.skipSuccessfulRequests === true,
      skipFailedRequests: config.skipFailedRequests === true,
    };

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private getKey(req: Request): string {
    const ip = req.ip || 'unknown';
    if (this.config.perConversation) {
      const conversationId = (req.body as any)?.conversation_id || 'default';
      return `${ip}:${conversationId}`;
    }
    return ip;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, metric] of this.clients.entries()) {
      if (metric.resetTime < now) {
        this.clients.delete(key);
      }
    }
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();

      let metric = this.clients.get(key);
      if (!metric || metric.resetTime < now) {
        metric = { count: 0, resetTime: now + this.config.windowMs };
        this.clients.set(key, metric);
      }

      metric.count++;

      res.set('X-RateLimit-Limit', String(this.config.maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, this.config.maxRequests - metric.count)));
      res.set('X-RateLimit-Reset', String(metric.resetTime));

      if (metric.count > this.config.maxRequests) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded: ${this.config.maxRequests} requests per ${this.config.windowMs}ms`,
          retryAfter: Math.ceil((metric.resetTime - now) / 1000),
        });
      }

      next();
    };
  }

  destroy() {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = null;
    this.clients.clear();
  }
}

export const createRateLimiter = (config?: RateLimitConfigInput) => new RateLimiter(config);
