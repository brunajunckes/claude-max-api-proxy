import { describe, it, expect, beforeEach } from 'vitest'
import { PrometheusExporter } from '../../src/monitoring/index.js'

describe('Prometheus Format (Story 010 Phase 1-2)', () => {
  let exporter: PrometheusExporter

  beforeEach(() => {
    exporter = new PrometheusExporter()
  })

  describe('Counter format', () => {
    it('should export counter in Prometheus text format', () => {
      exporter.addCounter('http_requests_total', 100, { method: 'GET', status: '200' })

      const output = exporter.export()
      expect(output).toContain('http_requests_total{method="GET",status="200"} 100')
    })

    it('should include TYPE and HELP comments', () => {
      exporter.addCounter('requests_total', 50)
      const output = exporter.export()

      expect(output).toContain('# TYPE requests_total counter')
      expect(output).toContain('# HELP requests_total')
    })

    it('should handle multiple counter instances', () => {
      exporter.addCounter('errors', 5, { service: 'api' })
      exporter.addCounter('errors', 3, { service: 'db' })

      const output = exporter.export()
      expect(output).toContain('errors{service="api"} 5')
      expect(output).toContain('errors{service="db"} 3')
    })
  })

  describe('Gauge format', () => {
    it('should export gauge in Prometheus text format', () => {
      exporter.addGauge('memory_usage_bytes', 1024000, { instance: 'server1' })

      const output = exporter.export()
      expect(output).toContain('memory_usage_bytes{instance="server1"} 1024000')
    })

    it('should handle decimal gauge values', () => {
      exporter.addGauge('cpu_load', 2.45)
      const output = exporter.export()

      expect(output).toContain('cpu_load 2.45')
    })
  })

  describe('Histogram format', () => {
    it('should export histogram buckets', () => {
      exporter.addHistogram('request_duration_seconds', {
        buckets: [
          { le: '0.005', count: 10 },
          { le: '0.01', count: 20 },
          { le: '+Inf', count: 30 }
        ],
        sum: 0.15,
        count: 30,
        labels: { endpoint: '/api' }
      })

      const output = exporter.export()
      expect(output).toContain('request_duration_seconds_bucket{endpoint="/api",le="0.005"} 10')
      expect(output).toContain('request_duration_seconds_bucket{endpoint="/api",le="0.01"} 20')
      expect(output).toContain('request_duration_seconds_sum{endpoint="/api"} 0.15')
      expect(output).toContain('request_duration_seconds_count{endpoint="/api"} 30')
    })

    it('should include cumulative bucket counts', () => {
      exporter.addHistogram('latency', {
        buckets: [
          { le: '10', count: 100 },
          { le: '50', count: 200 }
        ],
        sum: 5000,
        count: 200,
        labels: {}
      })

      const output = exporter.export()
      expect(output).toContain('latency_bucket{le="10"} 100')
      expect(output).toContain('latency_bucket{le="50"} 200')
    })
  })

  describe('Summary format', () => {
    it('should export summary quantiles', () => {
      exporter.addSummary('response_size_bytes', {
        quantiles: [
          { q: '0.5', value: 1000 },
          { q: '0.9', value: 5000 },
          { q: '0.99', value: 10000 }
        ],
        sum: 100000,
        count: 50,
        labels: { endpoint: '/data' }
      })

      const output = exporter.export()
      expect(output).toContain('response_size_bytes{endpoint="/data",quantile="0.5"} 1000')
      expect(output).toContain('response_size_bytes{endpoint="/data",quantile="0.9"} 5000')
      expect(output).toContain('response_size_bytes{endpoint="/data",quantile="0.99"} 10000')
    })
  })

  describe('Label escaping and formatting', () => {
    it('should escape special characters in label values', () => {
      exporter.addCounter('metric', 1, { path: '/api/v1\nstatus' })
      const output = exporter.export()

      expect(output).toContain('path="/api/v1\\nstatus"')
    })

    it('should escape quotes in labels', () => {
      exporter.addCounter('metric', 1, { message: 'Error: "invalid"' })
      const output = exporter.export()

      expect(output).toContain('message="Error: \\"invalid\\""')
    })

    it('should handle labels with backslashes', () => {
      exporter.addCounter('metric', 1, { path: 'C:\\Windows\\System32' })
      const output = exporter.export()

      expect(output).toContain('path="C:\\\\Windows\\\\System32"')
    })

    it('should sort labels alphabetically', () => {
      exporter.addCounter('metric', 1, { z: '1', a: '2', m: '3' })
      const output = exporter.export()

      const match = output.match(/metric\{([^}]+)\}/)
      expect(match).toBeTruthy()
      const labels = match![1]
      expect(labels.indexOf('a=')).toBeLessThan(labels.indexOf('m='))
      expect(labels.indexOf('m=')).toBeLessThan(labels.indexOf('z='))
    })
  })

  describe('Timestamp handling', () => {
    it('should include timestamp if provided', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      exporter.addCounter('metric', 42, {})

      const output = exporter.export()
      expect(output).toContain('metric 42')
    })

    it('should omit timestamp if not provided', () => {
      exporter.addCounter('metric', 42)
      const output = exporter.export()

      const lines = output.split('\n').filter(l => !l.startsWith('#') && l.trim())
      expect(lines.some(l => l.includes('metric 42') && !l.match(/\d+ \d+$/))).toBeTruthy()
    })
  })

  describe('Export format validation', () => {
    it('should produce valid Prometheus text format', () => {
      exporter.addCounter('test_counter', 10)
      exporter.addGauge('test_gauge', 20)

      const output = exporter.export()
      const lines = output.split('\n').filter(l => l.trim())

      lines.forEach(line => {
        if (!line.startsWith('#')) {
          expect(line).toMatch(/^[\w:]+(\{[^}]+\})?\s+[-+]?[\d.eE+\-]+(\s+\d+)?$/)
        }
      })
    })

    it('should include HELP before TYPE', () => {
      exporter.addCounter('metric', 1)
      const output = exporter.export()

      const helpIdx = output.indexOf('# HELP metric')
      const typeIdx = output.indexOf('# TYPE metric')

      expect(helpIdx).toBeGreaterThanOrEqual(0)
      expect(typeIdx).toBeGreaterThan(helpIdx)
    })
  })
})
