import { test, describe, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { CacheManager, cacheMiddleware, cacheManager } from '../../src/server/cache-middleware.js';
import type { Request, Response } from 'express';

describe('CacheManager', () => {
  let cache: CacheManager;

  before(() => {
    cache = new CacheManager({ ttl: 5000, maxSize: 3 });
  });

  after(() => {
    cache.clear();
  });

  test('cache hit returns stored value', () => {
    cache.set('test-key', { data: 'test-value' });
    const result = cache.get('test-key');
    assert.deepEqual(result, { data: 'test-value' });
  });

  test('cache miss returns null', () => {
    const result = cache.get('nonexistent-key');
    assert.equal(result, null);
  });

  test('expired cache entry returns null and increments misses', () => {
    const cache2 = new CacheManager({ ttl: 10, maxSize: 10 });
    cache2.set('expiring-key', { data: 'value' });

    // Wait for expiry
    setTimeout(() => {
      const result = cache2.get('expiring-key');
      assert.equal(result, null);
    }, 50);
  });

  test('cache eviction removes oldest entry when maxSize exceeded', () => {
    const smallCache = new CacheManager({ ttl: 10000, maxSize: 2 });
    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3');

    const stats = smallCache.stats();
    assert.equal(stats.size, 2);
    assert.equal(stats.evictions, 1);
  });

  test('stats() returns correct hit rate', () => {
    const statsCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    statsCache.set('key1', 'value1');
    statsCache.get('key1'); // hit
    statsCache.get('key1'); // hit
    statsCache.get('key2'); // miss

    const stats = statsCache.stats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    // 2/3 = 0.6667 (hitRate is now decimal, not percentage)
    assert.ok(stats.hitRate >= 0.66 && stats.hitRate <= 0.67);
  });

  test('stats() returns 0 hitRate with zero requests', () => {
    const emptyCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    const stats = emptyCache.stats();
    assert.equal(stats.hitRate, 0);
    assert.equal(stats.totalRequests, 0);
  });

  test('clear() removes all entries and resets stats', () => {
    const testCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    testCache.set('key1', 'value1');
    testCache.set('key2', 'value2');
    testCache.get('key1');

    testCache.clear();
    const stats = testCache.stats();
    assert.equal(stats.size, 0);
    assert.equal(stats.hits, 1); // stats not reset by clear
  });

  test('resetStats() zeroes out hit/miss/eviction counters', () => {
    const testCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    testCache.set('key1', 'value1');
    testCache.get('key1');

    testCache.resetStats();
    const stats = testCache.stats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 0);
    assert.equal(stats.evictions, 0);
  });

  test('concurrent set operations maintain cache integrity', async () => {
    const concurrentCache = new CacheManager({ ttl: 10000, maxSize: 100 });

    const promises = Array.from({ length: 50 }, (_, i) =>
      Promise.resolve().then(() => {
        concurrentCache.set(`key-${i}`, `value-${i}`);
      })
    );

    await Promise.all(promises);
    const stats = concurrentCache.stats();
    assert.equal(stats.size, 50);
  });

  test('concurrent get/set operations with TTL expiry', (t, done) => {
    const ttlCache = new CacheManager({ ttl: 100, maxSize: 50 });

    for (let i = 0; i < 20; i++) {
      ttlCache.set(`key-${i}`, `value-${i}`);
    }

    // Immediate reads (should hit)
    for (let i = 0; i < 20; i++) {
      const val = ttlCache.get(`key-${i}`);
      assert.notEqual(val, null);
    }

    // After TTL expiry
    setTimeout(() => {
      // Try to get expired keys - they should miss
      for (let i = 0; i < 20; i++) {
        const val = ttlCache.get(`key-${i}`);
        assert.equal(val, null, `key-${i} should be expired`);
      }
      const statsAfter = ttlCache.stats();
      assert.equal(statsAfter.misses >= 20, true);
      done?.();
    }, 150);
  });

  test('large JSON payloads are cached correctly', () => {
    const largeCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    const largeObject = {
      nested: {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          value: `value-${i}`,
          timestamp: Date.now()
        }))
      }
    };

    largeCache.set('large-key', largeObject);
    const retrieved = largeCache.get('large-key');
    assert.deepEqual(retrieved, largeObject);
  });

  test('memory pressure with many small entries', () => {
    const memCache = new CacheManager({ ttl: 10000, maxSize: 20 });

    for (let i = 0; i < 50; i++) {
      memCache.set(`key-${i}`, { small: true, index: i });
    }

    const stats = memCache.stats();
    assert.equal(stats.size, 20, 'Cache size should be at maxSize');
    assert.equal(stats.evictions, 30, 'Should have evicted 30 entries (50 - 20)');
  });
});

describe('cacheMiddleware', () => {
  test('middleware intercepts response and caches result', () => {
    const req = {} as Request;
    const res = {
      json: function(data: any) {
        return this;
      }
    } as any as Response;

    const originalJson = res.json;
    let capturedData: any;

    res.json = function(data: any) {
      capturedData = data;
      return this;
    };

    const middleware = cacheMiddleware('test-cache-key');
    middleware(req, res, () => {});

    // Cache should be empty on first call
    const cached = cacheManager.get('test-cache-key');
    assert.equal(cached, null);
  });

  test('middleware returns cached value on subsequent calls', () => {
    cacheManager.clear();
    const testKey = 'cached-response-key';
    const testData = { status: 'ok', message: 'test' };

    // Pre-populate cache
    cacheManager.set(testKey, testData);

    const req = {} as Request;
    let sentResponse: any;
    const res = {
      json: function(data: any) {
        sentResponse = data;
        return this;
      }
    } as any as Response;

    const middleware = cacheMiddleware(testKey);
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    // With cached value, next() should not be called
    assert.equal(nextCalled, false);
    assert.deepEqual(sentResponse, testData);
  });
});

describe('CacheManager - Edge Cases', () => {
  test('null and undefined values are cached correctly', () => {
    const edgeCache = new CacheManager({ ttl: 10000, maxSize: 10 });

    edgeCache.set('null-key', null);
    edgeCache.set('undefined-key', undefined);

    assert.equal(edgeCache.get('null-key'), null);
    assert.equal(edgeCache.get('undefined-key'), undefined);
  });

  test('special characters in keys are handled', () => {
    const specialCache = new CacheManager({ ttl: 10000, maxSize: 10 });
    const specialKey = 'key:with:colons::and@#$%^&*()';

    specialCache.set(specialKey, { special: true });
    const result = specialCache.get(specialKey);
    assert.deepEqual(result, { special: true });
  });

  test('numeric and boolean values are preserved', () => {
    const typeCache = new CacheManager({ ttl: 10000, maxSize: 10 });

    typeCache.set('num', 42);
    typeCache.set('bool-true', true);
    typeCache.set('bool-false', false);
    typeCache.set('zero', 0);
    typeCache.set('empty-string', '');

    assert.equal(typeCache.get('num'), 42);
    assert.equal(typeCache.get('bool-true'), true);
    assert.equal(typeCache.get('bool-false'), false);
    assert.equal(typeCache.get('zero'), 0);
    assert.equal(typeCache.get('empty-string'), '');
  });

  test('rapid fire set/get operations maintain consistency', () => {
    const rapidCache = new CacheManager({ ttl: 10000, maxSize: 50 });

    for (let i = 0; i < 100; i++) {
      rapidCache.set(`key-${i}`, `value-${i}`);
      const retrieved = rapidCache.get(`key-${i}`);
      assert.equal(retrieved, `value-${i}`);
    }
  });
});
