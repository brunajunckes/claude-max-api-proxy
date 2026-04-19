/**
 * Observability Stack
 * Integrates: OpenTelemetry, Pino logging, Health checks
 */

import { performance } from 'perf_hooks';

export interface MetricSnapshot {
  timestamp: Date;
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
  };
  requests: {
    total: number;
    active: number;
    errors: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
}

class ObservabilityManager {
  private metricsBuffer: MetricSnapshot[] = [];
  private requestMetrics = {
    total: 0,
    active: 0,
    errors: 0,
    latencies: [] as number[]
  };

  recordRequest(latencyMs: number, isError: boolean = false) {
    this.requestMetrics.total++;
    this.requestMetrics.latencies.push(latencyMs);
    if (isError) this.requestMetrics.errors++;

    // Keep only last 10k latencies for percentile calc
    if (this.requestMetrics.latencies.length > 10000) {
      this.requestMetrics.latencies.shift();
    }
  }

  recordActiveRequest(delta: number) {
    this.requestMetrics.active = Math.max(0, this.requestMetrics.active + delta);
  }

  getLatencyPercentile(percentile: number): number {
    const sorted = [...this.requestMetrics.latencies].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[index] || 0;
  }

  getSnapshot(): MetricSnapshot {
    const mem = process.memoryUsage();
    return {
      timestamp: new Date(),
      memory: {
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        external_mb: Math.round(mem.external / 1024 / 1024),
      },
      requests: {
        total: this.requestMetrics.total,
        active: this.requestMetrics.active,
        errors: this.requestMetrics.errors,
      },
      latency: {
        p50: this.getLatencyPercentile(50),
        p95: this.getLatencyPercentile(95),
        p99: this.getLatencyPercentile(99),
      }
    };
  }
}

export const observabilityManager = new ObservabilityManager();
