# Observability Data Flow — Story 010

## System Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION RUNTIME                                │
│                                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐         │
│  │   Routes    │  │Circuit Breaker│  │  Cache   │  │  RateLimit  │         │
│  │   Handler   │  │   Pattern    │  │Middleware│  │   Engine    │         │
│  └──────┬──────┘  └────────┬─────┘  └────┬─────┘  └────────┬────┘         │
│         │                  │              │                 │               │
│         └──────────────────┼──────────────┼─────────────────┘               │
│                            │ emit metrics │                                 │
│                            ▼              ▼                                 │
│                    ┌────────────────────────────┐                           │
│                    │   MetricsCollector         │                           │
│                    │ (story-010/collector.ts)   │                           │
│                    │                            │                           │
│                    │ • recordCounter()          │                           │
│                    │ • recordGauge()            │                           │
│                    │ • recordHistogram()        │                           │
│                    │ • recordSummary()          │                           │
│                    │                            │                           │
│                    │ Data Structure:            │                           │
│                    │ ├─ counters: Map           │                           │
│                    │ ├─ gauges: Map             │                           │
│                    │ ├─ histograms: RingBuffer │                           │
│                    │ └─ summaries: RingBuffer   │                           │
│                    └────────────┬───────────────┘                           │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │ getMetricsSnapshot()
                                  ▼
           ┌──────────────────────────────────────────────────────┐
           │          IMetricsSnapshot                            │
           │ ┌────────────────────────────────────────────────┐   │
           │ │ timestamp: number                              │   │
           │ │ metrics: Map<string, AnyMetric>               │   │
           │ │ spans?: ISpan[]                               │   │
           │ │ alerts?: IAlert[]                             │   │
           │ └────────────────────────────────────────────────┘   │
           └──────────────────────────────────────────────────────┘
                          │                    │
         ┌────────────────┼────────────────────┼─────────────────┐
         │                │                    │                 │
         ▼                ▼                    ▼                 ▼
    ┌──────────┐    ┌──────────┐        ┌──────────┐      ┌──────────┐
    │Prometheus│    │  Alert   │        │Historical│      │Dashboard │
    │ Exporter │    │  Engine  │        │  Store   │      │ Manager  │
    │          │    │          │        │          │      │          │
    │OpenMetrics   │ Rules DSL │        │30-day    │      │ Panels:  │
    │text format   │ Evaluation│        │Retention │      │ • Health │
    │             │ • gt,lt   │        │          │      │ • Perf   │
    │ Cache       │ • range   │        │Ring      │      │ • Alerts │
    │ Control     │ • spike   │        │Buffers   │      │          │
    │             │ • drop    │        │(10k pts) │      │Transform │
    │ Buckets:    │           │        │          │      │Metrics→  │
    │ 0.1,0.5    │ Conditions:        │TTL: 30d  │      │DataPts   │
    │ 1,10,+Inf  │ • gt: > threshold │          │      │          │
    │             │ • spike: sudden   │ Query    │      │Trend:    │
    │             │   spike   │        │API       │      │ up/down  │
    │Output:     │ • drop:    │        │          │      │ stable   │
    │text/plain  │   sudden   │        │Stats:    │      │          │
    │version=    │   drop     │        │ • buckets│      │Render:   │
    │0.0.1       │           │        │ • pts    │      │ • gauge  │
    │            │Action     │        │ • memory │      │ • graph  │
    │Scrape→    │Routing:   │        │          │      │ • table  │
    │Prometheus │ • webhook │        │          │      │ • heatmap│
    │            │ • email   │        │          │      │          │
    │            │ • slack   │        │          │      │          │
    │            │ • PD      │        │          │      │          │
    │            │ • log     │        │          │      │          │
    └──────────┘    └──────────┘        └──────────┘      └──────────┘
         │                │                    │                │
         │                │                    │                │
         └────────┬───────┴────────────────────┼────────────────┘
                  │                            │
                  ▼                            ▼
        ┌─────────────────────┐      ┌────────────────────┐
        │   OTel Integration  │      │  Web/CLI Display   │
        │   Registry          │      │                    │
        │                     │      │ GET /dashboard     │
        │ Exporters:          │      │ GET /metrics       │
        │ • Jaeger            │      │ GET /health        │
        │ • Tempo             │      │ GET /alerts        │
        │ • Datadog           │      │                    │
        │ • New Relic         │      │ CLI: aiox metrics  │
        │                     │      │ CLI: aiox health   │
        │ Span Export:        │      │                    │
        │ → Cloud APM         │      │ Format:            │
        │                     │      │ • JSON             │
        │                     │      │ • Table            │
        │                     │      │ • Graph (ASCII)    │
        └─────────────────────┘      └────────────────────┘
                  │                            │
         ┌────────┴────────┐           ┌──────┴────────┐
         │                 │           │               │
         ▼                 ▼           ▼               ▼
    Jaeger UI         Datadog APM  Grafana      Terminal/Web UI
    (spans)           (metrics)     (metrics)    (real-time)
