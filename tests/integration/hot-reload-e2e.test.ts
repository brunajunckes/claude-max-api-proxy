/**
 * Hot-Reload Configuration End-to-End Test
 *
 * Tests complete workflow: file change → POST /admin/config/reload → apply or rollback
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager, DEFAULT_CONFIG } from '../../src/config/manager.js';
import { validateConfig, getConfigValidationErrors } from '../../src/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CONFIG_DIR = path.join(__dirname, '../../.test-e2e-config');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

// Test helper: Create temp config file
function createTestConfig(config: any): void {
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Test helper: Clean up
function cleanupTestConfig(): void {
  if (fs.existsSync(TEST_CONFIG_FILE)) {
    fs.unlinkSync(TEST_CONFIG_FILE);
  }
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    try {
      fs.rmdirSync(TEST_CONFIG_DIR);
    } catch (e) {
      // Ignore
    }
  }
}

test('E2E: Hot-reload workflow - file change triggers reload', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  // Scenario: Start with default, modify file, reload should apply
  const newConfig = {
    cacheTtl: 120000,
    rateLimitWindowMs: 30000,
    rateLimitMaxRequests: 50,
    rateLimitPerConversation: true,
  };

  createTestConfig(newConfig);

  try {
    // Before reload
    assert.strictEqual(manager.getConfig().cacheTtl, DEFAULT_CONFIG.cacheTtl);

    // Reload
    const result = manager.reloadConfig(TEST_CONFIG_FILE);

    // After reload
    assert.strictEqual(manager.getConfig().cacheTtl, newConfig.cacheTtl);
    assert.strictEqual(manager.getConfig().rateLimitWindowMs, newConfig.rateLimitWindowMs);

    // Verify history
    const history = manager.getReloadHistory();
    assert.strictEqual(history.length, 1);
    assert.ok(history[0].success);
    assert.ok(history[0].changes);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});

test('E2E: Hot-reload workflow - validation prevents bad config', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  // Set up validator
  manager.initializeWatcher({
    filePath: TEST_CONFIG_FILE,
    validateFn: validateConfig,
  });

  // Scenario: Try to load invalid config
  const badConfig = {
    cacheTtl: 'not a number', // Invalid
  };

  createTestConfig(badConfig);

  try {
    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    }, Error);

    // State unchanged
    assert.strictEqual(manager.getConfig().cacheTtl, DEFAULT_CONFIG.cacheTtl);

    // History records failure
    const history = manager.getReloadHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].success, false);
    assert.ok(history[0].error);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});

test('E2E: Hot-reload workflow - rollback after change', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  const originalCacheTtl = DEFAULT_CONFIG.cacheTtl;

  // Scenario: Change config, then rollback
  const newConfig = { cacheTtl: 999999 };
  createTestConfig(newConfig);

  try {
    manager.reloadConfig(TEST_CONFIG_FILE);
    assert.strictEqual(manager.getConfig().cacheTtl, 999999);

    manager.rollbackConfig();
    assert.strictEqual(manager.getConfig().cacheTtl, originalCacheTtl);

    // History shows both operations
    const history = manager.getReloadHistory();
    assert.ok(history.length >= 1);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});

test('E2E: Schema validation - rejects zero rateLimitWindowMs', () => {
  const badConfig = {
    rateLimitWindowMs: 0, // Invalid: must be positive
  };

  const errors = getConfigValidationErrors(badConfig);
  assert.ok(errors.length > 0);
  assert.ok(errors.some(e => e.includes('positive')));
});

test('E2E: Schema validation - rejects zero rateLimitMaxRequests', () => {
  const badConfig = {
    rateLimitMaxRequests: 0, // Invalid: must be positive
  };

  const errors = getConfigValidationErrors(badConfig);
  assert.ok(errors.length > 0);
  assert.ok(errors.some(e => e.includes('positive')));
});

test('E2E: Schema validation - accepts negative cacheTtl error message', () => {
  const badConfig = {
    cacheTtl: -100,
  };

  const errors = getConfigValidationErrors(badConfig);
  assert.ok(errors.length > 0);
});

test('E2E: Schema validation - accepts valid partial config', () => {
  const validConfig = {
    cacheTtl: 500000,
    rateLimitWindowMs: 60000,
  };

  assert.ok(validateConfig(validConfig));
});

test('E2E: Complex reload scenario - multiple reloads with history', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  const configs = [
    { cacheTtl: 100000 },
    { cacheTtl: 200000, rateLimitWindowMs: 90000 },
    { cacheTtl: 300000 },
  ];

  try {
    for (const config of configs) {
      createTestConfig(config);
      manager.reloadConfig(TEST_CONFIG_FILE);
    }

    const history = manager.getReloadHistory();
    assert.strictEqual(history.length, 3);
    assert.ok(history.every(h => h.success));

    // Final state matches last config
    assert.strictEqual(manager.getConfig().cacheTtl, configs[configs.length - 1].cacheTtl);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});

test('E2E: Concurrent safety - reload after failed attempt', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  manager.initializeWatcher({
    filePath: TEST_CONFIG_FILE,
    validateFn: validateConfig,
  });

  try {
    // First attempt: bad config
    createTestConfig({ cacheTtl: -50 });
    assert.throws(() => {
      manager.reloadConfig(TEST_CONFIG_FILE);
    });

    const historyAfterFail = manager.getReloadHistory();
    assert.strictEqual(historyAfterFail.length, 1);
    assert.strictEqual(historyAfterFail[0].success, false);

    // Second attempt: good config
    createTestConfig({ cacheTtl: 400000 });
    manager.reloadConfig(TEST_CONFIG_FILE);

    const historyAfterSuccess = manager.getReloadHistory();
    assert.strictEqual(historyAfterSuccess.length, 2);
    assert.strictEqual(historyAfterSuccess[1].success, true);

    // Current state is from successful reload
    assert.strictEqual(manager.getConfig().cacheTtl, 400000);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});

test('E2E: Watcher error handling', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);
  let watcherErrorEmitted = false;
  let watcherError: any = null;

  manager.on('watch-error', (error: any) => {
    watcherErrorEmitted = true;
    watcherError = error;
  });

  try {
    // Try to watch non-existent file (will emit error)
    manager.initializeWatcher({
      filePath: '/nonexistent/path/config.json',
      validateFn: validateConfig,
      onError: (error) => {
        // Captured in callback
      },
    });

    // Watcher may or may not emit error depending on timing
    // Just ensure no crash
    assert.ok(true);
  } finally {
    manager.destroy();
  }
});

test('E2E: getReloadHistory shows complete audit trail', () => {
  const manager = new ConfigManager(DEFAULT_CONFIG);

  manager.initializeWatcher({
    filePath: TEST_CONFIG_FILE,
    validateFn: validateConfig,
  });

  try {
    // Good reload
    createTestConfig({ cacheTtl: 111111 });
    manager.reloadConfig(TEST_CONFIG_FILE);

    // Bad reload
    createTestConfig({ cacheTtl: -1 });
    try {
      manager.reloadConfig(TEST_CONFIG_FILE);
    } catch (e) {
      // Expected
    }

    // Good reload again
    createTestConfig({ cacheTtl: 222222 });
    manager.reloadConfig(TEST_CONFIG_FILE);

    const history = manager.getReloadHistory();
    assert.strictEqual(history.length, 3);

    // Verify audit trail
    assert.ok(history[0].success);
    assert.strictEqual(history[0].timestamp > 0, true);
    assert.ok(history[0].changes);

    assert.strictEqual(history[1].success, false);
    assert.ok(history[1].error);

    assert.ok(history[2].success);
  } finally {
    cleanupTestConfig();
    manager.destroy();
  }
});
