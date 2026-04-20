/**
 * Timer Utilities — Latency Tracking Decorators & Helpers
 *
 * Provides decorators and utilities for automatic latency tracking
 * with minimal overhead (< 1ms per operation)
 */

import { performance } from 'perf_hooks';
import { metricsCollector } from './metrics-collector.js';

/**
 * Timer context for tracking operation duration.
 */
export class TimerContext {
  private startTime: number;
  private startMemory: number;
  private name: string;
  private labels?: Record<string, string | number>;

  constructor(name: string, labels?: Record<string, string | number>) {
    this.name = name;
    this.labels = labels;
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage().heapUsed;
  }

  /**
   * End timer and record metrics.
   */
  end(): TimerResult {
    const duration = performance.now() - this.startTime;
    const memoryDelta = process.memoryUsage().heapUsed - this.startMemory;

    metricsCollector.recordHistogram(`${this.name}_duration_ms`, duration, this.labels);
    metricsCollector.recordHistogram(`${this.name}_memory_delta_bytes`, memoryDelta, this.labels);

    return {
      duration,
      memoryDelta,
      name: this.name,
    };
  }
}

export interface TimerResult {
  duration: number;
  memoryDelta: number;
  name: string;
}

/**
 * Create a timer context.
 */
export function createTimer(
  name: string,
  labels?: Record<string, string | number>,
): TimerContext {
  return new TimerContext(name, labels);
}

/**
 * Decorator for method latency tracking.
 */
export function timed(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = metricName ?? `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      const timer = createTimer(name, { method: propertyKey });
      try {
        const result = originalMethod.apply(this, args);

        // Handle async functions
        if (result instanceof Promise) {
          return result
            .then((value: any) => {
              timer.end();
              return value;
            })
            .catch((error: any) => {
              timer.end();
              throw error;
            });
        }

        timer.end();
        return result;
      } catch (error) {
        timer.end();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator for async function latency tracking.
 */
export function timedAsync(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = metricName ?? `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const timer = createTimer(name, { method: propertyKey });
      try {
        const result = await originalMethod.apply(this, args);
        timer.end();
        return result;
      } catch (error) {
        timer.end();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Measure latency of a function call.
 */
export function measureLatency<T>(
  name: string,
  fn: () => T,
  labels?: Record<string, string | number>,
): T {
  const timer = createTimer(name, labels);
  try {
    return fn();
  } finally {
    timer.end();
  }
}

/**
 * Measure latency of an async function call.
 */
export async function measureLatencyAsync<T>(
  name: string,
  fn: () => Promise<T>,
  labels?: Record<string, string | number>,
): Promise<T> {
  const timer = createTimer(name, labels);
  try {
    return await fn();
  } finally {
    timer.end();
  }
}

/**
 * Batch timer for tracking multiple operations.
 */
export class BatchTimer {
  private timers: Map<string, TimerContext> = new Map();
  private batchName: string;

  constructor(batchName: string) {
    this.batchName = batchName;
  }

  /**
   * Start a named operation within the batch.
   */
  start(operation: string): void {
    const name = `${this.batchName}_${operation}`;
    this.timers.set(operation, createTimer(name));
  }

  /**
   * End a named operation.
   */
  end(operation: string): TimerResult | null {
    const timer = this.timers.get(operation);
    if (!timer) return null;

    const result = timer.end();
    this.timers.delete(operation);
    return result;
  }

  /**
   * Get all results from batch.
   */
  getResults(): Record<string, TimerResult> {
    const results: Record<string, TimerResult> = {};

    for (const [operation, timer] of this.timers.entries()) {
      results[operation] = timer.end();
      this.timers.delete(operation);
    }

    return results;
  }
}

/**
 * Express middleware for request latency tracking.
 */
export function requestTimerMiddleware(
  metricsPrefix: string = 'http_request',
) {
  return (req: any, res: any, next: any) => {
    const timer = createTimer(metricsPrefix, {
      method: req.method,
      path: req.path,
      status: String(res.statusCode),
    });

    const originalSend = res.send;
    res.send = function (data: any) {
      timer.end();
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Track function execution and record throughput.
 */
export class ThroughputTracker {
  private operations: number = 0;
  private startTime: number = Date.now();
  private metricName: string;

  constructor(metricName: string) {
    this.metricName = metricName;
  }

  /**
   * Record an operation completion.
   */
  recordOperation(count: number = 1): void {
    this.operations += count;
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;

    if (elapsedSeconds > 0) {
      const throughput = this.operations / elapsedSeconds;
      metricsCollector.setGauge(`${this.metricName}_throughput_ops_per_second`, throughput);
      metricsCollector.setGauge(`${this.metricName}_total_operations`, this.operations);
    }
  }

  /**
   * Get current throughput.
   */
  getThroughput(): number {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return elapsedSeconds > 0 ? this.operations / elapsedSeconds : 0;
  }

  /**
   * Reset tracker.
   */
  reset(): void {
    this.operations = 0;
    this.startTime = Date.now();
  }
}
