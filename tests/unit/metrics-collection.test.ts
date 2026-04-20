import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MetricsCollector } from '../../src/monitoring/index.js'

describe('Metrics Collection (Story 010 Phase 1-2)', () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = new MetricsCollector()
  })

  describe('Counter metrics', () => {
    it('should increment counter with default value of 1', () => {
      collector.incrementCounter('requests', { service: 'api' })
      expect(collector.getCounter('requests', { service: 'api' })).toBe(1)
    })

    it('should increment counter with custom value', () => {
      collector.incrementCounter('errors', { service: 'api' }, 5)
      expect(collector.getCounter('errors', { service: 'api' })).toBe(5)
    })

    it('should accumulate counter increments', () => {
      collector.incrementCounter('total_requests', {})
      collector.incrementCounter('total_requests', {})
      collector.incrementCounter('total_requests', {})
      expect(collector.getCounter('total_requests', {})).toBe(3)
    })

    it('should handle multiple labels', () => {
      collector.incrementCounter('requests', { method: 'GET', status: '200' })
      collector.incrementCounter('requests', { method: 'POST', status: '201' })
      expect(collector.getCounter('requests', { method: 'GET', status: '200' })).toBe(1)
      expect(collector.getCounter('requests', { method: 'POST', status: '201' })).toBe(1)
    })
  })

  describe('Gauge metrics', () => {
    it('should set gauge value', () => {
      collector.setGauge('memory_usage', 256, { unit: 'MB' })
      expect(collector.getGauge('memory_usage', { unit: 'MB' })).toBe(256)
    })

    it('should overwrite previous gauge value', () => {
      collector.setGauge('cpu_usage', 45)
      collector.setGauge('cpu_usage', 67)
      expect(collector.getGauge('cpu_usage')).toBe(67)
    })

    it('should track multiple gauges independently', () => {
      collector.setGauge('memory', 512, { instance: '1' })
      collector.setGauge('memory', 256, { instance: '2' })
      expect(collector.getGauge('memory', { instance: '1' })).toBe(512)
      expect(collector.getGauge('memory', { instance: '2' })).toBe(256)
    })
  })

  describe('Histogram metrics', () => {
    it('should record histogram observations', () => {
      collector.recordHistogram('request_duration_ms', 45, { endpoint: '/api' })
      collector.recordHistogram('request_duration_ms', 67, { endpoint: '/api' })
      collector.recordHistogram('request_duration_ms', 23, { endpoint: '/api' })

      const hist = collector.getHistogram('request_duration_ms', { endpoint: '/api' })
      expect(hist).toBeTruthy()
      expect(hist?.count).toBe(3)
      expect(hist?.sum).toBe(135)
    })

    it('should calculate histogram percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordHistogram('latency', i * 10)
      }

      const hist = collector.getHistogram('latency')
      expect(hist).toBeTruthy()
      expect(hist?.count).toBe(100)
      expect(hist?.p50).toBeLessThanOrEqual(hist?.p95 || 0)
      expect(hist?.p95).toBeLessThanOrEqual(hist?.p99 || 0)
    })

    it('should handle histogram with multiple labels', () => {
      collector.recordHistogram('db_query_time', 100, { query: 'select', db: 'postgres' })
      collector.recordHistogram('db_query_time', 50, { query: 'insert', db: 'postgres' })

      const hist1 = collector.getHistogram('db_query_time', { query: 'select', db: 'postgres' })
      const hist2 = collector.getHistogram('db_query_time', { query: 'insert', db: 'postgres' })

      expect(hist1?.sum).toBe(100)
      expect(hist2?.sum).toBe(50)
    })
  })

  describe('Summary metrics', () => {
    it('should track summary statistics', () => {
      const values = [10, 20, 30, 40, 50]
      values.forEach(v => collector.recordSummary('response_size', v))

      const summary = collector.getSummary('response_size')
      expect(summary).toBeTruthy()
      expect(summary?.count).toBe(5)
      expect(summary?.sum).toBe(150)
      expect(summary?.avg).toBe(30)
    })

    it('should calculate min and max in summary', () => {
      [100, 50, 200, 75, 150].forEach(v => collector.recordSummary('metric', v))

      const summary = collector.getSummary('metric')
      expect(summary).toBeTruthy()
      expect(summary?.min).toBe(50)
      expect(summary?.max).toBe(200)
    })
  })

  describe('Metric labels and tags', () => {
    it('should isolate metrics by labels', () => {
      collector.incrementCounter('api_calls', { version: 'v1' })
      collector.incrementCounter('api_calls', { version: 'v2' })
      collector.incrementCounter('api_calls', { version: 'v1' })

      expect(collector.getCounter('api_calls', { version: 'v1' })).toBe(2)
      expect(collector.getCounter('api_calls', { version: 'v2' })).toBe(1)
    })

    it('should handle empty labels', () => {
      collector.incrementCounter('simple_counter', {})
      expect(collector.getCounter('simple_counter', {})).toBe(1)
    })

    it('should support nested label structures', () => {
      const labels = { app: 'myapp', env: 'prod', zone: 'us-east-1' }
      collector.incrementCounter('deployments', labels)
      expect(collector.getCounter('deployments', labels)).toBe(1)
    })
  })

  describe('Metric collection lifecycle', () => {
    it('should reset all metrics', () => {
      collector.incrementCounter('counter1', {})
      collector.setGauge('gauge1', 100)
      collector.reset()

      expect(collector.getCounter('counter1', {})).toBe(0)
      expect(collector.getGauge('gauge1')).toBeUndefined()
    })

    it('should export all metrics', () => {
      collector.incrementCounter('test_counter', { type: 'success' }, 5)
      collector.setGauge('test_gauge', 42)

      const exported = collector.exportMetrics()
      expect(exported).toHaveProperty('test_counter{type=success}')
      expect(exported).toHaveProperty('test_gauge')
    })
  })
})
