/**
 * CLI Display Footer - Real-time status display with metrics
 * Shows memory, CPU, requests, and latency in terminal
 */

import { observabilityManager } from "../monitoring/observability.js";
import { cacheManager } from "./cache-middleware.js";

class CliDisplay {
  private displayInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_MS = 1000;

  start(): void {
    if (this.displayInterval) return;

    this.displayInterval = setInterval(() => {
      this.renderFooter();
    }, this.REFRESH_MS);
  }

  stop(): void {
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
      this.displayInterval = null;
    }
  }

  private renderFooter(): void {
    const snapshot = observabilityManager.getSnapshot();
    const { memory, cpu, requests, latency } = snapshot;

    // Clear line and render footer
    process.stdout.write("\r" + this.formatFooter(memory, cpu, requests, latency) + "                ");
  }

  private formatFooter(
    memory: any,
    cpu: any,
    requests: any,
    latency: any
  ): string {
    const memPercent = Math.round(
      (memory.heap_used_mb / memory.heap_total_mb) * 100
    );

    const cacheStats = cacheManager.stats();
    const cacheHitRate = cacheStats.hitRate.toFixed(1);

    const parts = [
      `MEM: ${memory.heap_used_mb}/${memory.heap_total_mb}MB (${memPercent}%)`,
      `CPU: ${cpu.percent.toFixed(1)}%`,
      `REQ: ${requests.total}(${requests.active} active)`,
      `ERR: ${requests.errors}`,
      `LAT: p50=${latency.p50.toFixed(0)}ms p95=${latency.p95.toFixed(0)}ms`,
      `CACHE: ${cacheHitRate}% hit rate`,
    ];

    return `[${new Date().toLocaleTimeString()}] ${parts.join(" | ")}`;
  }

  renderOnce(): void {
    const snapshot = observabilityManager.getSnapshot();
    const { memory, cpu, requests, latency } = snapshot;
    console.log("\n" + this.formatFooter(memory, cpu, requests, latency));
  }

  renderBox(
    port: number,
    host: string = "127.0.0.1"
  ): void {
    const snapshot = observabilityManager.getSnapshot();
    const { memory, cpu, requests, latency } = snapshot;
    const cacheStats = cacheManager.stats();

    const line = "─".repeat(80);
    console.log(`
┌${line}┐
│ Claude Code CLI Provider Status                                              │
├${line}┤
│ Server: http://${host}:${port}                                              │
│ Endpoint: http://${host}:${port}/v1/chat/completions                          │
├${line}┤
│ Memory: ${memory.heap_used_mb}/${memory.heap_total_mb}MB (${Math.round((memory.heap_used_mb / memory.heap_total_mb) * 100)}%)                                                         │
│ CPU: ${cpu.percent.toFixed(1)}%  (User: ${cpu.user_ms}ms, System: ${cpu.system_ms}ms)                          │
│ Requests: ${requests.total} total, ${requests.active} active, ${requests.errors} errors                             │
│ Latency: p50=${latency.p50.toFixed(0)}ms, p95=${latency.p95.toFixed(0)}ms, p99=${latency.p99.toFixed(0)}ms                   │
│ Cache: ${cacheStats.hitRate.toFixed(1)}% hit rate (${cacheStats.hits}/${cacheStats.totalRequests})                                    │
├${line}┤
│ Press Ctrl+C to stop                                                         │
└${line}┘
    `);
  }
}

export const cliDisplay = new CliDisplay();