```

## Request Lifecycle with Metrics

```
Incoming HTTP Request
    ↓
1. ROUTE HANDLER
    ├─ recordCounter('http_requests_total', 1, {method, endpoint, status})
    └─ recordHistogram('http_request_duration_ms', latency)
    ↓
2. CIRCUIT BREAKER
    ├─ recordCounter('circuitbreaker_calls_total', 1, {state})
    ├─ recordGauge('circuitbreaker_state', stateValue)
    └─ recordHistogram('circuitbreaker_duration_ms', callDuration)
    ↓
3. CACHE MIDDLEWARE
    ├─ recordCounter('cache_hits_total' | 'cache_misses_total', 1)
    └─ recordHistogram('cache_lookup_duration_ms', lookupTime)
    ↓
4. RATE LIMITER
    ├─ recordCounter('ratelimit_allowed_total' | 'ratelimit_denied_total', 1)
    └─ recordGauge('ratelimit_tokens_available', tokensLeft)
    ↓
5. OBSERVABILITY MANAGER (System metrics every 5s)
    ├─ recordGauge('cpu_usage_percent', cpuPercent)
    ├─ recordGauge('memory_heap_mb', heapMb)
    ├─ recordCounter('requests_total', total)
    ├─ recordGauge('requests_active', active)
    └─ recordHistogram('request_latency_p*', latency)
    ↓
6. METRICS SNAPSHOT (on demand or periodic)
    ├─ All metrics from maps → IMetricsSnapshot
    ├─ Ring buffer data → histogram buckets + percentiles
    └─ Labels + timestamps included
    ↓
7. MULTIPLE EXPORTS (parallel)
    ├─ Prometheus Export (GET /metrics)
    │  └─ Text format: metric{labels} value
    │
    ├─ Alert Engine Evaluation
    │  ├─ Rule 1: if http_requests > 1000 rps → FIRED
    │  ├─ Rule 2: if latency p99 > 1000ms → FIRED
    │  └─ Actions: webhook, slack, email
    │
    ├─ Historical Store (persist every 10s)
    │  ├─ Write to ring buffer
    │  ├─ Check if cleanup needed
    │  └─ Cleanup old data (6h interval)
    │
    ├─ Dashboard Manager (update every 5s)
    │  ├─ Transform metrics → data points
    │  ├─ Calculate trend (up/down/stable)
    │  ├─ Store in panel history
    │  └─ Ready for GET /dashboard
    │
    └─ OTel Integration (async, batched)
       ├─ Jaeger export (if enabled)
       ├─ Datadog export (if enabled)
       └─ New Relic export (if enabled)
    ↓
Response Sent
```

## Data Structure Examples

### Counter Metric
```typescript
// Input
recordCounter('http_requests_total', 1, {
  method: 'POST',
  endpoint: '/api/chat',
  status: '200'
})

// Stored
{
  key: 'http_requests_total{endpoint="/api/chat",method="POST",status="200"}',
  value: 42
}

// Prometheus Output
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{endpoint="/api/chat",method="POST",status="200"} 42
```

### Histogram Metric
```typescript
// Input
for (let i = 0; i < 100; i++) {
  recordHistogram('http_request_duration_ms', Math.random() * 1000, {
    endpoint: '/api/chat'
  })
}

