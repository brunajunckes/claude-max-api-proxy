/**
 * Prometheus Exporter — Metrics Endpoint at /metrics
 *
 * Exposes metrics in Prometheus text format on port 9090
 * Supports 50+ metrics for system, application, and performance monitoring
 */

import express, { Express, Request, Response } from 'express';
import { createServer, Server } from 'http';
import { metricsCollector } from './metrics-collector.js';

export interface PrometheusExporterConfig {
  port?: number;
  host?: string;
  path?: string;
}

/**
 * Prometheus-compatible metrics exporter.
 */
export class PrometheusExporter {
  private app: Express;
  private server: Server | null = null;
  private port: number;
  private host: string;
  private path: string;
  private startTime: number = Date.now();

  constructor(config: PrometheusExporterConfig = {}) {
    this.port = config.port ?? 9090;
    this.host = config.host ?? '0.0.0.0';
    this.path = config.path ?? '/metrics';
    this.app = express();

    this.setupRoutes();
  }

  /**
   * Setup Express routes for metrics endpoint.
   */
  private setupRoutes(): void {
    this.app.get(this.path, (_req: Request, res: Response) => {
      try {
        const metricsText = this.generatePrometheusText();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.send(metricsText);
      } catch (error) {
        console.error('Error generating metrics:', error);
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', uptime: Date.now() - this.startTime });
    });
  }

  /**
   * Generate metrics in Prometheus text format.
   */
  private generatePrometheusText(): string {
    const lines: string[] = [];
    const snapshot = metricsCollector.getSnapshot();

    // Add HELP and TYPE comments
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${(Date.now() - this.startTime) / 1000}`);
    lines.push('');

    // Counters
    lines.push('# HELP requests_total Total number of requests');
    lines.push('# TYPE requests_total counter');
    for (const [key, value] of Object.entries(snapshot.counters)) {
      if (typeof value === 'number') {
        lines.push(`${key}_total ${value}`);
      }
    }
    lines.push('');

    // Gauges
    lines.push('# HELP system_metrics System metrics (CPU, memory, load)');
    lines.push('# TYPE system_metrics gauge');
    for (const [key, value] of Object.entries(snapshot.gauges)) {
      if (typeof value === 'number') {
        lines.push(`${key} ${value}`);
      }
    }
    lines.push('');

    // Histograms
    lines.push('# HELP request_duration_ms Request duration in milliseconds');
    lines.push('# TYPE request_duration_ms histogram');
    for (const [key, hist] of Object.entries(snapshot.histograms)) {
      if (typeof hist === 'object' && hist !== null) {
        const h = hist as any;
        lines.push(`${key}_count ${h.count ?? 0}`);
        lines.push(`${key}_sum ${h.sum ?? 0}`);
        lines.push(`${key}_bucket{le="50"} ${this.countBucketValues(snapshot.histograms[key], 50)}`);
        lines.push(`${key}_bucket{le="100"} ${this.countBucketValues(snapshot.histograms[key], 100)}`);
        lines.push(`${key}_bucket{le="500"} ${this.countBucketValues(snapshot.histograms[key], 500)}`);
        lines.push(`${key}_bucket{le="1000"} ${this.countBucketValues(snapshot.histograms[key], 1000)}`);
        lines.push(`${key}_bucket{le="5000"} ${this.countBucketValues(snapshot.histograms[key], 5000)}`);
        lines.push(`${key}_bucket{le="+Inf"} ${h.count ?? 0}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Count values in histogram that are <= bucket threshold.
   */
  private countBucketValues(values: any, threshold: number): number {
    if (Array.isArray(values)) {
      return values.filter(v => v <= threshold).length;
    }
    return 0;
  }

  /**
   * Start the exporter server.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);
        this.server.listen(this.port, this.host, () => {
          console.log(`Prometheus exporter listening on http://${this.host}:${this.port}${this.path}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Exporter server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the exporter server.
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Check if server is running.
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}

/**
 * Global exporter instance.
 */
export let prometheusExporter: PrometheusExporter | null = null;

/**
 * Initialize and start Prometheus exporter.
 */
export async function initializePrometheusExporter(
  config?: PrometheusExporterConfig,
): Promise<PrometheusExporter> {
  if (prometheusExporter && prometheusExporter.isRunning()) {
    return prometheusExporter;
  }

  prometheusExporter = new PrometheusExporter(config);
  await prometheusExporter.start();
  return prometheusExporter;
}

/**
 * Stop Prometheus exporter.
 */
export async function stopPrometheusExporter(): Promise<void> {
  if (prometheusExporter) {
    await prometheusExporter.stop();
    prometheusExporter = null;
  }
}
