/**
 * Response Caching Middleware
 * In-memory cache for models list + configurable TTL
 */

import type { Request, Response, NextFunction } from 'express';
import { tracingManager } from '../monitoring/tracing.js';

export interface CacheConfig {
  ttl: number;
  maxSize: number;
}

class CacheManager {
  private cache = new Map<string, { data: any; expires: number; lastAccessed: number }>();
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(config: CacheConfig = { ttl: 300000, maxSize: 100 }) {
    this.config = config;
  }

  get(key: string, traceId?: string): any | null {
    const startTime = Date.now();
    const entry = this.cache.get(key);

    let status: 'hit' | 'miss' | 'expired' = 'miss';
    let result = null;

    if (!entry) {
      this.misses++;
      status = 'miss';
    } else if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      status = 'expired';
    } else {
      this.hits++;
      status = 'hit';
      result = entry.data;
      // Update lastAccessed for LRU
      entry.lastAccessed = Date.now();
    }

    if (traceId) {
      const durationMs = Date.now() - startTime;
      tracingManager.recordOperationSpan(traceId, 'cache.get', durationMs, {
        key,
        status,
        operation: 'get'
      });
    }

    return result;
  }

  set(key: string, data: any, traceId?: string): void {
    const startTime = Date.now();
    let evicted = false;

    // Evict if adding new key would exceed maxSize
    if (!this.cache.has(key) && this.cache.size >= this.config.maxSize) {
      // Find least recently used (LRU) entry
      let lruKey: string | null = null;
      let lruTime = Infinity;

      for (const [k, v] of this.cache.entries()) {
        if (v.lastAccessed < lruTime) {
          lruTime = v.lastAccessed;
          lruKey = k;
        }
      }

      if (lruKey !== null) {
        this.cache.delete(lruKey);
        this.evictions++;
        evicted = true;
      }
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + this.config.ttl,
      lastAccessed: Date.now()
    });

    if (traceId) {
      const durationMs = Date.now() - startTime;
      tracingManager.recordOperationSpan(traceId, 'cache.set', durationMs, {
        key,
        evicted,
        operation: 'set',
        cacheSize: this.cache.size
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      ttl: this.config.ttl,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: parseFloat(hitRate.toFixed(4)),
      totalRequests: total
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
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

  return (req: Request, res: Response, next: NextFunction) => {
    const traceId = (req as any).traceContext?.traceId;
    const originalJson = res.json;

    res.json = function(data: any) {
      cacheManager.set(cacheKey, data, traceId);
      return originalJson.call(this, data);
    };

    const cached = cacheManager.get(cacheKey, traceId);
    if (cached) {
      return res.json(cached);
    }

    next();
  };
}
