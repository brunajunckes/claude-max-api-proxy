/**
 * CLI Commands for Metrics Management
 *
 * Provides commands for:
 * - Display metrics snapshots
 * - Export metrics to Prometheus format
 * - Monitor real-time metrics
 * - Configure metrics collection
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { metricsCollector } from '../observability/metrics-collector.js';
import { initializePrometheusExporter } from '../observability/prometheus-exporter.js';

/**
 * Format bytes to human-readable format.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Create metrics command group.
 */
export function createMetricsCommands(): Command {
  const metrics = new Command('metrics').description('Metrics and observability commands');

  /**
   * Show current metrics snapshot.
   */
  metrics.command('show').description('Display current metrics snapshot').action(async () => {
    try {
      const snapshot = metricsCollector.getSnapshot();

      console.log(chalk.bold.cyan('\n=== METRICS SNAPSHOT ===\n'));

      // Counters
      if (Object.keys(snapshot.counters).length > 0) {
        console.log(chalk.yellow('Counters:'));
        for (const [key, value] of Object.entries(snapshot.counters)) {
          console.log(`  ${key}: ${value}`);
        }
        console.log();
      }

      // Gauges
      if (Object.keys(snapshot.gauges).length > 0) {
        console.log(chalk.yellow('Gauges:'));
        for (const [key, value] of Object.entries(snapshot.gauges)) {
          if (key.includes('memory') || key.includes('bytes')) {
            console.log(`  ${key}: ${formatBytes(value as number)}`);
          } else if (key.includes('percent') || key.includes('usage')) {
            console.log(`  ${key}: ${(value as number).toFixed(2)}%`);
          } else {
            console.log(`  ${key}: ${value}`);
          }
        }
        console.log();
      }

      // Histograms
      if (Object.keys(snapshot.histograms).length > 0) {
        console.log(chalk.yellow('Histograms:'));
        for (const [key, hist] of Object.entries(snapshot.histograms)) {
          const h = hist as any;
          console.log(`  ${key}:`);
          console.log(`    count: ${h.count}`);
          console.log(`    sum: ${h.sum}`);
          console.log(`    avg: ${h.avg?.toFixed(2)}`);
          console.log(`    min: ${h.min}`);
          console.log(`    max: ${h.max}`);
          console.log(`    p50: ${h.p50?.toFixed(2)}`);
          console.log(`    p95: ${h.p95?.toFixed(2)}`);
          console.log(`    p99: ${h.p99?.toFixed(2)}`);
        }
        console.log();
      }

      console.log(chalk.green('✓ Metrics snapshot displayed\n'));
    } catch (error) {
      console.error(chalk.red(`Failed to display metrics: ${error}`));
      process.exit(1);
    }
  });

  /**
   * Export metrics in Prometheus format.
   */
  metrics.command('export').description('Export metrics in Prometheus format').action(async () => {
    try {
      console.log(chalk.cyan('Exporting metrics in Prometheus format...\n'));

      // Update system metrics
      metricsCollector.recordCpuUsage();
      metricsCollector.recordMemoryUsage();
      metricsCollector.recordLoadAverage();

      const snapshot = metricsCollector.getSnapshot();
      const lines: string[] = [];

      // Add header
      lines.push('# Prometheus Metrics Export');
      lines.push(`# Timestamp: ${new Date().toISOString()}`);
      lines.push('');

      // Counters
      lines.push('# Counters');
      for (const [key, value] of Object.entries(snapshot.counters)) {
        lines.push(`${key}_total ${value}`);
      }
      lines.push('');

      // Gauges
      lines.push('# Gauges');
      for (const [key, value] of Object.entries(snapshot.gauges)) {
        lines.push(`${key} ${value}`);
      }
      lines.push('');

      // Histograms
      lines.push('# Histograms');
      for (const [key, hist] of Object.entries(snapshot.histograms)) {
        const h = hist as any;
        lines.push(`${key}_count ${h.count ?? 0}`);
        lines.push(`${key}_sum ${h.sum ?? 0}`);
        lines.push(`${key}_avg ${h.avg?.toFixed(2) ?? 0}`);
        lines.push(`${key}_min ${h.min ?? 0}`);
        lines.push(`${key}_max ${h.max ?? 0}`);
        lines.push(`${key}_p50 ${h.p50?.toFixed(2) ?? 0}`);
        lines.push(`${key}_p95 ${h.p95?.toFixed(2) ?? 0}`);
        lines.push(`${key}_p99 ${h.p99?.toFixed(2) ?? 0}`);
      }

      const prometheusText = lines.join('\n');
      console.log(prometheusText);
      console.log('\n' + chalk.green('✓ Metrics exported\n'));
    } catch (error) {
      console.error(chalk.red(`Failed to export metrics: ${error}`));
      process.exit(1);
    }
  });

  /**
   * Start Prometheus exporter server.
   */
  metrics.command('server').description('Start Prometheus metrics server').action(async () => {
    try {
      console.log(chalk.cyan('Starting Prometheus metrics server...\n'));

      const exporter = await initializePrometheusExporter({
        port: 9090,
        host: '0.0.0.0',
      });

      console.log(chalk.green('✓ Prometheus server running at http://0.0.0.0:9090/metrics\n'));

      // Keep server running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nShutting down metrics server...'));
        exporter.stop().then(() => process.exit(0));
      });
    } catch (error) {
      console.error(chalk.red(`Failed to start server: ${error}`));
      process.exit(1);
    }
  });

  /**
   * Monitor metrics in real-time.
   */
  metrics.command('monitor').description('Monitor metrics in real-time').action(async () => {
    try {
      console.log(chalk.cyan('Starting metrics monitor (update every 5s, press Ctrl+C to stop)\n'));

      const monitor = setInterval(() => {
        console.clear();
        console.log(chalk.bold.cyan('=== LIVE METRICS MONITOR ===\n'));

        metricsCollector.recordCpuUsage();
        metricsCollector.recordMemoryUsage();

        const snapshot = metricsCollector.getSnapshot();

        console.log(chalk.yellow('System:'));
        const cpuUsage = snapshot.gauges['system_cpu_usage_percent'];
        const memUsage = snapshot.gauges['system_memory_usage_percent'];
        const heapUsed = snapshot.gauges['process_memory_heap_used_bytes'];

        console.log(`  CPU: ${cpuUsage?.toFixed(2) ?? 0}%`);
        console.log(`  Memory: ${memUsage?.toFixed(2) ?? 0}%`);
        console.log(`  Heap: ${formatBytes(heapUsed ?? 0)}`);

        console.log(chalk.yellow('\nCounters:'));
        const counters = Object.entries(snapshot.counters).slice(0, 5);
        for (const [key, value] of counters) {
          console.log(`  ${key}: ${value}`);
        }

        console.log('\n' + chalk.gray('Updated: ' + new Date().toLocaleTimeString()));
      }, 5000);

      process.on('SIGINT', () => {
        clearInterval(monitor);
        console.log('\n' + chalk.yellow('Monitor stopped\n'));
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red(`Failed to start monitor: ${error}`));
      process.exit(1);
    }
  });

  /**
   * Reset metrics.
   */
  metrics.command('reset').description('Reset all metrics').action(() => {
    try {
      metricsCollector.reset();
      console.log(chalk.green('✓ All metrics reset\n'));
    } catch (error) {
      console.error(chalk.red(`Failed to reset metrics: ${error}`));
      process.exit(1);
    }
  });

  return metrics;
}
