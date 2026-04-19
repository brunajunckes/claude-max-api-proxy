import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cacheManager } from './cache-middleware.js';

test('CacheManager stores and retrieves values', () => {
  cacheManager.set('test-key', { value: 'test-data' });
  const result = cacheManager.get('test-key');
  assert.deepEqual(result, { value: 'test-data' });
});

test('CacheManager returns null for expired entries', (t) => {
  t.setTimeout(1100);
  const manager = new (cacheManager.constructor)({ ttl: 500, maxSize: 10 });
  manager.set('expiring-key', { value: 'data' });

  assert(manager.get('expiring-key') !== null);

  setTimeout(() => {
    const expired = manager.get('expiring-key');
    assert.equal(expired, null);
  }, 600);
});

test('CacheManager respects maxSize limit', () => {
  const manager = new (cacheManager.constructor)({ ttl: 300000, maxSize: 2 });
  manager.set('key1', 'value1');
  manager.set('key2', 'value2');
  manager.set('key3', 'value3');

  const stats = manager.stats();
  assert(stats.size <= stats.maxSize);
});

test('CacheManager.clear() removes all entries', () => {
  cacheManager.set('key1', 'value1');
  cacheManager.set('key2', 'value2');
  cacheManager.clear();

  assert.equal(cacheManager.get('key1'), null);
  assert.equal(cacheManager.get('key2'), null);
});

test('CacheManager.stats() reports size', () => {
  const manager = new (cacheManager.constructor)({ ttl: 300000, maxSize: 50 });
  manager.set('key', 'value');

  const stats = manager.stats();
  assert.equal(stats.size, 1);
  assert.equal(stats.maxSize, 50);
  assert.equal(stats.ttl, 300000);
});
