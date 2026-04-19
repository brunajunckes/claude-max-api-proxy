import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cacheManager, CacheManager } from './cache-middleware.js';

test('CacheManager stores and retrieves values', () => {
  const mgr = new CacheManager();
  mgr.set('test-key', { value: 'test-data' });
  const result = mgr.get('test-key');
  assert.deepEqual(result, { value: 'test-data' });
});

test('CacheManager returns null for missing keys', () => {
  const mgr = new CacheManager();
  const result = mgr.get('nonexistent');
  assert.equal(result, null);
});

test('CacheManager respects maxSize limit', () => {
  const mgr = new CacheManager({ ttl: 300000, maxSize: 2 });
  mgr.set('key1', 'value1');
  mgr.set('key2', 'value2');
  mgr.set('key3', 'value3');

  const stats = mgr.stats();
  assert(stats.size <= stats.maxSize);
});

test('CacheManager.clear() removes all entries', () => {
  const mgr = new CacheManager();
  mgr.set('key1', 'value1');
  mgr.set('key2', 'value2');
  mgr.clear();

  assert.equal(mgr.get('key1'), null);
  assert.equal(mgr.get('key2'), null);
});

test('CacheManager.stats() reports size', () => {
  const mgr = new CacheManager({ ttl: 300000, maxSize: 50 });
  mgr.set('key', 'value');

  const stats = mgr.stats();
  assert.equal(stats.size, 1);
  assert.equal(stats.maxSize, 50);
  assert.equal(stats.ttl, 300000);
});

test('cacheManager singleton is available', () => {
  assert(cacheManager !== undefined);
  assert(typeof cacheManager.get === 'function');
  assert(typeof cacheManager.set === 'function');
});
