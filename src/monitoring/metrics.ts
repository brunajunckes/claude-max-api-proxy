/**
 * Metrics Collection for Circuit Breaker and System Monitoring
 *
 * Provides structured metrics collection for:
 * - Circuit breaker state transitions and operations
 * - API call latency and success/failure rates
 * - System health indicators
 * - Prometheus-compatible metrics export
 */

import { CircuitBreakerState } from '../lib/circuit-breaker.js';

export interface MetricLabels {
  [key: string]: string | number;
}

export interface CounterMetric {
  type: 'counter';
  value: number;
  labels?: MetricLabels;
}

export interface GaugeMetric {
  type: 'gauge';
  value: number;
  labels?: MetricLabels;
}

export interface HistogramMetric {
  type: 'histogram';
  buckets: Map<number, number>;
  count: number;
  sum: number;
  labels?: MetricLabels;
}

export interface HistogramData {
  buckets: Array<{ le: string; count: number }>;
  sum: number;
  count: number;
  labels?: MetricLabels;
}

export interface SummaryData {
  quantiles: Array<{ q: string; value: number }>;
  sum: number;
  count: number;
  labels?: MetricLabels;
}

/**
 * MetricsCollector for counters, gauges, histograms, and summaries.
 * Supports labels and Prometheus export.
 */
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, { buckets: Map<number, number>; count: number; sum: number; values: number[] }>();
  private summaries = new Map<string, { values: number[]; count: number; sum: number }>();

  /**
   * Increment a counter by delta (default 1).
   */
  incrementCounter(name: string, labels: MetricLabels = {}, delta: number = 1): void {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + delta);
  }

  /**
   * Get counter value.
   */
  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Set gauge value.
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Get gauge value.
   */
  getGauge(name: string, labels: MetricLabels = {}): number | undefined {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key);
  }

  /**
   * Record histogram observation.
   */
  recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key) ?? {
      buckets: new Map(
        [[10, 0], [50, 0], [100, 0], [500, 0], [1000, 0], [5000, 0]]
      ),
      count: 0,
      sum: 0,
      values: []
    };

    histogram.count++;
    histogram.sum += value;
    histogram.values.push(value);

    // Keep last 10k values
    if (histogram.values.length > 10000) {
      histogram.values.shift();
    }

    for (const [bucket, count] of histogram.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, count + 1);
      }
    }

    this.histograms.set(key, histogram);
  }

  /**
   * Get histogram with percentiles.
   */
  getHistogram(name: string, labels: MetricLabels = {}): any {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key);
    if (!histogram) return undefined;

    const sorted = [...histogram.values].sort((a, b) => a - b);
    return {
      count: histogram.count,
      sum: histogram.sum,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0
    };
  }

  /**
   * Record summary observation.
   */
  recordSummary(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    const summary = this.summaries.get(key) ?? { values: [], count: 0, sum: 0 };

    summary.values.push(value);
    summary.count++;
    summary.sum += value;

    // Keep last 10k values
    if (summary.values.length > 10000) {
      summary.values.shift();
      summary.sum -= summary.values[0];
    }

    this.summaries.set(key, summary);
  }

  /**
   * Get summary with stats.
   */
  getSummary(name: string, labels: MetricLabels = {}): any {
    const key = this.getMetricKey(name, labels);
    const summary = this.summaries.get(key);
    if (!summary) return undefined;

    const sorted = [...summary.values].sort((a, b) => a - b);
    return {
      count: summary.count,
      sum: summary.sum,
      avg: summary.sum / summary.count,
      min: Math.min(...summary.values),
      max: Math.max(...summary.values)
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }

  /**
   * Export all metrics.
   */
  exportMetrics(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of this.counters) {
      result[key] = value;
    }

    for (const [key, value] of this.gauges) {
      result[key] = value;
    }

    return result;
  }

  /**
   * Build metric key from name and labels.
   */
  private getMetricKey(name: string, labels: MetricLabels = {}): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelParts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}{${labelParts}}`;
  }
}

/**
 * Prometheus Exporter for metrics.
 */
export class PrometheusExporter {
  private metrics: Array<{ name: string; type: string; value?: number; labels?: MetricLabels; timestamp?: number; data?: any }> = [];

  /**
   * Add counter metric.
   */
  addCounter(name: string, value: number, labels: MetricLabels = {}, timestamp?: number): void {
    this.metrics.push({
      name,
      type: 'counter',
      value,
      labels,
      timestamp
    });
  }

  /**
   * Add gauge metric.
   */
  addGauge(name: string, value: number, labels: MetricLabels = {}, timestamp?: number): void {
    this.metrics.push({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp
    });
  }

  /**
   * Add histogram metric.
   */
  addHistogram(name: string, data: HistogramData): void {
    this.metrics.push({
      name,
      type: 'histogram',
      data
    });
  }

  /**
   * Add summary metric.
   */
  addSummary(name: string, data: SummaryData): void {
    this.metrics.push({
      name,
      type: 'summary',
      data
    });
  }

  /**
   * Export metrics in Prometheus text format.
   */
  export(): string {
    const lines: string[] = [];
    const helpAdded = new Set<string>();

    for (const metric of this.metrics) {
      const { name, type, value, labels, timestamp, data } = metric;

      // Add HELP and TYPE once per metric name
      if (!helpAdded.has(name)) {
        lines.push(`# HELP ${name} Metric ${name}`);
        lines.push(`# TYPE ${name} ${type}`);
        helpAdded.add(name);
      }

      if (type === 'histogram') {
        const histData = data as HistogramData;
        const baseLabels = this.formatLabels(histData.labels);

        // Buckets
        for (const bucket of histData.buckets) {
          const bucketLabels = this.formatLabels({
            ...histData.labels,
            le: bucket.le
          });
          lines.push(`${name}_bucket${bucketLabels} ${bucket.count}${timestamp ? ` ${timestamp}` : ''}`);
        }
        // Sum
        lines.push(`${name}_sum${baseLabels} ${histData.sum}${timestamp ? ` ${timestamp}` : ''}`);
        // Count
        lines.push(`${name}_count${baseLabels} ${histData.count}${timestamp ? ` ${timestamp}` : ''}`);
      } else if (type === 'summary') {
        const summData = data as SummaryData;
        const baseLabels = this.formatLabels(summData.labels);

        // Quantiles
        for (const q of summData.quantiles) {
          const qLabels = this.formatLabels({
            ...summData.labels,
            quantile: q.q
          });
          lines.push(`${name}${qLabels} ${q.value}${timestamp ? ` ${timestamp}` : ''}`);
        }
        // Sum
        lines.push(`${name}_sum${baseLabels} ${summData.sum}${timestamp ? ` ${timestamp}` : ''}`);
        // Count
        lines.push(`${name}_count${baseLabels} ${summData.count}${timestamp ? ` ${timestamp}` : ''}`);
      } else {
        // Counter or Gauge
        const labelStr = this.formatLabels(labels);
        lines.push(`${name}${labelStr} ${value}${timestamp ? ` ${timestamp}` : ''}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format labels for Prometheus output.
   */
  private formatLabels(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const entries = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const escaped = String(v)
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        return `${k}="${escaped}"`;
      });

    return `{${entries.join(',')}}`;
  }

}

/**
 * Metrics Manager for circuit breaker and system monitoring.
 */
class MetricsManager {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, { buckets: Map<number, number>; count: number; sum: number }>();
  private labeledCounters = new Map<string, Map<string, number>>();
  private labeledGauges = new Map<string, Map<string, number>>();

  // Circuit breaker specific metrics
  private circuitbreakerStateChanges: Map<string, number> = new Map();
  private circuitbreakerCurrentState: Map<string, CircuitBreakerState> = new Map();
  private circuitbreakerFailures: Map<string, number> = new Map();
  private circuitbreakerSuccesses: Map<string, number> = new Map();
  private circuitbreakerCallDurations: Map<string, number[]> = new Map();

  // Rate limiter specific metrics
  private ratelimitAllowed: Map<string, number> = new Map();
  private ratelimitDenied: Map<string, number> = new Map();
  private ratelimitBucketTokens: Map<string, number[]> = new Map();

  /**
   * Increment a counter.
   */
  incrementCounter(name: string, delta: number = 1, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + delta);
  }

  /**
   * Set a gauge value.
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Record a histogram value.
   */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key) ?? {
      buckets: new Map(
        [[10, 0], [50, 0], [100, 0], [500, 0], [1000, 0], [5000, 0]],
      ),
      count: 0,
      sum: 0,
    };

    histogram.count++;
    histogram.sum += value;

    for (const [bucket, count] of histogram.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, count + 1);
      }
    }

    this.histograms.set(key, histogram);
  }

  // ==========================================
  // Circuit Breaker Specific Metrics
  // ==========================================

  /**
   * Record circuit breaker state change.
   */
  recordCircuitBreakerStateChange(
    breakerName: string,
    newState: CircuitBreakerState,
  ): void {
    const key = `circuitbreaker_state_change_${newState}`;
    const current = this.circuitbreakerStateChanges.get(key) ?? 0;
    this.circuitbreakerStateChanges.set(key, current + 1);

    // Update current state gauge
    this.circuitbreakerCurrentState.set(breakerName, newState);
  }

  /**
   * Record circuit breaker failure.
   */
  recordCircuitBreakerFailure(breakerName: string): void {
    const current = this.circuitbreakerFailures.get(breakerName) ?? 0;
    this.circuitbreakerFailures.set(breakerName, current + 1);
  }

  /**
   * Record circuit breaker success.
   */
  recordCircuitBreakerSuccess(breakerName: string): void {
    const current = this.circuitbreakerSuccesses.get(breakerName) ?? 0;
    this.circuitbreakerSuccesses.set(breakerName, current + 1);
  }

  /**
   * Record circuit breaker call duration.
   */
  recordCircuitBreakerDuration(breakerName: string, durationMs: number): void {
    const durations = this.circuitbreakerCallDurations.get(breakerName) ?? [];
    durations.push(durationMs);

    // Keep last 1000 durations
    if (durations.length > 1000) {
      durations.shift();
    }

    this.circuitbreakerCallDurations.set(breakerName, durations);
  }

  // ==========================================
  // Rate Limiter Specific Metrics
  // ==========================================

  /**
   * Record rate limit allowed request.
   */
  recordRateLimitAllowed(identifier: string): void {
    const key = `ratelimit_allowed_${identifier}`;
    const current = this.ratelimitAllowed.get(key) ?? 0;
    this.ratelimitAllowed.set(key, current + 1);
  }

  /**
   * Record rate limit denied request.
   */
  recordRateLimitDenied(identifier: string): void {
    const key = `ratelimit_denied_${identifier}`;
    const current = this.ratelimitDenied.get(key) ?? 0;
    this.ratelimitDenied.set(key, current + 1);
  }

  /**
   * Record available tokens in bucket.
   */
  recordRateLimitBucketTokens(identifier: string, tokensAvailable: number): void {
    const key = `ratelimit_bucket_tokens_${identifier}`;
    const tokens = this.ratelimitBucketTokens.get(key) ?? [];
    tokens.push(tokensAvailable);
    // Keep last 100 samples
    if (tokens.length > 100) {
      tokens.shift();
    }
    this.ratelimitBucketTokens.set(key, tokens);
  }

  /**
   * Get rate limiter metrics summary.
   */
  getRateLimiterMetrics() {
    return {
      allowed: Object.fromEntries(this.ratelimitAllowed),
      denied: Object.fromEntries(this.ratelimitDenied),
      bucketTokens: Object.fromEntries(
        Array.from(this.ratelimitBucketTokens.entries()).map(([k, v]) => [
          k,
          { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length },
        ])
      ),
    };
  }

  /**
   * Get circuit breaker metrics summary.
   */
  getCircuitBreakerMetrics(breakerName: string) {
    return {
      state: this.circuitbreakerCurrentState.get(breakerName) ?? CircuitBreakerState.CLOSED,
      stateChanges: this.getCircuitBreakerStateChanges(),
      failures: this.circuitbreakerFailures.get(breakerName) ?? 0,
      successes: this.circuitbreakerSuccesses.get(breakerName) ?? 0,
      callDurations: this.getPercentiles(
        this.circuitbreakerCallDurations.get(breakerName) ?? [],
      ),
    };
  }

  /**
   * Get all circuit breaker state changes.
   */
  private getCircuitBreakerStateChanges() {
    return {
      closed: this.circuitbreakerStateChanges.get('circuitbreaker_state_change_CLOSED') ?? 0,
      open: this.circuitbreakerStateChanges.get('circuitbreaker_state_change_OPEN') ?? 0,
      halfOpen: this.circuitbreakerStateChanges.get(
        'circuitbreaker_state_change_HALF_OPEN',
      ) ?? 0,
    };
  }

  /**
   * Calculate percentiles from durations.
   */
  private getPercentiles(durations: number[]) {
    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get a counter value.
   */
  getCounter(name: string, labels?: MetricLabels): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Get a gauge value.
   */
  getGauge(name: string, labels?: MetricLabels): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key) ?? 0;
  }

  /**
   * Get all metrics as a snapshot.
   */
  getSnapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      circuitbreaker: {
        stateChanges: this.getCircuitBreakerStateChanges(),
        failures: Object.fromEntries(this.circuitbreakerFailures),
        successes: Object.fromEntries(this.circuitbreakerSuccesses),
      },
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.labeledCounters.clear();
    this.labeledGauges.clear();
    this.circuitbreakerStateChanges.clear();
    this.circuitbreakerCurrentState.clear();
    this.circuitbreakerFailures.clear();
    this.circuitbreakerSuccesses.clear();
    this.circuitbreakerCallDurations.clear();
  }

  /**
   * Build a metric key from name and optional labels.
   */
  private getMetricKey(name: string, labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelParts = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}{${labelParts}}`;
  }
}

