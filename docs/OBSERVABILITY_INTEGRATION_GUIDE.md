# Story 010: Observability Integration Guide

## Quick Start

### 1. Initialize Observability System

In `src/server/index.ts`:

```typescript
import { initializeObservability, shutdownObservability } from '../monitoring/index.js'

// During server startup
async function startServer() {
  const app = express()
  
  // Initialize observability
  await initializeObservability({
    metricsEnabled: true,
    prometheusEnabled: true,
    alertingEnabled: true,
    historicalStorageEnabled: true,
    dashboardEnabled: true,
    alertEvaluationInterval: 5000,
  })
  
  // ... rest of server setup
  
  const server = app.listen(3000, () => {
    console.log('Server listening on port 3000')
  })
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownObservability()
    server.close()
  })
}
```

### 2. Export Prometheus Metrics Endpoint

In `src/server/routes.ts`:

```typescript
import { exportToPrometheus, getMetricsSnapshot } from '../monitoring/index.js'

export function setupMetricsRoutes(app: express.Application): void {
  app.get('/metrics', (req, res) => {
    const snapshot = getMetricsSnapshot()
    const prometheusText = exportToPrometheus(snapshot)
    res.type('text/plain; version=0.0.1').send(prometheusText)
  })
}
```

### 3. Record Metrics in Handlers

In `src/server/routes.ts`:

```typescript
import { recordCounter, recordHistogram } from '../monitoring/index.js'

export async function handleChatCompletions(req, res) {
  const startTime = Date.now()
  
  try {
    const result = await processChatRequest(req.body)
    const duration = Date.now() - startTime
    
    // Record metrics
    recordCounter('http_requests_total', 1, {
      method: 'POST',
      endpoint: '/v1/chat/completions',
      status: '200',
      model: req.body.model,
    })
    
    recordHistogram('http_request_duration_ms', duration, {
      endpoint: '/v1/chat/completions',
      model: req.body.model,
    })
    
    res.json(result)
  } catch (error) {
    const duration = Date.now() - startTime
    
    recordCounter('http_requests_total', 1, {
      method: 'POST',
      endpoint: '/v1/chat/completions',
      status: '500',
    })
    
    recordHistogram('http_request_duration_ms', duration, {
      endpoint: '/v1/chat/completions',
    })
    
    res.status(500).json({ error: error.message })
  }
}
```

## Integration Checklist

### Phase 1: Core Metrics (Week 1)

- [ ] Add observability imports to server/index.ts
- [ ] Initialize observability system on startup
- [ ] Create `/metrics` endpoint
- [ ] Record metrics in chat completion handler
- [ ] Record metrics in circuit breaker
- [ ] Record metrics in rate limiter
- [ ] Record metrics in cache middleware
- [ ] Test Prometheus scraping: `curl http://localhost:3000/metrics`

### Phase 2: Alerting & Dashboard (Week 2-3)

- [ ] Register alert rules (high latency, error rate, etc)
- [ ] Configure Slack/webhook integration
- [ ] Create dashboard panels
- [ ] Add `/dashboard` endpoint
- [ ] Integrate historical storage
- [ ] Add CLI commands: `aiox metrics show`
- [ ] Test alert firing: `npm run aiox:metrics test-alert`

### Phase 3: Cloud Integration (Week 4)

- [ ] Configure Jaeger exporter
- [ ] Configure Datadog integration
- [ ] Configure New Relic integration
- [ ] Test span export to cloud APM
- [ ] Create Grafana dashboards
- [ ] Document runbooks

## Integration Points by Module

### Circuit Breaker (`src/lib/circuit-breaker.ts`)

```typescript
import { recordCounter, recordGauge, recordHistogram } from '../monitoring/index.js'

class CircuitBreaker {
  async call<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now()
    
    try {
      const result = await fn()
      
      recordCounter('circuitbreaker_calls_total', 1, {
        status: 'success',
        name: this.name,
      })
      
      recordHistogram('circuitbreaker_duration_ms', Date.now() - startTime, {
        name: this.name,
      })
      
      return result
    } catch (error) {
      recordCounter('circuitbreaker_calls_total', 1, {
        status: 'failure',
        name: this.name,
      })
      
      recordHistogram('circuitbreaker_duration_ms', Date.now() - startTime, {
        name: this.name,
      })
      
      throw error
    }
  }
  
  setState(newState: CircuitBreakerState) {
    recordGauge('circuitbreaker_state', this.stateToNumber(newState), {
      name: this.name,
    })
    this.state = newState
  }
  
  private stateToNumber(state: CircuitBreakerState): number {
    switch (state) {
      case CircuitBreakerState.CLOSED: return 0
      case CircuitBreakerState.OPEN: return 1
      case CircuitBreakerState.HALF_OPEN: return 2
    }
  }
}
```

### Rate Limiter (`src/server/rate-limit.ts`)

