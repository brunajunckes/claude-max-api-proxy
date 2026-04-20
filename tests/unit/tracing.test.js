import { test, describe, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { TracingManager } from '../../src/monitoring/tracing.js';
describe('TracingManager', () => {
    let tracing;
    before(() => {
        tracing = new TracingManager();
    });
    test('extractTraceContext parses W3C traceparent header', () => {
        const headers = {
            'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
        };
        const context = tracing.extractTraceContext(headers);
        assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
        assert.equal(context.spanId, '00f067aa0ba902b7');
        assert.equal(context.sampled, true);
    });
    test('extractTraceContext generates IDs when header missing', () => {
        const headers = {};
        const context = tracing.extractTraceContext(headers);
        assert.ok(context.traceId);
        assert.ok(context.spanId);
        assert.equal(context.sampled, false);
    });
    test('extractTraceContext handles malformed traceparent', () => {
        const headers = {
            'traceparent': 'invalid-format'
        };
        const context = tracing.extractTraceContext(headers);
        assert.ok(context.traceId);
        assert.ok(context.spanId);
    });
    test('injectTraceContext creates valid W3C header', () => {
        const context = {
            traceId: 'trace123',
            spanId: 'span456',
            sampled: true
        };
        const headers = tracing.injectTraceContext(context);
        assert.equal(headers['traceparent'], '00-trace123-span456-01');
        assert.ok(headers['tracestate']);
    });
    test('injectTraceContext sets correct sampled flag', () => {
        const context = {
            traceId: 'trace123',
            spanId: 'span456',
            sampled: false
        };
        const headers = tracing.injectTraceContext(context);
        assert.equal(headers['traceparent'], '00-trace123-span456-00');
    });
    test('createChildSpan maintains parent traceId', () => {
        const parentContext = {
            traceId: 'parent-trace-123',
            spanId: 'parent-span-456',
            sampled: true
        };
        const childContext = tracing.createChildSpan(parentContext);
        assert.equal(childContext.traceId, 'parent-trace-123');
        assert.equal(childContext.parentSpanId, 'parent-span-456');
        assert.notEqual(childContext.spanId, 'parent-span-456');
        assert.equal(childContext.sampled, true);
    });
    test('startSpan creates and tracks active span', () => {
        const context = {
            traceId: 'trace-123',
            spanId: 'span-456',
            sampled: true
        };
        const endSpan = tracing.startSpan('test-operation', context);
        const activeSpans = tracing.getAllActiveSpans();
        assert.ok(activeSpans.length > 0);
        endSpan();
        const spansAfter = tracing.getAllActiveSpans();
        assert.ok(spansAfter.length < activeSpans.length || spansAfter.length === 0);
    });
    test('getActiveSpanCount returns correct count', () => {
        const context = {
            traceId: 'trace-123',
            spanId: 'span-456',
            sampled: true
        };
        const countBefore = tracing.getActiveSpanCount();
        const end1 = tracing.startSpan('op1', context);
        const countAfter = tracing.getActiveSpanCount();
        assert.ok(countAfter >= countBefore);
        end1();
    });
    test('recordSpanEvent stores event with metadata', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        const event = {
            name: 'test-event',
            startTime: Date.now(),
            attributes: { operation: 'test', duration: 100 },
            status: 'ok'
        };
        tracing.recordSpanEvent(traceId, event);
        const events = tracing.getSpanEvents(traceId);
        assert.ok(events.length > 0);
        assert.equal(events[0].name, 'test-event');
        assert.equal(events[0].attributes?.operation, 'test');
    });
    test('recordOperationSpan creates event with duration', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.recordOperationSpan(traceId, 'cache.get', 42, {
            key: 'test-key',
            status: 'hit'
        });
        const events = tracing.getSpanEvents(traceId);
        assert.ok(events.length > 0);
        assert.equal(events[events.length - 1].name, 'cache.get');
        assert.equal(events[events.length - 1].status, 'ok');
    });
    test('recordOperationSpan marks error status on error attribute', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.recordOperationSpan(traceId, 'db.query', 100, {
            error: true,
            message: 'Connection timeout'
        });
        const events = tracing.getSpanEvents(traceId);
        assert.equal(events[events.length - 1].status, 'error');
    });
    test('setExporter configures trace exporter', () => {
        tracing.setExporter('jaeger');
        // Internal state, verify no error thrown
        assert.ok(true);
        tracing.setExporter('console');
        assert.ok(true);
    });
    test('getSpanEvents returns empty array for unknown traceId', () => {
        const unknownEvents = tracing.getSpanEvents('unknown-trace-' + Math.random());
        assert.deepEqual(unknownEvents, []);
    });
    test('flushSpans removes events after flush', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.recordOperationSpan(traceId, 'test', 10, {});
        const before = tracing.getSpanEvents(traceId);
        assert.ok(before.length > 0);
        tracing.flushSpans(traceId);
        const after = tracing.getSpanEvents(traceId);
        assert.equal(after.length, 0);
    });
    test('multiple spans can be recorded for same traceId', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.recordOperationSpan(traceId, 'op1', 10, {});
        tracing.recordOperationSpan(traceId, 'op2', 20, {});
        tracing.recordOperationSpan(traceId, 'op3', 30, {});
        const events = tracing.getSpanEvents(traceId);
        assert.equal(events.length, 3);
    });
    test('W3C trace context propagation across services', () => {
        const headers = {
            'traceparent': '00-abc123def456-xyz789-01'
        };
        const extracted = tracing.extractTraceContext(headers);
        const injected = tracing.injectTraceContext(extracted);
        assert.ok(injected['traceparent'].includes('abc123def456'));
        assert.ok(injected['traceparent'].includes('-01'));
    });
    test('parent-child span relationship preserved', () => {
        const parentContext = {
            traceId: 'trace-parent-123',
            spanId: 'parent-456',
            sampled: true
        };
        const child1 = tracing.createChildSpan(parentContext);
        const child2 = tracing.createChildSpan(parentContext);
        assert.equal(child1.traceId, child2.traceId);
        assert.equal(child1.parentSpanId, 'parent-456');
        assert.equal(child2.parentSpanId, 'parent-456');
        assert.notEqual(child1.spanId, child2.spanId);
    });
    test('getAllActiveSpans returns array of contexts', () => {
        const context = {
            traceId: 'trace-123',
            spanId: 'span-456',
            sampled: true
        };
        const end1 = tracing.startSpan('op1', context);
        const activeSpans = tracing.getAllActiveSpans();
        assert.ok(Array.isArray(activeSpans));
        assert.ok(activeSpans.every((span) => span.traceId));
        end1();
    });
    test('span events are timestamped correctly', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        const beforeTime = Date.now();
        tracing.recordOperationSpan(traceId, 'operation', 50, {});
        const afterTime = Date.now();
        const events = tracing.getSpanEvents(traceId);
        const lastEvent = events[events.length - 1];
        assert.ok(lastEvent.startTime >= beforeTime - 100);
        assert.ok((lastEvent.endTime || 0) <= afterTime + 100);
    });
    test('flushSpans handles empty trace correctly', () => {
        const emptyTraceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.flushSpans(emptyTraceId);
        // Should not throw error
        assert.ok(true);
    });
    test('multiple flushes are safe', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        tracing.recordOperationSpan(traceId, 'op', 10, {});
        tracing.flushSpans(traceId);
        tracing.flushSpans(traceId); // Second flush on empty
        tracing.flushSpans(traceId); // Third flush
        const events = tracing.getSpanEvents(traceId);
        assert.equal(events.length, 0);
    });
    test('operation span with attributes preserves all metadata', () => {
        const traceId = 'trace-' + Math.random().toString(16).slice(2);
        const attrs = {
            userId: 'user-123',
            endpoint: '/api/models',
            statusCode: 200,
            cache: 'hit',
            latencyMs: 45
        };
        tracing.recordOperationSpan(traceId, 'http.request', 45, attrs);
        const events = tracing.getSpanEvents(traceId);
        const lastEvent = events[events.length - 1];
        assert.deepEqual(lastEvent.attributes, attrs);
    });
});
describe('TracingManager - Concurrent Operations', () => {
    test('concurrent span creation for different traces', () => {
        const tracing2 = new TracingManager();
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(Promise.resolve().then(() => {
                const context = {
                    traceId: `trace-${i}`,
                    spanId: `span-${i}`,
                    sampled: true
                };
                const end = tracing2.startSpan(`op-${i}`, context);
                end();
            }));
        }
        return Promise.all(promises);
    });
    test('concurrent event recording maintains integrity', async () => {
        const tracing3 = new TracingManager();
        const traceId = 'concurrent-trace-' + Math.random().toString(16).slice(2);
        const promises = Array.from({ length: 20 }, (_, i) => Promise.resolve().then(() => {
            tracing3.recordOperationSpan(traceId, `op-${i}`, i * 10, {
                index: i
            });
        }));
        await Promise.all(promises);
        const events = tracing3.getSpanEvents(traceId);
        assert.equal(events.length, 20);
    });
});
//# sourceMappingURL=tracing.test.js.map