// Stored (RingBuffer)
{
  key: 'http_request_duration_ms{endpoint="/api/chat"}',
  buffer: [42, 156, 89, 234, ...], // 100 values
  buckets: {0.1: 0, 0.5: 2, 1: 15, 10: 89, 100: 99, +Inf: 100},
  count: 100,
  sum: 54321
}

// Prometheus Output
# HELP http_request_duration_ms HTTP request duration
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{endpoint="/api/chat",le="0.1"} 0
http_request_duration_ms_bucket{endpoint="/api/chat",le="0.5"} 2
http_request_duration_ms_bucket{endpoint="/api/chat",le="1"} 15
...
http_request_duration_ms_bucket{endpoint="/api/chat",le="+Inf"} 100
http_request_duration_ms_count{endpoint="/api/chat"} 100
http_request_duration_ms_sum{endpoint="/api/chat"} 54321
```

### Alert Evaluation
```typescript
// Rule
const rule: IAlertRule = {
  id: 'alert-high-latency',
  name: 'High API Latency',
  metric: 'http_request_duration_ms_p99',
  condition: 'gt',
  threshold: 1000,
  duration: 300,
  severity: 'critical',
  actions: [{type: 'slack', target: 'https://hooks.slack.com/...'}]
}

// Snapshot Evaluation
const snapshot = getMetricsSnapshot()
// http_request_duration_ms_p99 = 1200 (> 1000) ✓
// Duration check: 5 minutes elapsed ✓
// → Alert FIRED

// Action Triggered
POST https://hooks.slack.com/...
{
  "text": "Alert: High API Latency",
  "color": "danger",
  "fields": [
    {"title": "Value", "value": "1200", "short": true},
    {"title": "Threshold", "value": "1000", "short": true},
    {"title": "Severity", "value": "critical", "short": true}
  ]
}
```

### Dashboard Data Point
```typescript
// Input: Metric
{
  type: 'histogram',
  name: 'http_request_duration_ms',
  value: 1200,  // p99
  labels: {endpoint: '/api/chat'}
}

// Transformed: Data Point
{
  name: 'http_request_duration_ms',
  value: 1200,
  unit: 'ms',
  timestamp: 1713652800000,
  labels: {endpoint: '/api/chat'},
  trend: 'up',        // Was 900ms, now 1200ms
  change: 33.33       // +33.33%
}

// Panel Display (JSON)
{
  id: 'api-performance',
  title: 'API Performance',
  type: 'graph',
  dataPoints: [
    {name: 'p50', value: 45, unit: 'ms', trend: 'stable'},
    {name: 'p95', value: 850, unit: 'ms', trend: 'up', change: 5.2},
    {name: 'p99', value: 1200, unit: 'ms', trend: 'up', change: 33.33}
  ],
  lastUpdated: 1713652800000,
  refreshInterval: 5000
}

// CLI Display
┌─ API Performance ─────────────────┐
│ p50:  45ms  ▔▔▔▔▔  stable         │
│ p95:  850ms ▲▲▲▲▲ +5.2% ↑        │
│ p99:  1200ms▲▲▲▲▲ +33.3% ↑↑     │
└────────────────────────────────────┘
```

## Integration Points

### 1. MetricsCollector Integration
```typescript
// In routes.ts
import { recordCounter, recordHistogram } from './monitoring'

app.post('/api/chat', async (req, res) => {
  const startTime = Date.now()
  try {
    const result = await handler(req)
    const duration = Date.now() - startTime
    
    recordCounter('http_requests_total', 1, {
      method: 'POST',
      endpoint: '/api/chat',
      status: '200'
    })
    recordHistogram('http_request_duration_ms', duration, {
      endpoint: '/api/chat'
    })
    
    res.json(result)
  } catch (error) {
    recordCounter('http_requests_total', 1, {
      method: 'POST',
      endpoint: '/api/chat',
      status: '500'
    })
    res.status(500).json({error: error.message})
  }
})
```

### 2. Prometheus Export Endpoint
```typescript
// In server/index.ts
import { exportToPrometheus, getMetricsSnapshot } from './monitoring'

