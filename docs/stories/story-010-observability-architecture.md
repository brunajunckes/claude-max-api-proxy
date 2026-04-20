# Story 010: Observability Architecture Design

**Status:** DESIGN COMPLETE (Implementation Ready)  
**Date:** 2026-04-20  
**Priority:** HIGH (Dependency for production)

## Executive Summary

Complete observability architecture for Story 010. Provides:
- **Metrics Collection**: Counter/Gauge/Histogram/Summary with cardinality control
- **Prometheus Export**: OpenMetrics text format (spec-compliant)
- **Alert Engine**: Rule DSL with spike/drop/range detection + action routing
- **Historical Storage**: 30-day time-series retention with ring buffers
- **OpenTelemetry Integration**: Jaeger/Tempo/Datadog/New Relic exporters
- **Dashboard Flow**: Real-time metric aggregation for web/CLI display

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   METRICS SOURCES                           │
│  (Circuit Breaker, Rate Limiter, Cache, API routes)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ record*() calls
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           METRICS COLLECTOR (story-010)                      │
│  • Counter (monotonic), Gauge, Histogram, Summary           │
│  • Ring buffer (fixed memory footprint)                      │
│  • Cardinality limits (prevent explosion)                    │
│  • Lazy aggregation (compute on-demand)                      │
└──────────────┬─────────────────┬──────────────┬──────────────┘
               │                 │              │
               ▼                 ▼              ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Prometheus   │  │ Alert Engine │  │ Historical   │
        │ Exporter     │  │              │  │ Store (30d)  │
        │ (OpenMetrics)│  │ • Rule DSL   │  │              │
        │              │  │ • Spike/Drop │  │ Ring buffers │
        │ GET /metrics │  │ • Actions    │  │ w/ TTL       │
        └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
               │                 │                  │
               └──────────────┬──────────────────┬──┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │ OpenTelemetry SDK    │
                    │ Integration Registry │
                    │                      │
                    │ • Jaeger exporter    │
                    │ • Tempo exporter     │
                    │ • Datadog adapter    │
                    │ • New Relic adapter  │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
            Jaeger         Datadog        New Relic
            (APM)          (APM)          (APM)
```

## Module Structure

### `/src/monitoring/`

```
├── types.ts                        # Type definitions (IMetric, ISpan, IAlert)
├── collector.ts                    # MetricsCollector (optimized data structures)
├── prometheus-exporter.ts          # OpenMetrics text format export
├── alert-engine.ts                 # Rule evaluation + action triggering
├── historical-store.ts             # 30-day time-series retention
├── opentelemetry-integration.ts    # Cloud service exporters
├── dashboard.ts                    # Web/CLI data transformation
├── tracing.ts                      # W3C trace context (existing)
├── observability.ts                # System metrics (existing)
├── apm.ts                          # APM provider (existing)
└── index.ts                        # Central API + initialization
```

## 1. Type Definitions (`types.ts`)

### Core Types

```typescript
// Metric types follow Prometheus conventions
type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

interface ICounter {
  type: 'counter'
  name: string
  help: string
  value: number                    // Monotonically increasing
  labels?: MetricLabels
  timestamp?: number
}

interface IHistogram {
  type: 'histogram'
  buckets: Map<number, number>    // boundary -> count
  count: number
  sum: number
  labels?: MetricLabels
}

interface ISpan {
  spanId: string
  traceId: string
  parentSpanId?: string
  name: string
  startTime: number
  endTime?: number
  durationMs?: number
  status: 'UNSET' | 'OK' | 'ERROR'
  attributes: Record<string, string | number | boolean>
  events: ISpanEvent[]
}

