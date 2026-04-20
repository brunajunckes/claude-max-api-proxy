/**
 * ConfigManager - Hot-Reload Configuration Support
 *
 * Provides file watching, validation, and automatic reload with rollback capability
 * Tracks reload history (last 10 operations)
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

export interface ConfigSnapshot {
  cacheTtl: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitPerConversation: boolean;
  hermesPaths?: {
    hermesDir?: string;
    storageDir?: string;
  };
}

export interface ReloadHistoryEntry {
  timestamp: number;
  success: boolean;
  oldConfig?: ConfigSnapshot;
  newConfig?: ConfigSnapshot;
  changes?: Record<string, { old: any; new: any }>;
  error?: string;
}

interface FileWatcherOptions {
  filePath: string;
  validateFn: (content: unknown) => boolean;
  onReload?: (oldConfig: ConfigSnapshot, newConfig: ConfigSnapshot) => void;
  onError?: (error: Error) => void;
}

export class ConfigManager extends EventEmitter {
  private currentConfig: ConfigSnapshot;
  private configFilePath: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private reloadHistory: ReloadHistoryEntry[] = [];
  private validateFn: (content: unknown) => boolean;
  private onReloadCallback?: (oldConfig: ConfigSnapshot, newConfig: ConfigSnapshot) => void;

  constructor(initialConfig: ConfigSnapshot) {
    super();
    this.currentConfig = JSON.parse(JSON.stringify(initialConfig));
    this.configFilePath = process.env.CONFIG_PATH || "config.json";
    this.validateFn = () => true;
  }

  /**
   * Initialize file watcher for config file
   */
  public initializeWatcher(options: FileWatcherOptions): void {
    this.configFilePath = options.filePath;
    this.validateFn = options.validateFn;
    this.onReloadCallback = options.onReload;

    try {
      const watcher = fs.watch(options.filePath, { persistent: false }, (event, filename) => {
        if (event === "change" && filename) {
          setTimeout(() => this.reloadConfig(), 100); // Debounce
        }
      });

      this.watchers.set(options.filePath, watcher);
      watcher.on("error", (error) => {
        options.onError?.(error);
        this.emit("watch-error", error);
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
    }
  }

  /**
   * Load config from file
   */
  private loadConfigFile(filePath: string): unknown {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error}`);
    }
  }

  /**
   * Merge loaded config with current config
   */
  private mergeConfig(loaded: unknown): ConfigSnapshot {
    if (typeof loaded !== "object" || loaded === null) {
      throw new Error("Invalid config: must be an object");
    }

    const obj = loaded as Record<string, any>;
    return {
      cacheTtl: obj.cacheTtl ?? this.currentConfig.cacheTtl,
      rateLimitWindowMs: obj.rateLimitWindowMs ?? this.currentConfig.rateLimitWindowMs,
      rateLimitMaxRequests: obj.rateLimitMaxRequests ?? this.currentConfig.rateLimitMaxRequests,
      rateLimitPerConversation: obj.rateLimitPerConversation ?? this.currentConfig.rateLimitPerConversation,
      hermesPaths: obj.hermesPaths ?? this.currentConfig.hermesPaths,
    };
  }

  /**
   * Reload config from file or custom path
   * Returns old and new configs if successful, throws on error
   */
  public reloadConfig(customPath?: string): { oldConfig: ConfigSnapshot; newConfig: ConfigSnapshot } {
    const filePath = customPath || this.configFilePath;
    const oldConfig = JSON.parse(JSON.stringify(this.currentConfig));

    try {
      const loaded = this.loadConfigFile(filePath);

      // Validate
      if (!this.validateFn(loaded)) {
        throw new Error("Validation failed for loaded config");
      }

      const newConfig = this.mergeConfig(loaded);

      // Update current config
      this.currentConfig = newConfig;

      // Track reload
      const changes = this.computeChanges(oldConfig, newConfig);
      this.addToHistory({
        timestamp: Date.now(),
        success: true,
        oldConfig,
        newConfig,
        changes,
      });

      // Emit event
      this.emit("reload", { oldConfig, newConfig, changes });
      this.onReloadCallback?.(oldConfig, newConfig);

      return { oldConfig, newConfig };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addToHistory({
        timestamp: Date.now(),
        success: false,
        oldConfig,
        error: errorMsg,
      });

      this.emit("reload-error", error);
      throw error;
    }
  }

  /**
   * Rollback to previous config (only if last operation failed)
   */
  public rollbackConfig(): void {
    if (this.reloadHistory.length === 0) {
      throw new Error("No reload history available");
    }

    const lastEntry = this.reloadHistory[this.reloadHistory.length - 1];
    if (lastEntry.success && lastEntry.oldConfig) {
      this.currentConfig = JSON.parse(JSON.stringify(lastEntry.oldConfig));
      this.emit("rollback", lastEntry.oldConfig);
    } else {
      throw new Error("Cannot rollback: last operation did not succeed");
    }
  }

  /**
   * Get current config snapshot
   */
  public getConfig(): Readonly<ConfigSnapshot> {
    return Object.freeze(JSON.parse(JSON.stringify(this.currentConfig)));
  }

  /**
   * Get reload history (last 10 entries)
   */
  public getReloadHistory(): Readonly<ReloadHistoryEntry[]> {
    return Object.freeze([...this.reloadHistory.slice(-10)]);
  }

  /**
   * Compute changes between two configs
   */
  private computeChanges(
    oldConfig: ConfigSnapshot,
    newConfig: ConfigSnapshot,
  ): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};

    for (const key of Object.keys(newConfig) as (keyof ConfigSnapshot)[]) {
      const oldVal = oldConfig[key];
      const newVal = newConfig[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal, new: newVal };
      }
    }

    return changes;
  }

  /**
   * Add entry to reload history (keep max 10)
   */
  private addToHistory(entry: ReloadHistoryEntry): void {
    this.reloadHistory.push(entry);
    if (this.reloadHistory.length > 10) {
      this.reloadHistory.shift();
    }
  }

  /**
   * Close all watchers
   */
  public closeWatchers(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Destroy manager
   */
  public destroy(): void {
    this.closeWatchers();
    this.removeAllListeners();
  }
}

// Default config values
export const DEFAULT_CONFIG: ConfigSnapshot = {
  cacheTtl: 300000, // 5 min
  rateLimitWindowMs: 60000, // 1 min
  rateLimitMaxRequests: 100,
  rateLimitPerConversation: true,
  hermesPaths: {
    hermesDir: process.env.HERMES_DIR || "/root/.hermes",
    storageDir: process.env.HERMES_STORAGE_DIR || "/root/.hermes/storage",
  },
};

export let configManager = new ConfigManager(DEFAULT_CONFIG);

export function initializeConfigManager(initialConfig?: ConfigSnapshot): ConfigManager {
  configManager = new ConfigManager(initialConfig || DEFAULT_CONFIG);
  return configManager;
}

export function getConfigManager(): ConfigManager {
  return configManager;
}
