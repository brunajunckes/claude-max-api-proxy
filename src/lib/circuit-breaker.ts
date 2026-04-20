/**
 * Circuit Breaker Pattern for Resilience
 *
 * Implements a finite state machine to prevent cascading failures:
 * CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * Prevents excessive API calls when the service is unavailable.
 */

import { performance } from 'perf_hooks';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',       // Normal operation, all calls pass through
  OPEN = 'OPEN',           // Service unavailable, calls rejected immediately
  HALF_OPEN = 'HALF_OPEN', // Testing recovery, single call allowed
}

export interface CircuitBreakerConfig {
  /** Number of failures required to open the circuit */
  threshold?: number;

  /** Time window (ms) to reset failure count */
  timeoutMs?: number;

  /** Time (ms) circuit stays in HALF_OPEN before attempting recovery */
  halfOpenTimeoutMs?: number;

  /** Maximum backoff delay (ms) between recovery attempts */
  backoffMaxMs?: number;

  /** Optional name for logging and metrics */
  name?: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureAt?: Date;
  lastSuccessAt?: Date;
  stateChangedAt: Date;
  backoffMultiplier: number;
}

/**
 * Generic CircuitBreaker implementation with exponential backoff.
 *
 * Usage:
 * ```
 * const breaker = new CircuitBreaker<string>({
 *   threshold: 5,
 *   timeoutMs: 60000,
 *   halfOpenTimeoutMs: 30000,
 * });
 *
 * try {
 *   const result = await breaker.execute(() => apiCall());
 * } catch (err) {
 *   if (err instanceof CircuitBreakerOpenError) {
 *     // Use fallback response
 *   }
 * }
 * ```
 */
export class CircuitBreaker<T = unknown> {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangeTime: number = Date.now();
  private halfOpenAttemptTime?: number;
  private backoffMultiplier: number = 1;
  private lastStateChangeReason: string = 'initialized';

  // Configuration
  private readonly threshold: number;
  private readonly timeoutMs: number;
  private readonly halfOpenTimeoutMs: number;
  private readonly backoffMaxMs: number;
  private readonly name: string;

  constructor(config: CircuitBreakerConfig = {}) {
    this.threshold = config.threshold ?? 5;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.halfOpenTimeoutMs = config.halfOpenTimeoutMs ?? 30000;
    this.backoffMaxMs = config.backoffMaxMs ?? 30000;
    this.name = config.name ?? 'default';
  }

  /**
   * Execute an operation through the circuit breaker.
   * Throws CircuitBreakerOpenError if circuit is open.
   */
  async execute(fn: () => Promise<T>): Promise<T> {
    this.checkStateTransitions();

    if (this.state === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker (${this.name}) is OPEN`,
      );
    }

    if (
      this.state === CircuitBreakerState.HALF_OPEN &&
      !this.canAttemptHalfOpenRequest()
    ) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker (${this.name}) is HALF_OPEN and backoff not expired`,
      );
    }

    const startTime = performance.now();