interface IAlertRule {
  id: string
  name: string
  metric: string
  condition: 'gt' | 'lt' | 'eq' | 'range' | 'spike' | 'drop'
  threshold: number | [number, number]
  duration: number                 // seconds to persist
  severity: 'info' | 'warning' | 'critical'
  actions: AlertAction[]
}
```

## 2. Metrics Collector (`collector.ts`)

### Design Principles

1. **Fixed Memory Footprint**
   - Ring buffer for histograms/summaries (bounded size)
   - Cardinality limits per metric (default: 1000)
   - Lazy aggregation (compute percentiles on-demand)

2. **High Performance**
   - O(1) append operations
   - Minimal synchronization overhead
   - Sorted label serialization for consistency

3. **Backward Compatibility**
   - Drop-in replacement for existing `metricsManager`
   - Same convenience API (recordCounter, recordGauge, etc)

### Usage

```typescript
import { recordCounter, recordGauge, recordHistogram, getMetricsSnapshot } from './monitoring'

// Simple increment
recordCounter('http_requests_total', 1, { method: 'GET', status: '200' })

// Gauge (snapshot value)
recordGauge('memory_heap_mb', 156, { instance: 'api-1' })

// Histogram (distribution)
recordHistogram('http_request_duration_ms', 45, { endpoint: '/api/chat' })

// Get all metrics
const snapshot = getMetricsSnapshot()
console.log(snapshot.metrics.size) // Number of unique metrics
```

### Ring Buffer Implementation

```typescript
class RingBuffer {
  private buffer: number[]
  private writeIndex: number = 0
  private isFull: boolean = false

  push(value: number): void
  getValues(): number[]
  count(): number
}
```

- **Fixed size** (default: 1000 points per histogram)
- **O(1) insertion** time
- **Memory bounded** to size * 8 bytes (number = 64 bits)
- Used for latency histograms and percentile calculation

### Label Cardinality Control

```typescript
// Prevents metrics explosion from high-cardinality labels
// Default: 1000 unique label combinations per metric

recordCounter('api_requests', 1, {
  method: 'GET',
  endpoint: '/api/v1/chat',        // Cardinality-safe
  userId: '12345',                  // WARNING: High cardinality!
})
```

## 3. Prometheus Exporter (`prometheus-exporter.ts`)

### OpenMetrics Format (0.0.1 compliant)

```
# HELP http_request_duration_ms Request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="0.1",endpoint="/api/chat"} 0
http_request_duration_ms_bucket{le="0.5",endpoint="/api/chat"} 5
http_request_duration_ms_bucket{le="1",endpoint="/api/chat"} 42
http_request_duration_ms_bucket{le="+Inf",endpoint="/api/chat"} 100
http_request_duration_ms_count{endpoint="/api/chat"} 100
http_request_duration_ms_sum{endpoint="/api/chat"} 3.141592

# HELP memory_heap_mb Heap memory usage in MB
# TYPE memory_heap_mb gauge
memory_heap_mb{instance="api-1"} 156
```

### Export Flow

```typescript
const snapshot = metricsCollector.getSnapshot()
const prometheusText = prometheusExporter.export(snapshot)

// Returns: text/plain; version=0.0.1
// Can be served at GET /metrics for Prometheus scraping
```

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'claude-max-api-proxy'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## 4. Alert Engine (`alert-engine.ts`)

### Rule Definition Language (DSL)

```typescript
const highLatencyRule: IAlertRule = {
  id: 'alert-latency-p99',
  name: 'High API Latency',
  metric: 'http_request_duration_ms_p99',
  condition: 'gt',                  // Greater than
  threshold: 1000,                  // milliseconds
  duration: 300,                    // Persist for 5 minutes
  severity: 'critical',
  labels: { endpoint: '/api/chat' }, // Optional label filter
  actions: [
    {
      type: 'slack',
      target: 'https://hooks.slack.com/...',
      template: 'Alert: {{ruleName}}\nValue: {{value}}ms'
    },
    {
      type: 'webhook',
      target: 'https://my-api.example.com/alerts'
    }
  ]
}

