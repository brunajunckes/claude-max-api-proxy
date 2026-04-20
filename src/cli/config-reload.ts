/**
 * CLI Command: reload-config
 *
 * Hot-reload configuration on local or remote server
 * Usage: npm run cli reload-config [--remote <url>] [--config <path>]
 */
import { Command } from "commander";
import fetch from "node-fetch";

const program = new Command();

program
  .name("reload-config")
  .description("Hot-reload configuration without server restart")
  .option("--remote <url>", "Remote server URL (e.g., http://localhost:3000)")
  .option("--config <path>", "Config file path to reload from")
  .action(async (options) => {
    try {
      const remoteUrl = options.remote || "http://localhost:3000";
      const configPath = options.config;

      console.log("[CLI] Starting config reload...");
      console.log(`[CLI] Target: ${remoteUrl}`);
      if (configPath) {
        console.log(`[CLI] Config path: ${configPath}`);
      }

      const payload: Record<string, any> = {};
      if (configPath) {
        payload.configPath = configPath;
      }

      const response = await fetch(`${remoteUrl}/admin/config/reload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Record<string, any>;

      if (!response.ok || !data.success) {
        const error = data.error || { message: "Unknown error" };
        console.error(`[CLI] Reload failed: ${error.message}`);
        process.exit(1);
      }

      console.log("[CLI] Config reload successful!");
      console.log("");
      console.log("Changes:");
      if (data.changes && Object.keys(data.changes).length > 0) {
        for (const [key, change] of Object.entries(data.changes)) {
          console.log(`  ${key}:`);
          console.log(`    old: ${JSON.stringify((change as any).old)}`);
          console.log(`    new: ${JSON.stringify((change as any).new)}`);
        }
      } else {
        console.log("  (no changes)");
      }

      console.log("");
      console.log("Recent history:");
      if (data.history && Array.isArray(data.history)) {
        const recentHistory = data.history.slice(-3);
        for (const entry of recentHistory) {
          const status = entry.success ? "✓" : "✗";
          console.log(`  [${status}] ${entry.timestamp}`);
          if (entry.error) {
            console.log(`      Error: ${entry.error}`);
          } else if (Object.keys(entry.changes || {}).length > 0) {
            console.log(`      Changes: ${Object.keys(entry.changes).join(", ")}`);
          }
        }
      }

      process.exit(0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[CLI] Error: ${msg}`);
      process.exit(1);
    }
  });

export default program;