    try {
      const result = await fn();
      this.recordSuccess(startTime);
      return result;
    } catch (error) {
      this.recordFailure(startTime);
      throw error;
    }
  }

  /**
   * Execute synchronously (for sync operations).
   */
  executeSync(fn: () => T): T {
    this.checkStateTransitions();

    if (this.state === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker (${this.name}) is OPEN`,
      );
    }

    if (
      this.state === CircuitBreakerState.HALF_OPEN &&
      !this.canAttemptHalfOpenRequest()
    ) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker (${this.name}) is HALF_OPEN and backoff not expired`,
      );
    }

    const startTime = performance.now();

    try {
      const result = fn();
      this.recordSuccess(startTime);
      return result;
    } catch (error) {
      this.recordFailure(startTime);
      throw error;
    }
  }

  /**
   * Check and perform state transitions.
   * CLOSED → OPEN: on threshold failures
   * OPEN → HALF_OPEN: on timeout
   * HALF_OPEN → CLOSED: on success
   * HALF_OPEN → OPEN: on failure
   */
  private checkStateTransitions(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we should transition to OPEN
      if (this.lastFailureTime && now - this.lastFailureTime > this.timeoutMs) {
        // Reset failure count after timeout window
        this.failureCount = 0;
      }
    } else if (this.state === CircuitBreakerState.OPEN) {
      // Check if we should transition to HALF_OPEN
      const timeSinceStateChange = now - this.stateChangeTime;
      const currentBackoff = this.getBackoffDelayMs();

      if (timeSinceStateChange >= currentBackoff) {
        this.transitionToHalfOpen(now);
      }
    }
  }

  /**
   * Check if we can attempt a request in HALF_OPEN state.
   */
  private canAttemptHalfOpenRequest(): boolean {
    if (!this.halfOpenAttemptTime) return true;
    const now = Date.now();
    return now - this.halfOpenAttemptTime >= this.getBackoffDelayMs();
  }

  /**
   * Record a successful operation.
   */
  private recordSuccess(startTime: number): void {
    const duration = performance.now() - startTime;
    this.successCount++;
    this.totalCalls++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Success in HALF_OPEN → transition to CLOSED
      this.transitionToClosed();
    }

    // Reset backoff on success
    if (this.backoffMultiplier > 1) {
      this.backoffMultiplier = Math.max(1, this.backoffMultiplier / 2);
    }
  }

  /**
   * Record a failed operation.
   */
  private recordFailure(startTime: number): void {
    const duration = performance.now() - startTime;
    this.failureCount++;
    this.totalCalls++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.failureCount >= this.threshold) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in HALF_OPEN → back to OPEN with increased backoff
      this.backoffMultiplier = Math.min(
        16,
        this.backoffMultiplier * 2,
      );
      this.transitionToOpen();
    }
  }

  /**
   * Transition: CLOSED → OPEN
   */
  private transitionToOpen(): void {
    if (this.state === CircuitBreakerState.OPEN) return;

    this.state = CircuitBreakerState.OPEN;
    this.stateChangeTime = Date.now();
    this.lastStateChangeReason = `threshold_exceeded (${this.failureCount} failures)`;
    this.backoffMultiplier = Math.max(1, this.backoffMultiplier);
  }

  /**
   * Transition: OPEN → HALF_OPEN
   */
  private transitionToHalfOpen(now: number): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) return;

    this.state = CircuitBreakerState.HALF_OPEN;
    this.stateChangeTime = now;
    this.halfOpenAttemptTime = now;
    this.lastStateChangeReason = 'backoff_expired';
  }

  /**
   * Transition: HALF_OPEN → CLOSED
   */
  private transitionToClosed(): void {
    if (this.state === CircuitBreakerState.CLOSED) return;

    this.state = CircuitBreakerState.CLOSED;
    this.stateChangeTime = Date.now();
    this.failureCount = 0;
    this.backoffMultiplier = 1;
    this.halfOpenAttemptTime = undefined;
    this.lastStateChangeReason = 'recovery_successful';
  }

  /**
   * Calculate current backoff delay based on multiplier.
   * Exponential: 1s → 2s → 4s → 8s (capped at backoffMaxMs)
   */
  private getBackoffDelayMs(): number {
    const baseDelay = 1000;
    const delayMs = baseDelay * this.backoffMultiplier;
    return Math.min(delayMs, this.backoffMaxMs);
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureAt: this.lastFailureTime
        ? new Date(this.lastFailureTime)
        : undefined,
      lastSuccessAt: this.lastSuccessTime
        ? new Date(this.lastSuccessTime)
        : undefined,
      stateChangedAt: new Date(this.stateChangeTime),
      backoffMultiplier: this.backoffMultiplier,
    };
  }

  /**
   * Get current state.
   */
  getState(): CircuitBreakerState {
    this.checkStateTransitions();
    return this.state;
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.stateChangeTime = Date.now();
    this.halfOpenAttemptTime = undefined;
    this.backoffMultiplier = 1;
    this.lastStateChangeReason = 'reset';
  }

  /**
   * Get the last reason for state change (debugging).
   */
  getLastStateChangeReason(): string {
    return this.lastStateChangeReason;
  }

  /**
   * Get name for logging.
   */
  getName(): string {
    return this.name;
  }
}

/**
 * Thrown when the circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

/**
 * Thrown when operation fails.
 */
export class CircuitBreakerExecutionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'CircuitBreakerExecutionError';
    Object.setPrototypeOf(this, CircuitBreakerExecutionError.prototype);
  }
}