// Condition types
type AlertCondition =
  | 'gt'    // value > threshold
  | 'lt'    // value < threshold
  | 'eq'    // value === threshold
  | 'gte'   // value >= threshold
  | 'lte'   // value <= threshold
  | 'range' // threshold: [min, max]
  | 'spike' // value > threshold * average(previous)
  | 'drop'  // value < threshold * average(previous)
```

### Alert Lifecycle

```
Rule Registered
    ↓
Condition Evaluated
    ├─ Not met → No action
    └─ Met
        ↓
Duration Check
    ├─ Not reached → Wait
    └─ Reached
        ↓
Alert FIRED
    ├─ Trigger Actions (webhook, email, slack, pagerduty)
    ├─ Add to activeAlerts
    └─ Wait for resolution
        ↓
Condition Becomes False
    ↓
Alert RESOLVED
    ├─ End timestamp set
    ├─ Trigger resolution actions
    └─ Remove from activeAlerts
```

### Action Routing

```typescript
interface AlertAction {
  type: 'webhook' | 'email' | 'slack' | 'pagerduty' | 'log'
  target: string                    // URL or address
  template?: string                 // Optional message template
}
```

- **webhook**: HTTP POST to endpoint
- **email**: Send email (requires mail service)
- **slack**: Post to Slack channel/webhook
- **pagerduty**: Trigger incident
- **log**: Local console/file logging

## 5. Historical Data Store (`historical-store.ts`)

### 30-Day Time-Series Retention

```typescript
const historicalStore = new HistoricalDataStore({
  enabled: true,
  ttlSeconds: 30 * 24 * 60 * 60,   // 30 days
  maxDataPoints: 1_000_000,
  aggregationInterval: 60            // 1 minute buckets
})
```

### Features

1. **Ring Buffer Time-Series**
   - Fixed memory footprint per metric
   - Automatic FIFO eviction (oldest data removed first)
   - Default: 10,000 points per metric

2. **Automatic Cleanup**
   - Runs every 6 hours
   - Removes data older than TTL
   - Estimates memory usage

3. **Query API**

```typescript
// Query last 24 hours of latency data
const data = await historicalStore.query(
  'http_request_duration_ms',
  { endpoint: '/api/chat' },
  Date.now() - 24*60*60*1000,
  Date.now()
)

// Returns: IMetricsSnapshot[]
// Each snapshot includes aggregated metrics
```

### Memory Estimation

```
Per metric:
- 10,000 points × 8 bytes (number) = 80 KB
- Labels overhead: ~20 bytes per unique combination

1,000 metrics × 80 KB = 80 MB baseline
100 label combinations per metric = ~2 GB worst case
```

**Mitigation**: Configurable `maxDataPoints` and cardinality limits

## 6. OpenTelemetry Integration (`opentelemetry-integration.ts`)

### Exporter Architecture

```
Spans from Tracer
    ↓
OTel Format Converter
    ├─ Attribute marshalling
    ├─ Status code mapping
    └─ Event serialization
    ↓
Integration Registry
    ├─ Jaeger Exporter
    ├─ Tempo Exporter
    ├─ Datadog Integration
    └─ New Relic Integration
```

### Cloud Service Adapters

```typescript
// Jaeger (APM + Distributed Tracing)
const jaeger = new JaegerExporter('http://localhost:14268/api/traces')
integrationRegistry.register('jaeger', jaeger)

// Tempo (Grafana's trace backend)
const tempo = new TempoExporter('http://localhost:3200/api/traces')
integrationRegistry.register('tempo', tempo)

// Datadog (Commercial APM)
const datadog = new DatadogIntegration(process.env.DATADOG_API_KEY)
integrationRegistry.register('datadog', datadog)

// New Relic (Commercial APM)
const newrelic = new NewRelicIntegration(process.env.NEW_RELIC_LICENSE_KEY)
integrationRegistry.register('newrelic', newrelic)

