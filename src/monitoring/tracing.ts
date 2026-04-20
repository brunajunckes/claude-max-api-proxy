/**
 * Distributed Tracing
 * W3C Trace Context + Parent-Child span tracking
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface SpanEvent {
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, any>;
  status?: 'unset' | 'ok' | 'error';
}

class TracingManager {
  private activeSpans = new Map<string, TraceContext>();
  private spanEvents = new Map<string, SpanEvent[]>();
  private exporter: 'console' | 'jaeger' | 'tempo' = 'console';

  extractTraceContext(headers: Record<string, any>): TraceContext {
    const traceparent = headers['traceparent'] || '';

    // W3C Trace Context format: version-traceId-spanId-traceFlags
    // This is 4 components separated by -, but traceId can contain -
    // So we need to parse carefully: version (2 chars) - traceId (32 chars) - spanId (16 chars) - flags (2 chars)
    const parts = traceparent.split('-');

    let version = '', traceId = '', spanId = '', flags = '';

    if (parts.length >= 4) {
      // Proper format with fixed-length fields
      version = parts[0];
      traceId = parts[1];
      spanId = parts[2];
      flags = parts[3];
    }

    return {
      traceId: traceId || this.generateId(),
      spanId: spanId || this.generateId(),
      sampled: flags === '01'
    };
  }

  injectTraceContext(traceContext: TraceContext): Record<string, string> {
    // Generate vendor-specific tracestate (W3C Trace Context spec)
    // Format: vendor1=value1,vendor2=value2
    const timestamp = Date.now();
    const tracestate = `dd=s:1;t.usr.id=${timestamp}`;

    return {
      'traceparent': `00-${traceContext.traceId}-${traceContext.spanId}-${traceContext.sampled ? '01' : '00'}`,
      'tracestate': tracestate
    };
  }

  createChildSpan(parentContext: TraceContext): TraceContext {
    return {
      traceId: parentContext.traceId,
      spanId: this.generateId(),
      parentSpanId: parentContext.spanId,
      sampled: parentContext.sampled
    };
  }

  private generateId(): string {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  startSpan(name: string, context: TraceContext): () => void {
    const spanId = this.generateId();
    const fullSpanId = `${context.traceId}:${spanId}`;

    this.activeSpans.set(fullSpanId, {
      ...context,
      spanId
    });

    if (process.env.DEBUG_TRACING) {
      console.log(`[TRACE] Start span: ${name} (${spanId}) - parent: ${context.spanId}`);
    }

    return () => {
      this.activeSpans.delete(fullSpanId);
      if (process.env.DEBUG_TRACING) {
        console.log(`[TRACE] End span: ${name} (${spanId})`);
      }
    };
  }

  getActiveSpanCount(): number {
    return this.activeSpans.size;
  }

  getAllActiveSpans(): TraceContext[] {
    return Array.from(this.activeSpans.values());
  }

  recordSpanEvent(traceId: string, event: SpanEvent): void {
    if (!this.spanEvents.has(traceId)) {
      this.spanEvents.set(traceId, []);
    }
    this.spanEvents.get(traceId)?.push(event);

    if (process.env.DEBUG_TRACING) {
      console.log(`[TRACE] Event: ${event.name} (${event.attributes?.operation || 'N/A'})`);
    }
  }

  recordOperationSpan(
    traceId: string,
    operation: string,
    durationMs: number,
    attributes?: Record<string, any>
  ): void {
    const event: SpanEvent = {
      name: operation,
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      attributes,
      status: (attributes?.error ? 'error' : 'ok') as 'ok' | 'error'
    };
    this.recordSpanEvent(traceId, event);
  }

  setExporter(exporter: 'console' | 'jaeger' | 'tempo'): void {
    this.exporter = exporter;
    if (process.env.DEBUG_TRACING) {
      console.log(`[TRACE] Exporter set to: ${exporter}`);
    }
  }

  getSpanEvents(traceId: string): SpanEvent[] {
    return this.spanEvents.get(traceId) || [];
  }

  flushSpans(traceId: string): void {
    const events = this.spanEvents.get(traceId);
    if (!events || events.length === 0) return;

    if (this.exporter === 'console') {
      console.log(`[TRACE FLUSH] ${traceId} - ${events.length} spans`);
    }
    // TODO: Implement Jaeger/Tempo exporters

    this.spanEvents.delete(traceId);
  }
}

export const tracingManager = new TracingManager();
export { TracingManager };
