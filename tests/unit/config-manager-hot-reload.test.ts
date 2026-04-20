/**
 * ConfigManager Tests - Hot-Reload Configuration Support
 *
 * Tests for file watching, validation, rollback, and state consistency
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConfigManager,
  ConfigSnapshot,
  DEFAULT_CONFIG,
  initializeConfigManager,
} from '../../src/config/manager.js';
import { validateConfig } from '../../src/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CONFIG_DIR = path.join(__dirname, '../../.test-config');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'test-config.json');

// Test helper: Create temp config file
function createTestConfigFile(config: any): void {
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Test helper: Clean up
function cleanupTestConfigFile(): void {
  if (fs.existsSync(TEST_CONFIG_FILE)) {
    fs.unlinkSync(TEST_CONFIG_FILE);
  }
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    try {
      fs.rmdirSync(TEST_CONFIG_DIR);
    } catch (e) {
      // Ignore if dir not empty
    }
  }
}

test('ConfigManager - Constructor with default config', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  const config = manager.getConfig();

  assert.strictEqual(config.cacheTtl, DEFAULT_CONFIG.cacheTtl);
  assert.strictEqual(config.rateLimitWindowMs, DEFAULT_CONFIG.rateLimitWindowMs);
  assert.strictEqual(config.rateLimitMaxRequests, DEFAULT_CONFIG.rateLimitMaxRequests);

  manager.destroy();
});

test('ConfigManager - getConfig returns frozen copy', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  const config = manager.getConfig();

  assert.throws(() => {
    (config as any).cacheTtl = 999;
  }, TypeError);

  manager.destroy();
});

test('ConfigManager - reloadConfig with valid config', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const newConfig = {
    cacheTtl: 600000,
    rateLimitWindowMs: 120000,
    rateLimitMaxRequests: 200,
    rateLimitPerConversation: false,
  };

  createTestConfigFile(newConfig);

  try {
    const result = manager.reloadConfig(TEST_CONFIG_FILE);

    assert.deepStrictEqual(result.oldConfig.cacheTtl, DEFAULT_CONFIG.cacheTtl);
    assert.deepStrictEqual(result.newConfig.cacheTtl, newConfig.cacheTtl);

    const currentConfig = manager.getConfig();
    assert.strictEqual(currentConfig.cacheTtl, newConfig.cacheTtl);
    assert.strictEqual(currentConfig.rateLimitMaxRequests, newConfig.rateLimitMaxRequests);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reloadConfig with partial config (merge)', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const partialConfig = {
    cacheTtl: 500000,
    // rateLimitWindowMs not provided — should preserve old value
  };

  createTestConfigFile(partialConfig);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    const currentConfig = manager.getConfig();

    assert.strictEqual(currentConfig.cacheTtl, partialConfig.cacheTtl);
    assert.strictEqual(currentConfig.rateLimitWindowMs, DEFAULT_CONFIG.rateLimitWindowMs);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reloadConfig throws on invalid JSON', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_FILE, 'invalid json {');

  try {
    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    }, Error);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reloadConfig with negative cacheTtl is rejected by validator', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const invalidConfig = {
    cacheTtl: -100, // Invalid: negative
  };

  createTestConfigFile(invalidConfig);

  try {
    // First, set up watcher with validation function
    manager.initializeWatcher({
      filePath: TEST_CONFIG_FILE,
      validateFn: validateConfig,
    });

    // Should throw because validateConfig returns false for negative cacheTtl
    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    }, Error);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - computeChanges tracks differences', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const newConfig = {
    cacheTtl: 999,
    rateLimitWindowMs: 111,
    rateLimitMaxRequests: 222,
    rateLimitPerConversation: false,
  };

  createTestConfigFile(newConfig);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    const history = manager.getReloadHistory();

    assert.ok(history.length > 0);
    const entry = history[0];
    assert.ok(entry.changes);
    assert.ok(entry.changes.cacheTtl);
    assert.ok(entry.changes.rateLimitWindowMs);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reload history tracks operations', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  assert.strictEqual(manager.getReloadHistory().length, 0);

  const config = { cacheTtl: 555555 };
  createTestConfigFile(config);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    const history = manager.getReloadHistory();

    assert.strictEqual(history.length, 1);
    assert.ok(history[0].success);
    assert.ok(history[0].timestamp);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reload history limits to 10 entries', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  // Perform 12 reloads to test max 10 retention
  for (let i = 0; i < 12; i++) {
    const config = { cacheTtl: 100000 + i };
    createTestConfigFile(config);
    try {
      manager.reloadConfig(TEST_CONFIG_FILE);
    } catch (e) {
      // Expected for some iterations
    }
  }

  const history = manager.getReloadHistory();
  assert.ok(history.length <= 10, `History should be max 10, got ${history.length}`);

  cleanupTestConfigFile();
  manager.destroy();
});

test('ConfigManager - reload event emission', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  let reloadEmitted = false;
  let emittedData: any = null;

  manager.on('reload', (data: any) => {
    reloadEmitted = true;
    emittedData = data;
  });

  const config = { cacheTtl: 777777 };
  createTestConfigFile(config);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    assert.ok(reloadEmitted, 'reload event should be emitted');
    assert.ok(emittedData.oldConfig);
    assert.ok(emittedData.newConfig);
    assert.ok(emittedData.changes);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reload error event emission', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  let errorEmitted = false;
  let emittedError: any = null;

  manager.on('reload-error', (error: any) => {
    errorEmitted = true;
    emittedError = error;
  });

  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_FILE, 'bad json');

  try {
    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    });
    assert.ok(errorEmitted, 'reload-error event should be emitted');
    assert.ok(emittedError);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - rollbackConfig reverts to previous state', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  const originalTtl = manager.getConfig().cacheTtl;

  const newConfig = { cacheTtl: 888888 };
  createTestConfigFile(newConfig);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    assert.strictEqual(manager.getConfig().cacheTtl, newConfig.cacheTtl);

    manager.rollbackConfig();
    assert.strictEqual(manager.getConfig().cacheTtl, originalTtl);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - rollbackConfig requires history', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  assert.throws(() => {
    manager.rollbackConfig();
  }, Error);

  manager.destroy();
});

test('ConfigManager - closeWatchers cleanup', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  createTestConfigFile({ cacheTtl: 333333 });

  try {
    manager.initializeWatcher({
      filePath: TEST_CONFIG_FILE,
      validateFn: validateConfig,
    });

    // Should not throw
    manager.closeWatchers();
    assert.ok(true);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - getReloadHistory returns frozen copy', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const config = { cacheTtl: 444444 };
  createTestConfigFile(config);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    const history = manager.getReloadHistory();

    assert.throws(() => {
      (history as any)[0] = {};
    }, TypeError);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - initializeConfigManager creates different instances', () => {
  const config1 = initializeConfigManager();
  const config2 = initializeConfigManager();

  // Should be different instances
  assert.notStrictEqual(config1, config2);

  config1.destroy();
  config2.destroy();
});

test('ConfigManager - state consistency after failed reload + success', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  const originalConfig = manager.getConfig();

  // Set up watcher with validation
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }

  // First: bad config
  fs.writeFileSync(TEST_CONFIG_FILE, '{"cacheTtl": -999}');

  try {
    manager.initializeWatcher({
      filePath: TEST_CONFIG_FILE,
      validateFn: validateConfig,
    });

    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    });

    // State should not have changed
    assert.deepStrictEqual(manager.getConfig(), originalConfig);

    // Second: good config
    const goodConfig = { cacheTtl: 555555 };
    fs.writeFileSync(TEST_CONFIG_FILE, JSON.stringify(goodConfig));

    manager.reloadConfig(TEST_CONFIG_FILE);
    assert.strictEqual(manager.getConfig().cacheTtl, goodConfig.cacheTtl);

    const history = manager.getReloadHistory();
    assert.ok(history.length >= 2);
    assert.strictEqual(history[history.length - 2].success, false);
    assert.strictEqual(history[history.length - 1].success, true);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});

test('ConfigManager - reloadConfig with missing file throws error', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  assert.throws(() => {
    manager.reloadConfig('/nonexistent/path/config.json');
  }, Error);

  manager.destroy();
});

test('ConfigManager - validation function is called during reload', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  let validationCalled = false;
  let validationCalledWith: any = null;

  const config = { cacheTtl: 666666 };
  createTestConfigFile(config);

  try {
    manager.initializeWatcher({
      filePath: TEST_CONFIG_FILE,
      validateFn: (content) => {
        validationCalled = true;
        validationCalledWith = content;
        return validateConfig(content);
      },
    });

    manager.reloadConfig(TEST_CONFIG_FILE);
    assert.ok(validationCalled, 'Validation function should be called');
    assert.ok(validationCalledWith);
  } finally {
    cleanupTestConfigFile();
    manager.destroy();
  }
});