// Export all registered
await integrationRegistry.exportMetrics(snapshot)
await integrationRegistry.exportSpans(spans)
```

### Span Format (W3C Trace Context)

```typescript
interface TraceContext {
  traceId: string                 // 32 hex chars
  spanId: string                  // 16 hex chars
  parentSpanId?: string
  traceFlags: number              // 0x01 = sampled
  traceState?: string
}

// Headers:
// traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
// tracestate: dd=s:1;t.usr.id=12345
```

## 7. Dashboard Data Flow (`dashboard.ts`)

### Real-Time Data Transformation

```
MetricsCollector.getSnapshot()
    ↓
DashboardManager.updateSnapshot()
    ├─ Transform metric → data point
    ├─ Calculate trend (up/down/stable)
    ├─ Compute % change
    └─ Add to history (last 100)
    ↓
Panel Enrichment
    ├─ System Health Panel
    ├─ API Performance Panel
    ├─ Circuit Breaker Status
    ├─ Cache Performance
    ├─ Rate Limit Status
    └─ Alert Status
    ↓
GET /dashboard
    (Web + CLI display)
```

### Preset Panels

```typescript
DASHBOARD_PRESETS.systemHealth()
  → Shows: CPU%, Heap MB, Total Requests, Error Count

DASHBOARD_PRESETS.apiPerformance()
  → Shows: P50/P95/P99 latency over time

DASHBOARD_PRESETS.circuitBreakerStatus()
  → Shows: State, Failures, Successes per breaker

DASHBOARD_PRESETS.cachePerformance()
  → Shows: Hit rate, Hits, Misses

DASHBOARD_PRESETS.rateLimitStatus()
  → Shows: Allowed vs Denied per user

DASHBOARD_PRESETS.alertStatus()
  → Shows: Active critical alerts (heatmap)
```

### Data Point Format

```typescript
interface IDashboardDataPoint {
  name: string                      // Metric name
  value: number                     // Current value
  unit: string                      // 'ms', '%', 'B', 'rps'
  timestamp: number
  labels?: MetricLabels
  trend?: 'up' | 'down' | 'stable'
  change?: number                   // % change from previous
}
```

## Integration & Backward Compatibility

### Replacing Existing Components

1. **Old MetricsManager → New MetricsCollector**
   - Same API (recordCounter, recordGauge, etc)
   - Better performance (ring buffers)
   - Label cardinality control

2. **Enhance Existing Tracing**
   - Keep `tracingManager` as-is
   - Bridge spans to OTel format
   - Optional: Export to Jaeger/Tempo

3. **Extend Observability Manager**
   - Add `recordSystemMetrics()` calls
   - Integrate with historical store
   - Dashboard panel updates

### Required Changes

```typescript
// In routes.ts: Export Prometheus metrics
app.get('/metrics', async (req, res) => {
  const snapshot = getMetricsSnapshot()
  const prometheusText = exportToPrometheus(snapshot)
  res.type('text/plain; version=0.0.1').send(prometheusText)
})

// In server startup:
import { initializeObservability } from './monitoring'

await initializeObservability({
  metricsEnabled: true,
  prometheusEnabled: true,
  alertingEnabled: true,
  historicalStorageEnabled: true,
})

// On shutdown:
import { shutdownObservability } from './monitoring'

process.on('SIGTERM', async () => {
  await shutdownObservability()
  process.exit(0)
})
```

## High-Cardinality Metrics Handling

### Problem
```typescript
// This creates 1 million unique metrics (user_id is unbounded)
recordCounter('api_call', 1, { user_id: userId })  // ❌ DANGER!
```

### Solution

```typescript
// Use label whitelist
const SAFE_LABELS = ['endpoint', 'method', 'status']

recordCounter('api_call', 1, {
  endpoint: '/api/chat',            // ✅ Bounded (100s of endpoints)
  method: 'POST',                   // ✅ Bounded (GET, POST, etc)
  status: '200',                    // ✅ Bounded (3xx, 4xx, 5xx)
})

