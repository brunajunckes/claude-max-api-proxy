import { test } from "node:test";
import { strict as assert } from "node:assert";
import { observabilityManager } from "./observability.js";
import { tracingManager } from "./tracing.js";

test("ObservabilityManager records request metrics", () => {
  observabilityManager.recordRequest(100);
  observabilityManager.recordRequest(200);
  observabilityManager.recordRequest(150);

  const snapshot = observabilityManager.getSnapshot();
  assert.equal(snapshot.requests.total, 3);
  assert.deepEqual(snapshot.requests.errors, 0);
});

test("ObservabilityManager calculates latency percentiles", () => {
  // Clear and re-populate with known values
  for (let i = 0; i < 100; i++) {
    observabilityManager.recordRequest(i * 10);
  }

  const snapshot = observabilityManager.getSnapshot();
  assert(snapshot.latency.p50 >= 0);
  assert(snapshot.latency.p95 >= snapshot.latency.p50);
  assert(snapshot.latency.p99 >= snapshot.latency.p95);
});

test("ObservabilityManager records errors", () => {
  observabilityManager.recordRequest(100, false);
  observabilityManager.recordRequest(200, true);
  observabilityManager.recordRequest(150, true);

  const snapshot = observabilityManager.getSnapshot();
  assert.equal(snapshot.requests.errors, 2);
});

test("TracingManager extracts trace context from headers", () => {
  const headers = {
    'traceparent': '00-abc123-def456-01'
  };

  const context = tracingManager.extractTraceContext(headers);
  assert.equal(context.traceId, 'abc123');
  assert.equal(context.spanId, 'def456');
  assert.equal(context.sampled, true);
});

test("TracingManager generates trace IDs when missing", () => {
  const context = tracingManager.extractTraceContext({});
  assert(context.traceId.length > 0);
  assert(context.spanId.length > 0);
});

test("TracingManager injects trace context into headers", () => {
  const context = {
    traceId: 'abc123',
    spanId: 'def456',
    sampled: true
  };

  const headers = tracingManager.injectTraceContext(context);
  assert(headers['traceparent'].includes('abc123'));
  assert(headers['traceparent'].includes('def456'));
  assert(headers['traceparent'].includes('01'));
});

test("TracingManager creates child spans", () => {
  const parentContext = {
    traceId: 'abc123',
    spanId: 'parent456',
    sampled: true
  };

  const childContext = tracingManager.createChildSpan(parentContext);
  assert.equal(childContext.traceId, parentContext.traceId);
  assert.equal(childContext.parentSpanId, parentContext.spanId);
  assert.notEqual(childContext.spanId, parentContext.spanId);
});

test("ObservabilityManager records active requests", () => {
  observabilityManager.recordActiveRequest(1);
  observabilityManager.recordActiveRequest(1);
  observabilityManager.recordActiveRequest(1);

  let snapshot = observabilityManager.getSnapshot();
  assert.equal(snapshot.requests.active, 3);

  observabilityManager.recordActiveRequest(-2);
  snapshot = observabilityManager.getSnapshot();
  assert.equal(snapshot.requests.active, 1);
});

test("ObservabilityManager never goes below 0 active requests", () => {
  observabilityManager.recordActiveRequest(-100);
  const snapshot = observabilityManager.getSnapshot();
  assert.equal(snapshot.requests.active, 0);
});

test("ObservabilityManager includes memory metrics", () => {
  const snapshot = observabilityManager.getSnapshot();
  assert(snapshot.memory.heap_used_mb >= 0);
  assert(snapshot.memory.heap_total_mb >= snapshot.memory.heap_used_mb);
  assert(snapshot.memory.external_mb >= 0);
});
