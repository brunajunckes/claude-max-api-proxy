/**
 * Observability Framework — Story 010
 * Central index for monitoring and metrics collection
 */

// Existing modules
export { tracingManager, TracingManager } from './tracing.js';
export type { TraceContext, SpanEvent } from './tracing.js';

export { observabilityManager } from './observability.js';
export type { MetricSnapshot } from './observability.js';

// New metrics module (Phase 1 - Story 010)
export { MetricsCollector, PrometheusExporter, metricsManager } from './metrics.js';
export type { MetricLabels, CounterMetric, GaugeMetric, HistogramMetric, HistogramData, SummaryData } from './metrics.js';

// Utility
export { initializeAPM, captureTransaction, captureError } from './apm.js';