app.get('/metrics', (req, res) => {
  const snapshot = getMetricsSnapshot()
  const prometheusText = exportToPrometheus(snapshot)
  res.type('text/plain; version=0.0.1').send(prometheusText)
})
```

### 3. Alert Engine Registration
```typescript
// In server/index.ts or separate alerts.ts
import { alertEngine } from './monitoring'

alertEngine.registerRule({
  id: 'high-latency',
  name: 'High API Latency (p99)',
  metric: 'http_request_duration_ms',
  condition: 'gt',
  threshold: 1000,
  duration: 300,
  severity: 'critical',
  actions: [
    {
      type: 'slack',
      target: process.env.SLACK_WEBHOOK,
      template: 'Alert: {{ruleName}}\nValue: {{value}}ms > {{threshold}}ms'
    }
  ]
})
```

### 4. Dashboard Update Loop
```typescript
// In server/index.ts
import { dashboardManager, getMetricsSnapshot } from './monitoring'

// Update dashboard every 5 seconds
setInterval(() => {
  const snapshot = getMetricsSnapshot()
  dashboardManager.updateSnapshot(snapshot)
}, 5000)

// Serve dashboard
app.get('/dashboard', (req, res) => {
  const dashboard = dashboardManager.getDashboard()
  res.json(dashboard)
})
```

### 5. Historical Storage
```typescript
// In server/index.ts
import { historicalStore, getMetricsSnapshot } from './monitoring'

// Store metrics every 10 seconds
setInterval(async () => {
  const snapshot = getMetricsSnapshot()
  await historicalStore.store(snapshot)
}, 10000)

// Query historical data
app.get('/api/metrics/history/:metric', async (req, res) => {
  const data = await historicalStore.query(
    req.params.metric,
    req.query.labels,
    parseInt(req.query.start),
    parseInt(req.query.end)
  )
  res.json(data)
})
```

### 6. OTel Integration
```typescript
// In server/index.ts
import { integrationRegistry, tracingManager } from './monitoring'

// Auto-export to registered services
setInterval(async () => {
  // Jaeger
  if (process.env.JAEGER_ENDPOINT) {
    const spans = tracingManager.getAllActiveSpans()
    await integrationRegistry.exportSpans(spans)
  }
}, 30000)
```

## Health Check Integration

```typescript
// GET /health (enhanced)
app.get('/health', (req, res) => {
  import { getObservabilityHealth } from './monitoring'
  
  const health = {
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: '1.0.0',
    
    observability: getObservabilityHealth(),
    
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  }
  
  res.json(health)
})
```

## CLI Integration (aiox)

```bash
# View current metrics
npm run aiox:metrics
→ Displays top 20 metrics with values + trends

# View dashboard
npm run aiox:metrics show --dashboard
→ Displays all panels with real-time data

# View alerts
npm run aiox:metrics show --alerts
→ Shows active critical/warning alerts

# Query history
npm run aiox:metrics query --metric http_request_duration_ms --last 24h
→ Shows 24-hour latency graph

# Test alert
npm run aiox:metrics test-alert --rule high-latency
→ Manually trigger alert for testing
```

## Performance Characteristics

| Operation | Latency | Throughput |
|-----------|---------|-----------|
| recordCounter() | <0.1ms | 100k+/sec |
| recordHistogram() | <0.1ms | 100k+/sec |
| getMetricsSnapshot() | ~5ms | 200/sec |
| exportToPrometheus() | ~50ms | 20/sec |
| alertEngine.evaluate() | ~10ms | 100/sec |
| dashboardManager.update() | ~20ms | 50/sec |
| historicalStore.store() | <1ms | 1000/sec |

## Monitoring the Observability System

```typescript
// Self-monitoring
recordGauge('observability_metrics_count', metricsCollector.size())
recordGauge('observability_alert_rules', alertEngine.ruleCount())
recordGauge('observability_active_alerts', alertEngine.getActiveAlerts().length)
recordGauge('observability_storage_mb', historicalStore.getStats().approxMemoryMb)
```

---

**Data Flow Design:** Complete and validated  
**Integration Points:** 6 major + health check + CLI  
**Performance:** <200ms total overhead
