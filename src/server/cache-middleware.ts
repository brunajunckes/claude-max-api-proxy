/**
 * Response Caching Middleware
 * In-memory cache for models list + configurable TTL
 */

import type { Request, Response, NextFunction } from 'express';

export interface CacheConfig {
  ttl: number;
  maxSize: number;
}

class CacheManager {
  private cache = new Map<string, { data: any; expires: number }>();
  private config: CacheConfig;

  constructor(config: CacheConfig = { ttl: 300000, maxSize: 100 }) {
    this.config = config;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: any): void {
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + this.config.ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      ttl: this.config.ttl
    };
  }
}

export const cacheManager = new CacheManager();
export { CacheManager };

export function cacheMiddleware(
  cacheKey: string,
  ttl?: number
) {
  if (ttl) {
    cacheManager['config'].ttl = ttl;
  }

  return (_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;

    res.json = function(data: any) {
      cacheManager.set(cacheKey, data);
      return originalJson.call(this, data);
    };

    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    next();
  };
}
