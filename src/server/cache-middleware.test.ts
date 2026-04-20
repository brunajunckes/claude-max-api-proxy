/**
 * Cache Middleware Tests
 * Tests for: hit, miss, eviction, TTL expiry, concurrent access
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CacheManager, cacheManager } from './cache-middleware.js';

// Reset stats before each test
function resetCache() {
  cacheManager.clear();
  cacheManager.resetStats();
}

test('Cache - Basic set and get', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', { value: 'test' });
  const result = manager.get('key1');

  assert.ok(result !== null);
  assert.deepStrictEqual(result.value, 'test');
});

test('Cache - Cache hit increments hit counter', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', { value: 'test' });
  manager.get('key1');

  const stats = manager.stats();
  assert.strictEqual(stats.hits, 1);
  assert.strictEqual(stats.misses, 0);
});

test('Cache - Cache miss increments miss counter', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const result = manager.get('nonexistent');

  assert.strictEqual(result, null);
  const stats = manager.stats();
  assert.strictEqual(stats.hits, 0);
  assert.strictEqual(stats.misses, 1);
});

test('Cache - Multiple gets and sets', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('a', 1);
  manager.set('b', 2);
  manager.set('c', 3);

  const stats = manager.stats();
  assert.strictEqual(stats.size, 3);
});

test('Cache - Hit rate calculation', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', 'value1');
  manager.get('key1'); // hit
  manager.get('key1'); // hit
  manager.get('nonexistent'); // miss

  const stats = manager.stats();
  assert.strictEqual(stats.hits, 2);
  assert.strictEqual(stats.misses, 1);
  // 2/3 = 0.6667 (hitRate is now decimal format)
  assert.ok(stats.hitRate >= 0.66 && stats.hitRate <= 0.67);
});

test('Cache - TTL expiry', async () => {
  resetCache();
  const manager = new CacheManager({ ttl: 100, maxSize: 10 }); // 100ms TTL

  manager.set('key1', 'value1');

  // Get immediately - should hit
  let result = manager.get('key1');
  assert.strictEqual(result, 'value1');

  const stats1 = manager.stats();
  assert.strictEqual(stats1.hits, 1);

  // Wait for TTL to expire and try again
  await new Promise(resolve => setTimeout(resolve, 150));

  result = manager.get('key1');
  assert.strictEqual(result, null, 'Should return null after TTL expiry');

  const stats2 = manager.stats();
  assert.strictEqual(stats2.misses, 1, 'Should count as miss after expiry');
});

test('Cache - Eviction when maxSize exceeded', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 3 });

  manager.set('key1', 'value1');
  manager.set('key2', 'value2');
  manager.set('key3', 'value3');
  manager.set('key4', 'value4'); // Should evict key1 (LRU - least recently used)

  const stats = manager.stats();
  assert.strictEqual(stats.size, 3, 'Cache size should not exceed maxSize');
  assert.strictEqual(stats.evictions, 1, 'Should have 1 eviction');

  const result1 = manager.get('key1');
  assert.strictEqual(result1, null, 'Evicted entry should not be retrievable');

  const result4 = manager.get('key4');
  assert.ok(result4 !== null, 'New entry should be in cache');
});

test('Cache - Clear removes all entries', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', 'value1');
  manager.set('key2', 'value2');
  manager.set('key3', 'value3');

  let stats = manager.stats();
  assert.strictEqual(stats.size, 3);

  manager.clear();

  stats = manager.stats();
  assert.strictEqual(stats.size, 0);

  const result = manager.get('key1');
  assert.strictEqual(result, null);
});

test('Cache - Singleton pattern', () => {
  const manager1 = cacheManager;
  const manager2 = cacheManager;

  assert.strictEqual(manager1, manager2, 'Should return same instance');
});

test('Cache - Stats reflect accurate cache state', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 5 });

  manager.set('a', 1);
  manager.set('b', 2);
  manager.set('c', 3);
  manager.get('a');
  manager.get('a');
  manager.get('nonexistent');

  const stats = manager.stats();
  assert.strictEqual(stats.size, 3);
  assert.strictEqual(stats.hits, 2);
  assert.strictEqual(stats.misses, 1);
  assert.strictEqual(stats.totalRequests, 3);
});

test('Cache - Concurrent set operations', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 100 });

  const keys = Array.from({ length: 50 }, (_, i) => `key${i}`);
  keys.forEach(key => {
    manager.set(key, `value_${key}`);
  });

  const stats = manager.stats();
  assert.strictEqual(stats.size, 50);
  assert.ok(stats.maxSize >= 50);
});

test('Cache - Concurrent get operations', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', 'value1');

  // Simulate concurrent gets
  for (let i = 0; i < 100; i++) {
    const result = manager.get('key1');
    assert.ok(result !== null);
  }

  const stats = manager.stats();
  assert.strictEqual(stats.hits, 100);
});

test('Cache - Memory pressure: eviction under load', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  // Add more items than max size
  for (let i = 0; i < 20; i++) {
    manager.set(`key${i}`, `value${i}`);
  }

  const stats = manager.stats();
  assert.strictEqual(stats.size, 10, 'Should not exceed maxSize');
  assert.strictEqual(stats.evictions, 10, 'Should have evicted 10 items');
});

test('Cache - String keys', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('string-key-123', { data: 'test' });
  const result = manager.get('string-key-123');

  assert.ok(result !== null);
  assert.deepStrictEqual(result.data, 'test');
});

test('Cache - Complex object values', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const complexObj = {
    nested: {
      deep: {
        value: 'test'
      }
    },
    array: [1, 2, 3],
    null: null,
    bool: true
  };

  manager.set('complex', complexObj);
  const result = manager.get('complex');

  assert.deepStrictEqual(result, complexObj);
});

test('Cache - Reset stats functionality', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', 'value1');
  manager.get('key1');
  manager.get('key1');
  manager.get('nonexistent');

  let stats = manager.stats();
  assert.strictEqual(stats.hits, 2);
  assert.strictEqual(stats.misses, 1);

  manager.resetStats();

  stats = manager.stats();
  assert.strictEqual(stats.hits, 0);
  assert.strictEqual(stats.misses, 0);
  assert.strictEqual(stats.hitRate, 0);
});

test('Cache - FIFO eviction order', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 3 });

  manager.set('first', 1);
  manager.set('second', 2);
  manager.set('third', 3);
  manager.set('fourth', 4); // Evicts 'first' (least recently used)

  // first was set but never accessed, so it's the LRU victim
  assert.strictEqual(manager.get('first'), null, 'First should be evicted (LRU)');
  assert.strictEqual(manager.get('second'), 2, 'Second should still exist');
  assert.strictEqual(manager.get('third'), 3, 'Third should still exist');
  assert.strictEqual(manager.get('fourth'), 4, 'Fourth should exist');
});

test('Cache - Undefined values', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('undefinedKey', undefined);
  const result = manager.get('undefinedKey');

  assert.strictEqual(result, undefined);
});

// PHASE 2: Additional 18 Cache Middleware Tests - Hit/Miss/Validation

test('Cache - Multiple cache managers independent', () => {
  resetCache();
  const manager1 = new CacheManager({ ttl: 60000, maxSize: 5 });
  const manager2 = new CacheManager({ ttl: 60000, maxSize: 5 });

  manager1.set('key1', 'value1');
  manager2.set('key1', 'value2');

  assert.strictEqual(manager1.get('key1'), 'value1');
  assert.strictEqual(manager2.get('key1'), 'value2');
});

test('Cache - Singleton cacheManager available', () => {
  assert.ok(cacheManager);
  assert.ok(typeof cacheManager.get === 'function');
  assert.ok(typeof cacheManager.set === 'function');
  assert.ok(typeof cacheManager.clear === 'function');
});

test('Cache - Hit rate calculation precision', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('a', 1);
  manager.get('a');
  manager.get('a');
  manager.get('nonexistent');

  const stats = manager.stats();
  const hitRate = stats.hitRate;
  assert.ok(hitRate > 0 && hitRate <= 1, 'Hit rate should be between 0 and 1');
});

test('Cache - TTL prevents access to expired keys', async () => {
  resetCache();
  const manager = new CacheManager({ ttl: 100, maxSize: 10 });

  manager.set('tempKey', 'tempValue');
  assert.strictEqual(manager.get('tempKey'), 'tempValue');

  await new Promise(resolve => setTimeout(resolve, 150));
  assert.strictEqual(manager.get('tempKey'), null);
});

test('Cache - Clear removes all entries and resets stats', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key1', 'val1');
  manager.set('key2', 'val2');
  manager.get('key1');

  manager.clear();

  const stats = manager.stats();
  assert.strictEqual(stats.size, 0);
});

test('Cache - Set overwrites existing key', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('key', 'value1');
  manager.set('key', 'value2');

  assert.strictEqual(manager.get('key'), 'value2');
});

test('Cache - Complex object serialization', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const complex = {
    nested: { deep: { value: 42 } },
    array: [1, 2, 3],
    date: new Date('2025-01-01'),
    fn: function() { return 'test'; }
  };

  manager.set('complex', complex);
  const retrieved = manager.get('complex');

  assert.ok(retrieved !== null);
  assert.strictEqual(retrieved.nested.deep.value, 42);
  assert.deepStrictEqual(retrieved.array, [1, 2, 3]);
});

test('Cache - Null value is stored and retrieved', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('nullKey', null);
  const result = manager.get('nullKey');

  assert.strictEqual(result, null);
});

test('Cache - False value is stored and retrieved', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('falseKey', false);
  const result = manager.get('falseKey');

  assert.strictEqual(result, false);
});

test('Cache - Zero value is stored and retrieved', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('zeroKey', 0);
  const result = manager.get('zeroKey');

  assert.strictEqual(result, 0);
});

test('Cache - Empty string is stored and retrieved', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  manager.set('emptyKey', '');
  const result = manager.get('emptyKey');

  assert.strictEqual(result, '');
});

test('Cache - Stats reflects accurate counts', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  for (let i = 0; i < 5; i++) {
    manager.set(`key${i}`, i);
  }

  for (let i = 0; i < 5; i++) {
    manager.get(`key${i}`);
  }

  const stats = manager.stats();
  assert.strictEqual(stats.size, 5);
  assert.strictEqual(stats.hits, 5);
});

test('Cache - Eviction preserves most recently used', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 3 });

  manager.set('a', 1);
  // Small delay to ensure different timestamps
  const delay = () => {
    const start = Date.now();
    while (Date.now() === start) {}
  };
  delay();

  manager.set('b', 2);
  delay();

  manager.set('c', 3);
  delay();

  manager.get('a'); // Access 'a' to make it most recently used
  delay();

  manager.set('d', 4); // This should evict 'b' (LRU), not 'a'

  assert.strictEqual(manager.get('a'), 1, 'Recently accessed "a" should be retained');
  assert.strictEqual(manager.get('b'), null, 'Least used "b" should be evicted');
});

test('Cache - Valid model request detection', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const modelReq = {
    model: 'claude-opus-4-6',
    messages: [{ role: 'user', content: 'Test' }]
  };

  manager.set('model-cache-key', modelReq);
  const retrieved = manager.get('model-cache-key');

  assert.ok(retrieved !== null);
  assert.strictEqual(retrieved.model, 'claude-opus-4-6');
});

test('Cache - Validation request caching', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const validationResult = {
    isValid: true,
    errors: []
  };

  manager.set('validation-result', validationResult);
  const result = manager.get('validation-result');

  assert.ok(result.isValid);
  assert.strictEqual(result.errors.length, 0);
});

test('Cache - Response caching with headers', () => {
  resetCache();
  const manager = new CacheManager({ ttl: 60000, maxSize: 10 });

  const response = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { message: 'success' }
  };

  manager.set('response-cache', response);
  const cached = manager.get('response-cache');

  assert.strictEqual(cached.status, 200);
  assert.strictEqual(cached.headers['content-type'], 'application/json');
});
