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

class TracingManager {
  private activeSpans = new Map<string, TraceContext>();

  extractTraceContext(headers: Record<string, any>): TraceContext {
    const traceparent = headers['traceparent'] || '';
    const [version, traceId, spanId, flags] = traceparent.split('-');

    return {
      traceId: traceId || this.generateId(),
      spanId: spanId || this.generateId(),
      sampled: flags === '01'
    };
  }

  injectTraceContext(traceContext: TraceContext): Record<string, string> {
    return {
      'traceparent': `00-${traceContext.traceId}-${traceContext.spanId}-${traceContext.sampled ? '01' : '00'}`,
      'tracestate': ''
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

    return () => {
      this.activeSpans.delete(fullSpanId);
    };
  }
}

export const tracingManager = new TracingManager();