/**
 * Global metrics manager instance.
 */
export const metricsManager = new MetricsManager();

/**
 * Export helpers for convenience.
 */
export function incrementCounter(name: string, delta?: number, labels?: MetricLabels): void {
  metricsManager.incrementCounter(name, delta, labels);
}

export function setGauge(name: string, value: number, labels?: MetricLabels): void {
  metricsManager.setGauge(name, value, labels);
}

export function recordHistogram(name: string, value: number, labels?: MetricLabels): void {
  metricsManager.recordHistogram(name, value, labels);
}

export function recordCircuitBreakerStateChange(
  breakerName: string,
  state: CircuitBreakerState,
): void {
  metricsManager.recordCircuitBreakerStateChange(breakerName, state);
}

export function recordCircuitBreakerFailure(breakerName: string): void {
  metricsManager.recordCircuitBreakerFailure(breakerName);
}

export function recordCircuitBreakerSuccess(breakerName: string): void {
  metricsManager.recordCircuitBreakerSuccess(breakerName);
}

export function recordCircuitBreakerDuration(breakerName: string, durationMs: number): void {
  metricsManager.recordCircuitBreakerDuration(breakerName, durationMs);
}

export function getCircuitBreakerMetrics(breakerName: string) {
  return metricsManager.getCircuitBreakerMetrics(breakerName);
}

export function getMetricsSnapshot() {
  return metricsManager.getSnapshot();
}

export function resetMetrics(): void {
  metricsManager.reset();
}