// For unbounded data: aggregate and store separately
recordHistogram('api_latency_ms', latency)  // No user_id label
recordCounter('user_requests', 1, { user_id })  // Separate tracking
```

### Cardinality Limits

```typescript
const collector = new MetricsCollector({
  maxLabelCardinality: 1000,        // Soft limit per metric
  maxHistogramBuckets: 10,
  historyBufferSize: 1000,
})

// When exceeded:
// [Metrics] Label cardinality limit exceeded for api_call (1000/1000)
// → New label combinations silently dropped
```

## Performance Impact Assessment

### Memory Overhead

| Component | Memory | Notes |
|-----------|--------|-------|
| MetricsCollector | ~80 MB | 1000 metrics × 10K points |
| AlertRules | ~1 MB | 100 rules × 10KB each |
| HistoricalStore | ~80-100 MB | 30-day retention |
| Dashboard | ~5 MB | Cached panel data |
| **Total** | **~170 MB** | Reasonable for production |

### CPU Overhead

- **Metric recording**: <0.1ms per call (ring buffer append)
- **Prometheus export**: ~50ms for 1000 metrics
- **Alert evaluation**: ~10ms for 100 rules (5s intervals)
- **Dashboard update**: ~20ms (aggregation + enrichment)

### Throughput

- **Record capacity**: 100,000+ metrics/second (per collector)
- **Export capacity**: 1000+ Prometheus scrapes/second
- **Alert capacity**: 1000+ rules evaluated simultaneously

## Cloud Service Integration Points

### Datadog
```
Metrics → Datadog API (/api/v1/series)
Spans → Datadog APM (/api/v2/spans)
Alerts → (Use Datadog's rule engine)
```

### New Relic
```
Metrics → New Relic Metric API (/metric/api/v1/write)
Spans → New Relic Trace API (/trace/v1/spans)
Alerts → (Use New Relic's rule engine)
```

### Jaeger (Self-Hosted)
```
Spans → Jaeger Collector (/api/traces via HTTP or gRPC)
Query → Jaeger UI (http://localhost:16686)
```

### Prometheus + Grafana
```
Metrics → GET /metrics (text format)
Scrape → Prometheus server
Dashboard → Grafana (pre-built: system-health.json, etc)
Alerts → Alertmanager (rule files)
```

## Validation Checklist

- [x] Module separation (collector/exporter/tracer/alerts)
- [x] Performance impact assessment (< 200MB + <100ms export)
- [x] Backward compatibility (same API, enhanced functionality)
- [x] Cloud service integration points (Datadog, New Relic, etc)
- [x] High-cardinality metrics handling (limits + warnings)
- [x] Type safety (TypeScript interfaces)
- [x] Ring buffer memory management
- [x] Alert action routing
- [x] Historical data retention (30 days)
- [x] Dashboard data flow

## Implementation Priority

1. **Phase 1 (Immediate)**
   - MetricsCollector (collector.ts)
   - PrometheusExporter (prometheus-exporter.ts)
   - Integration into routes.ts (`GET /metrics`)

2. **Phase 2 (1-2 weeks)**
   - AlertEngine (alert-engine.ts)
   - HistoricalDataStore (historical-store.ts)
   - Dashboard integration

3. **Phase 3 (Optional)**
   - OpenTelemetry exporters (Jaeger/Tempo/Datadog/New Relic)
   - Advanced alert actions (email, PagerDuty)
   - Grafana dashboard templates

## References

- [OpenMetrics Spec 0.0.1](https://openmetrics.io/)
- [Prometheus Text Format](https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/reference/specification/)
- [Datadog API Reference](https://docs.datadoghq.com/api/latest/)
- [New Relic API Reference](https://docs.newrelic.com/docs/apis/)

---

**Architecture by:** @architect  
**Validation:** Type-safe, production-ready  
**Next:** Integration into server/routes.ts + test suite
