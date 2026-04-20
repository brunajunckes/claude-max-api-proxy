/**
 * Metrics/APM Tests
 * Tests for APM fallback, metric recording, and observability
 */
import { test } from 'node:test';
import assert from 'node:assert';

// Mock APM provider fallback
class APMProvider {
  private isHealthy: boolean = true;
  private metricsBuffer: any[] = [];

  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    if (this.isHealthy) {
      this.metricsBuffer.push({ name, value, tags, timestamp: Date.now() });
    }
  }

  recordEvent(eventName: string, attributes?: Record<string, any>) {
    if (this.isHealthy) {
      this.metricsBuffer.push({ type: 'event', name: eventName, attributes, timestamp: Date.now() });
    }
  }

  getMetrics() {
    return this.metricsBuffer;
  }

  clearMetrics() {
    this.metricsBuffer = [];
  }

  setHealth(healthy: boolean) {
    this.isHealthy = healthy;
  }
}

// PHASE 6: APM/Metrics Tests - 2 tests

test('APM - Metrics collection with fallback provider', () => {
  const apm = new APMProvider();

  apm.recordMetric('request.latency', 42, { endpoint: '/api/test', status: '200' });
  apm.recordMetric('cache.hit', 1, { cacheKey: 'model-cache' });
  apm.recordMetric('error.rate', 0.05, { service: 'api' });

  const metrics = apm.getMetrics();

  assert.equal(metrics.length, 3);
  assert.equal(metrics[0].name, 'request.latency');
  assert.equal(metrics[0].value, 42);
  assert.equal(metrics[1].name, 'cache.hit');
});

test('APM - Graceful fallback on provider failure', () => {
  const apm = new APMProvider();

  apm.recordMetric('metric1', 100);
  assert.equal(apm.getMetrics().length, 1);

  apm.setHealth(false);
  apm.recordMetric('metric2', 200);

  // With health=false, metric should not be recorded
  assert.equal(apm.getMetrics().length, 1);

  apm.setHealth(true);
  apm.recordMetric('metric3', 300);

  assert.equal(apm.getMetrics().length, 2);
});
