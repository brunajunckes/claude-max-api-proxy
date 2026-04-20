/**
 * Observability Index — Unified Metrics & Prometheus Export
 *
 * Central export for all observability components:
 * - Metrics collection (CPU, memory, latency, throughput)
 * - Prometheus exporter (/metrics endpoint on :9090)
 * - Timer utilities with decorators
 */

export { MetricsCollector, metricsCollector } from './metrics-collector.js';
export type { HistogramSnapshot, MetricPoint, MetricSnapshot } from './metrics-collector.js';

export {
  PrometheusExporter,
  initializePrometheusExporter,
  stopPrometheusExporter,
  prometheusExporter,
} from './prometheus-exporter.js';
export type { PrometheusExporterConfig } from './prometheus-exporter.js';

export {
  TimerContext,
  createTimer,
  timed,
  timedAsync,
  measureLatency,
  measureLatencyAsync,
  BatchTimer,
  ThroughputTracker,
  requestTimerMiddleware,
} from './timer-utils.js';
export type { TimerResult } from './timer-utils.js';
