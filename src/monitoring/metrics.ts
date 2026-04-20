/**
 * Metrics Collection for Circuit Breaker and System Monitoring
 *
 * Provides structured metrics collection for:
 * - Circuit breaker state transitions and operations
 * - API call latency and success/failure rates
 * - System health indicators
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
