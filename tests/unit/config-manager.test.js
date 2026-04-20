/**
 * ConfigManager Tests
 * Tests hot-reload, validation, rollback, and history tracking
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigManager, DEFAULT_CONFIG, initializeConfigManager, getConfigManager, } from "../../src/config/manager.js";
import { validateConfig, getConfigValidationErrors } from "../../src/config/schema.js";
test("ConfigManager - Basic Configuration", async (t) => {
    let configManager;
    let tempDir;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("initializes with default config", async () => {
        const config = configManager.getConfig();
        assert.strictEqual(config.cacheTtl, DEFAULT_CONFIG.cacheTtl);
        assert.strictEqual(config.rateLimitWindowMs, DEFAULT_CONFIG.rateLimitWindowMs);
        assert.strictEqual(config.rateLimitMaxRequests, DEFAULT_CONFIG.rateLimitMaxRequests);
    });
    await t.test("returns frozen config to prevent mutations", async () => {
        const config = configManager.getConfig();
        assert.throws(() => {
            config.cacheTtl = 999;
        });
    });
    await t.test("creates deep copy of config on access", async () => {
        const config1 = configManager.getConfig();
        const config2 = configManager.getConfig();
        assert.notStrictEqual(config1, config2);
        assert.deepStrictEqual(config1, config2);
    });
});
test("ConfigManager - Config File Loading", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("loads valid config from file", async () => {
        const newConfig = {
            cacheTtl: 600000,
            rateLimitWindowMs: 120000,
            rateLimitMaxRequests: 200,
            rateLimitPerConversation: false,
        };
        fs.writeFileSync(configFile, JSON.stringify(newConfig));
        const result = configManager.reloadConfig(configFile);
        assert.strictEqual(result.newConfig.cacheTtl, 600000);
        assert.strictEqual(result.newConfig.rateLimitMaxRequests, 200);
    });
    await t.test("merges partial config with existing values", async () => {
        const partial = {
            cacheTtl: 999,
        };
        fs.writeFileSync(configFile, JSON.stringify(partial));
        const result = configManager.reloadConfig(configFile);
        assert.strictEqual(result.newConfig.cacheTtl, 999);
        assert.strictEqual(result.newConfig.rateLimitWindowMs, DEFAULT_CONFIG.rateLimitWindowMs);
    });
    await t.test("throws on missing config file", async () => {
        assert.throws(() => {
            configManager.reloadConfig("/nonexistent/config.json");
        });
    });
    await t.test("throws on invalid JSON", async () => {
        fs.writeFileSync(configFile, "{ invalid json");
        assert.throws(() => {
            configManager.reloadConfig(configFile);
        });
    });
    await t.test("throws on invalid config object", async () => {
        fs.writeFileSync(configFile, '"just a string"');
        assert.throws(() => {
            configManager.reloadConfig(configFile);
        });
    });
});
test("ConfigManager - Config Validation", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("rejects config with negative cacheTtl", async () => {
        const invalid = { cacheTtl: -1 };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        assert.throws(() => {
            configManager.reloadConfig(configFile);
        });
    });
    await t.test("rejects config with zero rateLimitMaxRequests", async () => {
        const invalid = { rateLimitMaxRequests: 0 };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        assert.throws(() => {
            configManager.reloadConfig(configFile);
        });
    });
    await t.test("validates type constraints", async () => {
        const invalid = { cacheTtl: "not a number" };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        assert.throws(() => {
            configManager.reloadConfig(configFile);
        });
    });
    await t.test("accepts valid partial configs", async () => {
        const valid = { cacheTtl: 500 };
        fs.writeFileSync(configFile, JSON.stringify(valid));
        const result = configManager.reloadConfig(configFile);
        assert.strictEqual(result.newConfig.cacheTtl, 500);
    });
});
test("ConfigManager - Reload History Tracking", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("tracks successful reloads", async () => {
        const newConfig = {
            cacheTtl: 777,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(newConfig));
        configManager.reloadConfig(configFile);
        const history = configManager.getReloadHistory();
        assert.ok(history.length > 0);
        const lastEntry = history[history.length - 1];
        assert.strictEqual(lastEntry.success, true);
        assert.strictEqual(lastEntry.newConfig?.cacheTtl, 777);
    });
    await t.test("tracks failed reloads", async () => {
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        const invalid = { cacheTtl: -1 };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        try {
            configManager.reloadConfig(configFile);
        }
        catch {
            // Expected
        }
        const history = configManager.getReloadHistory();
        assert.ok(history.length > 0);
        const lastEntry = history[history.length - 1];
        assert.strictEqual(lastEntry.success, false);
        assert.ok(lastEntry.error);
    });
    await t.test("computes changes between configs", async () => {
        const newConfig = {
            cacheTtl: 999,
            rateLimitMaxRequests: 500,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(newConfig));
        configManager.reloadConfig(configFile);
        const history = configManager.getReloadHistory();
        const lastEntry = history[history.length - 1];
        assert.ok(lastEntry.changes);
        assert.ok(lastEntry.changes?.cacheTtl);
        assert.ok(lastEntry.changes?.rateLimitMaxRequests);
    });
    await t.test("limits history to last 10 entries", async () => {
        for (let i = 0; i < 15; i++) {
            const config = {
                cacheTtl: 300000 + i,
                rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
                rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
                rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
            };
            fs.writeFileSync(configFile, JSON.stringify(config));
            configManager.reloadConfig(configFile);
        }
        const history = configManager.getReloadHistory();
        assert.ok(history.length <= 10);
    });
    await t.test("returns frozen history array", async () => {
        const newConfig = {
            cacheTtl: 888,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(newConfig));
        configManager.reloadConfig(configFile);
        const history = configManager.getReloadHistory();
        assert.throws(() => {
            history.push({});
        });
    });
});
test("ConfigManager - Rollback Functionality", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("cannot rollback without history", async () => {
        assert.throws(() => {
            configManager.rollbackConfig();
        }, /No reload history available/);
    });
    await t.test("does not rollback after failed reload", async () => {
        const originalConfig = configManager.getConfig();
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        const invalid = { cacheTtl: -1 };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        try {
            configManager.reloadConfig(configFile);
        }
        catch {
            // Expected
        }
        assert.throws(() => {
            configManager.rollbackConfig();
        });
        const currentConfig = configManager.getConfig();
        assert.deepStrictEqual(currentConfig, originalConfig);
    });
});
test("ConfigManager - File Watcher Integration", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("initializes watcher without errors", async () => {
        const validConfig = {
            cacheTtl: 300000,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(validConfig));
        assert.doesNotThrow(() => {
            configManager.initializeWatcher({
                filePath: configFile,
                validateFn: validateConfig,
            });
        });
    });
    await t.test("emits reload event on successful load", async () => {
        const validConfig = {
            cacheTtl: 300000,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(validConfig));
        let eventFired = false;
        configManager.on("reload", (data) => {
            assert.ok(data.oldConfig);
            assert.ok(data.newConfig);
            assert.ok(data.changes);
            eventFired = true;
        });
        configManager.reloadConfig(configFile);
        assert.ok(eventFired);
    });
    await t.test("emits reload-error event on failed load", async () => {
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        const invalid = { cacheTtl: -999 };
        fs.writeFileSync(configFile, JSON.stringify(invalid));
        let errorEmitted = false;
        configManager.on("reload-error", (error) => {
            assert.ok(error);
            errorEmitted = true;
        });
        try {
            configManager.reloadConfig(configFile);
        }
        catch {
            // Expected
        }
        assert.ok(errorEmitted);
    });
    await t.test("closes all watchers on destroy", async () => {
        const validConfig = {
            cacheTtl: 300000,
            rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
            rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
            rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
        };
        fs.writeFileSync(configFile, JSON.stringify(validConfig));
        configManager.initializeWatcher({
            filePath: configFile,
            validateFn: validateConfig,
        });
        assert.doesNotThrow(() => {
            configManager.destroy();
        });
    });
});
test("ConfigManager - Global Functions", async (t) => {
    await t.test("initializes and retrieves global config manager", async () => {
        const mgr = initializeConfigManager();
        assert.ok(mgr);
        assert.strictEqual(getConfigManager(), mgr);
    });
    await t.test("preserves initialization with custom config", async () => {
        const customConfig = {
            cacheTtl: 777777,
            rateLimitWindowMs: 90000,
            rateLimitMaxRequests: 999,
            rateLimitPerConversation: true,
        };
        initializeConfigManager(customConfig);
        const mgr = getConfigManager();
        const config = mgr.getConfig();
        assert.strictEqual(config.cacheTtl, 777777);
        assert.strictEqual(config.rateLimitMaxRequests, 999);
    });
});
test("ConfigManager - Concurrent Reload Handling", async (t) => {
    let configManager;
    let tempDir;
    let configFile;
    await t.beforeEach(async () => {
        configManager = new ConfigManager(DEFAULT_CONFIG);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
        configFile = path.join(tempDir, "config.json");
    });
    await t.afterEach(async () => {
        configManager.destroy();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    await t.test("handles multiple concurrent reloads correctly", async () => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
            const config = {
                cacheTtl: 300000 + i,
                rateLimitWindowMs: DEFAULT_CONFIG.rateLimitWindowMs,
                rateLimitMaxRequests: DEFAULT_CONFIG.rateLimitMaxRequests,
                rateLimitPerConversation: DEFAULT_CONFIG.rateLimitPerConversation,
            };
            fs.writeFileSync(configFile, JSON.stringify(config));
            promises.push(Promise.resolve().then(() => {
                return configManager.reloadConfig(configFile);
            }));
        }
        const results = await Promise.all(promises);
        assert.strictEqual(results.length, 5);
        assert.ok(results.every((r) => r.newConfig));
        const history = configManager.getReloadHistory();
        assert.ok(history.length > 0);
    });
});
test("ConfigManager - Schema Validation", async (t) => {
    await t.test("validates correct schema", async () => {
        const config = {
            cacheTtl: 300,
            rateLimitWindowMs: 1000,
            rateLimitMaxRequests: 100,
            rateLimitPerConversation: true,
        };
        assert.ok(validateConfig(config));
    });
    await t.test("rejects invalid cacheTtl", async () => {
        assert.strictEqual(validateConfig({ cacheTtl: -1 }), false);
        assert.strictEqual(validateConfig({ cacheTtl: "not a number" }), false);
    });
    await t.test("rejects invalid rateLimitWindowMs", async () => {
        assert.strictEqual(validateConfig({ rateLimitWindowMs: 0 }), false);
        assert.strictEqual(validateConfig({ rateLimitWindowMs: "high" }), false);
    });
    await t.test("provides validation error messages", async () => {
        const errors = getConfigValidationErrors({ cacheTtl: -1 });
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("cacheTtl"));
    });
    await t.test("validates hermesPaths if present", async () => {
        const valid = {
            hermesPaths: {
                hermesDir: "/path/to/hermes",
                storageDir: "/path/to/storage",
            },
        };
        assert.ok(validateConfig(valid));
        const invalid = {
            hermesPaths: {
                hermesDir: 123, // Invalid: not a string
            },
        };
        assert.strictEqual(validateConfig(invalid), false);
    });
});
//# sourceMappingURL=config-manager.test.js.map