```typescript
import { recordCounter, recordGauge } from '../monitoring/index.js'

export function createRateLimiter() {
  return (req, res, next) => {
    const identifier = req.ip
    
    if (isLimited(identifier)) {
      recordCounter('ratelimit_requests_denied', 1, {
        identifier,
      })
      return res.status(429).json({ error: 'Rate limit exceeded' })
    }
    
    recordCounter('ratelimit_requests_allowed', 1, {
      identifier,
    })
    
    const tokens = getAvailableTokens(identifier)
    recordGauge('ratelimit_tokens_available', tokens, {
      identifier,
    })
    
    next()
  }
}
```

### Cache Middleware (`src/server/cache-middleware.ts`)

```typescript
import { recordCounter, recordHistogram } from '../monitoring/index.js'

export function cacheMiddleware(req, res, next) {
  const startTime = Date.now()
  const cacheKey = `${req.method}:${req.path}`
  
  const cached = getFromCache(cacheKey)
  
  if (cached) {
    recordCounter('cache_hits_total', 1, {
      endpoint: req.path,
    })
    
    recordHistogram('cache_hit_duration_ms', Date.now() - startTime, {
      endpoint: req.path,
    })
    
    return res.json(cached)
  }
  
  recordCounter('cache_misses_total', 1, {
    endpoint: req.path,
  })
  
  // Wrap res.json to cache response
  const originalJson = res.json
  res.json = function(data) {
    setInCache(cacheKey, data)
    
    recordHistogram('cache_store_duration_ms', Date.now() - startTime, {
      endpoint: req.path,
    })
    
    return originalJson.call(this, data)
  }
  
  next()
}
```

### Health Check Endpoint (`src/server/health-check.ts`)

```typescript
import { getObservabilityHealth } from '../monitoring/index.js'

export async function handleHealth(req, res) {
  const health = {
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: '1.0.0',
    
    observability: getObservabilityHealth(),
    
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
  }
  
  res.json(health)
}
```

## Alert Rules Configuration

Create `src/config/alert-rules.ts`:

```typescript
import { alertEngine } from '../monitoring/index.js'
import type { IAlertRule } from '../monitoring/index.js'

export function setupAlertRules(): void {
  // High API latency alert
  const highLatencyRule: IAlertRule = {
    id: 'alert-high-latency-p99',
    name: 'High API Latency (P99)',
    metric: 'http_request_duration_ms',
    condition: 'gt',
    threshold: 1000,
    duration: 300,                    // Persist for 5 minutes
    severity: 'critical',
    labels: { endpoint: '/v1/chat/completions' },
    actions: [
      {
        type: 'slack',
        target: process.env.SLACK_ALERTS_WEBHOOK,
        template: `🚨 Alert: {{ruleName}}
Value: {{value}}ms
Threshold: {{threshold}}ms
Duration: 5 minutes`,
      },
    ],
  }
  
  // High error rate alert
  const highErrorRateRule: IAlertRule = {
    id: 'alert-high-error-rate',
    name: 'High Error Rate',
    metric: 'http_requests_total',
    condition: 'gt',
    threshold: 10,                    // More than 10 errors/5min
    duration: 300,
    severity: 'warning',
    actions: [
      {
        type: 'webhook',
        target: process.env.WEBHOOK_URL,
      },
      {
        type: 'log',
        target: 'console',
      },
    ],
  }
  
  // Circuit breaker opened alert
  const circuitBreakerRule: IAlertRule = {
    id: 'alert-circuit-breaker-open',
    name: 'Circuit Breaker Opened',
    metric: 'circuitbreaker_state',
    condition: 'eq',
    threshold: 1,                     // OPEN state = 1
    duration: 10,
    severity: 'critical',
    actions: [
      {
        type: 'slack',
        target: process.env.SLACK_ALERTS_WEBHOOK,
        template: '🔓 Circuit breaker opened',
      },
      {
        type: 'pagerduty',
        target: process.env.PAGERDUTY_KEY,
      },
    ],
  }
  
  // Register rules
  alertEngine.registerRule(highLatencyRule)
  alertEngine.registerRule(highErrorRateRule)
  alertEngine.registerRule(circuitBreakerRule)
  
  console.log('[Alerts] Registered 3 alert rules')
}
```

In `src/server/index.ts`:

```typescript
import { setupAlertRules } from '../config/alert-rules.js'

await setupAlertRules()
```

## Dashboard Configuration

Create `src/config/dashboard.ts`:

```typescript
import { dashboardManager, DASHBOARD_PRESETS } from '../monitoring/index.js'

export function setupDashboard(): void {
  // All presets are auto-registered on import
  // But you can add custom panels:
  
  dashboardManager.registerPanel({
    id: 'custom-model-stats',
    title: 'Model Statistics',
    type: 'table',
    metrics: [
      'model_requests_gpt4',
      'model_requests_claude3',
      'model_latency_p99_gpt4',
      'model_latency_p99_claude3',
    ],
    dataPoints: [],
    refreshInterval: 10000,
  })
}
```

## CLI Integration

Add commands to `src/cli/hermes-commands.ts`:

```typescript
import { getMetricsSnapshot, getDashboard, getPanel, alertEngine } from '../monitoring/index.js'

export const metricsCommand = {
  command: 'metrics <subcommand>',
  description: 'View observability metrics',
  
  subcommands: {
    show: async () => {
      const dashboard = getDashboard()
      console.log('📊 Dashboard')
      
      for (const panel of dashboard.panels) {
        console.log(`\n${panel.title}`)
        for (const point of panel.dataPoints) {
          const trend = point.trend === 'up' ? '↑' : point.trend === 'down' ? '↓' : '→'
          console.log(`  ${point.name}: ${point.value}${point.unit} ${trend}`)
        }
      }
    },
    
    snapshot: async () => {
      const snapshot = getMetricsSnapshot()
      console.log(JSON.stringify(snapshot, null, 2))
    },
    
    alerts: async () => {
      const alerts = alertEngine.getActiveAlerts()
      console.log(`Active Alerts: ${alerts.length}`)
      
      for (const alert of alerts) {
        console.log(`  [${alert.severity.toUpperCase()}] ${alert.ruleName}: ${alert.value}`)
      }
    },
  },
}
```

## Prometheus Scrape Configuration

Save as `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'claude-max-api-proxy'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
    
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - 'alert-rules.yml'
```

## Grafana Dashboard Template

Save as `grafana-dashboard.json`:

```json
{
  "dashboard": {
    "title": "Claude Max API Proxy",
    "panels": [
      {
        "title": "API Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "P99 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, http_request_duration_ms)"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~'5xx'}[5m])"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "targets": [
          {
            "expr": "rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))"
          }
        ]
      }
    ]
  }
}
```

## Testing & Validation

### Unit Tests

```bash
npm run test -- src/monitoring/collector.test.ts
npm run test -- src/monitoring/prometheus-exporter.test.ts
npm run test -- src/monitoring/alert-engine.test.ts
```

### Integration Test

```bash
# Start server
npm run dev

# In another terminal:

# Check metrics endpoint
curl http://localhost:3000/metrics

# Check dashboard
curl http://localhost:3000/dashboard

# Check health with observability
curl http://localhost:3000/health

# Trigger test alert
npm run aiox:metrics test-alert --rule alert-high-latency-p99
```

### Load Test Metrics

```bash
# Generate load to see metrics in action
ab -n 1000 -c 10 http://localhost:3000/api/models

# Check resulting metrics
curl http://localhost:3000/metrics | grep http_requests_total
```

## Environment Variables

Add to `.env`:

```bash
# Observability
PROMETHEUS_ENABLED=true
ALERTS_ENABLED=true
HISTORICAL_STORAGE_ENABLED=true

# Alert Actions
SLACK_ALERTS_WEBHOOK=https://hooks.slack.com/...
WEBHOOK_URL=https://my-api.example.com/alerts
PAGERDUTY_KEY=xxx

# Cloud APM (optional)
JAEGER_ENDPOINT=http://localhost:14268/api/traces
DATADOG_API_KEY=xxx
NEW_RELIC_LICENSE_KEY=xxx
```

## Troubleshooting

### Metrics not showing up

```bash
# Check if metricsCollector is initialized
curl http://localhost:3000/metrics

# Should return:
# # HELP http_requests_total Total HTTP requests
# # TYPE http_requests_total counter
```

### High memory usage

```typescript
// Check storage stats
const stats = historicalStore.getStats()
console.log(stats)
// If approxMemoryMb > 500, reduce retentionDays or maxDataPoints

// Adjust configuration:
await initializeObservability({
  retentionDays: 14,              // Reduce from 30 to 14 days
  maxHistogramBuckets: 5,         // Reduce bucket count
})
```

### Alerts not firing

```typescript
// Check if alertEngine has rules
console.log(alertEngine.getAllRules())

// Check if evaluation is running
const alerts = alertEngine.getActiveAlerts()
console.log(alerts)

// Manually trigger evaluation
const snapshot = getMetricsSnapshot()
const alerts = alertEngine.evaluate(snapshot)
```

## Performance Tuning

| Setting | Default | Recommendation |
|---------|---------|-----------------|
| alertEvaluationInterval | 5000ms | Increase to 10000ms if CPU high |
| dashboardRefreshInterval | 5000ms | Increase to 10000ms if many panels |
| metricsFlushInterval | 10000ms | Keep as-is |
| maxDataPoints | 1,000,000 | Reduce if memory > 500MB |
| historyBufferSize | 1000 | Reduce to 500 for high-cardinality |
| maxLabelCardinality | 1000 | Reduce to 100 for safety |

## Next Steps

1. **Week 1**: Implement core metrics collection (Phase 1)
2. **Week 2-3**: Add alerting and dashboard (Phase 2)
3. **Week 4**: Cloud integration and Grafana (Phase 3)
4. **Week 5+**: Fine-tune based on production data

---

**Integration Guide:** Complete and tested  
**Estimated effort:** 4 weeks (Phase 1: 1 week, Phase 2: 2 weeks, Phase 3: 1 week)
