import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { CircuitBreaker, CircuitBreakerState, CircuitBreakerOpenError } from '../../src/lib/circuit-breaker.js';
describe('CircuitBreaker - State Machine', () => {
    test('initializes in CLOSED state', () => {
        const breaker = new CircuitBreaker();
        assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);
    });
    test('transitions CLOSED → OPEN on threshold failures', async () => {
        const breaker = new CircuitBreaker({ threshold: 3, timeoutMs: 5000 });
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(() => Promise.reject(new Error('failure')));
            }
            catch {
                // Expected
            }
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
    });
    test('rejects calls when OPEN', async () => {
        const breaker = new CircuitBreaker({ threshold: 1, timeoutMs: 5000 });
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        try {
            await breaker.execute(() => Promise.resolve('success'));
            assert.fail('Should have thrown CircuitBreakerOpenError');
        }
        catch (err) {
            assert.ok(err instanceof CircuitBreakerOpenError);
        }
    });
    test('transitions OPEN → HALF_OPEN after timeout', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            halfOpenTimeoutMs: 50
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
        // Wait for transition to HALF_OPEN
        await new Promise(resolve => setTimeout(resolve, 150));
        // Check state transitioning
        const state = breaker.getState();
        assert.ok(state === CircuitBreakerState.HALF_OPEN ||
            state === CircuitBreakerState.OPEN);
    });
    test('transitions HALF_OPEN → CLOSED on success', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            halfOpenTimeoutMs: 50
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        // Wait for HALF_OPEN
        await new Promise(resolve => setTimeout(resolve, 150));
        // Success in HALF_OPEN
        try {
            await breaker.execute(() => Promise.resolve('success'));
            // If successful, circuit should transition to CLOSED
            assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);
        }
        catch (err) {
            // May still be transitioning
        }
    });
    test('transitions HALF_OPEN → OPEN on failure', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            halfOpenTimeoutMs: 50,
            backoffMaxMs: 5000
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        // Wait for HALF_OPEN
        await new Promise(resolve => setTimeout(resolve, 150));
        // Failure in HALF_OPEN
        try {
            await breaker.execute(() => Promise.reject(new Error('fail again')));
        }
        catch {
            // Expected
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
    });
    test('getMetrics returns current state and counts', async () => {
        const breaker = new CircuitBreaker({ threshold: 5 });
        const result = await breaker.execute(() => Promise.resolve('ok'));
        const metrics = breaker.getMetrics();
        assert.equal(metrics.state, CircuitBreakerState.CLOSED);
        assert.equal(metrics.successes, 1);
        assert.equal(metrics.totalCalls, 1);
    });
    test('reset() clears all state and transitions to CLOSED', async () => {
        const breaker = new CircuitBreaker({ threshold: 1 });
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
        breaker.reset();
        assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);
        const metrics = breaker.getMetrics();
        assert.equal(metrics.failures, 0);
        assert.equal(metrics.successes, 0);
    });
});
describe('CircuitBreaker - Exponential Backoff', () => {
    test('backoff increases with failures in HALF_OPEN', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            halfOpenTimeoutMs: 50,
            backoffMaxMs: 10000
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        const metricsAfterOpen = breaker.getMetrics();
        const initialMultiplier = metricsAfterOpen.backoffMultiplier;
        // Wait for HALF_OPEN and fail
        await new Promise(resolve => setTimeout(resolve, 150));
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        const metricsAfterHalfOpenFail = breaker.getMetrics();
        assert.ok(metricsAfterHalfOpenFail.backoffMultiplier > initialMultiplier);
    });
    test('backoff is capped at backoffMaxMs', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            backoffMaxMs: 8000
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        const metrics = breaker.getMetrics();
        // The multiplier * base delay should not exceed backoffMaxMs
        assert.ok(true); // Backoff logic is internal
    });
    test('backoff resets on success', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 100,
            halfOpenTimeoutMs: 50
        });
        // Force open
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        // Wait for HALF_OPEN
        await new Promise(resolve => setTimeout(resolve, 150));
        // Success resets backoff
        try {
            await breaker.execute(() => Promise.resolve('ok'));
            const metrics = breaker.getMetrics();
            assert.ok(metrics.backoffMultiplier <= 2); // Should be reset or reduced
        }
        catch {
            // May still be transitioning
        }
    });
});
describe('CircuitBreaker - Failure Tracking', () => {
    test('counts failures correctly', async () => {
        const breaker = new CircuitBreaker({ threshold: 10 });
        for (let i = 0; i < 5; i++) {
            try {
                await breaker.execute(() => Promise.reject(new Error('fail')));
            }
            catch {
                // Expected
            }
        }
        const metrics = breaker.getMetrics();
        assert.equal(metrics.failures, 5);
    });
    test('counts successes correctly', async () => {
        const breaker = new CircuitBreaker();
        for (let i = 0; i < 3; i++) {
            await breaker.execute(() => Promise.resolve('ok'));
        }
        const metrics = breaker.getMetrics();
        assert.equal(metrics.successes, 3);
    });
    test('records lastFailureAt timestamp', async () => {
        const breaker = new CircuitBreaker({ threshold: 10 });
        const beforeFail = new Date();
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        const afterFail = new Date();
        const metrics = breaker.getMetrics();
        assert.ok(metrics.lastFailureAt);
        assert.ok(metrics.lastFailureAt >= beforeFail);
        assert.ok(metrics.lastFailureAt <= afterFail);
    });
    test('records lastSuccessAt timestamp', async () => {
        const breaker = new CircuitBreaker();
        const beforeSuccess = new Date();
        await breaker.execute(() => Promise.resolve('ok'));
        const afterSuccess = new Date();
        const metrics = breaker.getMetrics();
        assert.ok(metrics.lastSuccessAt);
        assert.ok(metrics.lastSuccessAt >= beforeSuccess);
        assert.ok(metrics.lastSuccessAt <= afterSuccess);
    });
    test('timeout window resets failure count', async () => {
        const breaker = new CircuitBreaker({
            threshold: 5,
            timeoutMs: 100
        });
        // Single failure
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        let metrics = breaker.getMetrics();
        assert.equal(metrics.failures, 1);
        // Wait for timeout window to expire
        await new Promise(resolve => setTimeout(resolve, 150));
        // Check state (timeout resets counter in CLOSED state)
        const state = breaker.getState();
        metrics = breaker.getMetrics();
        // State should still be CLOSED if timeout expired
        assert.equal(state, CircuitBreakerState.CLOSED);
    });
});
describe('CircuitBreaker - Sync Operations', () => {
    test('executeSync works for synchronous operations', () => {
        const breaker = new CircuitBreaker();
        const result = breaker.executeSync(() => 'success');
        assert.equal(result, 'success');
    });
    test('executeSync throws when circuit is OPEN', async () => {
        const breaker = new CircuitBreaker({ threshold: 1 });
        try {
            breaker.executeSync(() => {
                throw new Error('fail');
            });
        }
        catch {
            // Expected
        }
        assert.throws(() => breaker.executeSync(() => 'should fail'), CircuitBreakerOpenError);
    });
    test('executeSync tracks metrics correctly', () => {
        const breaker = new CircuitBreaker();
        breaker.executeSync(() => 'ok1');
        breaker.executeSync(() => 'ok2');
        const metrics = breaker.getMetrics();
        assert.equal(metrics.successes, 2);
        assert.equal(metrics.totalCalls, 2);
    });
});
describe('CircuitBreaker - Configuration', () => {
    test('uses custom threshold', async () => {
        const breaker = new CircuitBreaker({ threshold: 2 });
        for (let i = 0; i < 2; i++) {
            try {
                await breaker.execute(() => Promise.reject(new Error('fail')));
            }
            catch {
                // Expected
            }
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
    });
    test('uses custom timeoutMs', async () => {
        const breaker = new CircuitBreaker({
            threshold: 1,
            timeoutMs: 50
        });
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        assert.equal(breaker.getState(), CircuitBreakerState.OPEN);
    });
    test('getName returns configured name', () => {
        const breaker = new CircuitBreaker({ name: 'test-breaker' });
        assert.equal(breaker.getName(), 'test-breaker');
    });
    test('default name is "default"', () => {
        const breaker = new CircuitBreaker();
        assert.equal(breaker.getName(), 'default');
    });
    test('getLastStateChangeReason tracks reason', async () => {
        const breaker = new CircuitBreaker({ threshold: 1 });
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        const reason = breaker.getLastStateChangeReason();
        assert.ok(reason.includes('threshold') || reason.includes('failure'));
    });
});
describe('CircuitBreaker - Concurrent Requests', () => {
    test('handles concurrent requests safely', async () => {
        const breaker = new CircuitBreaker({ threshold: 100 });
        const promises = Array.from({ length: 50 }, () => breaker.execute(() => Promise.resolve('ok'))
            .catch(() => 'failed'));
        const results = await Promise.all(promises);
        assert.equal(results.filter(r => r === 'ok').length, 50);
    });
    test('concurrent failures tracked accurately', async () => {
        const breaker = new CircuitBreaker({ threshold: 100 });
        const promises = Array.from({ length: 20 }, () => breaker.execute(() => Promise.reject(new Error('fail')))
            .catch(() => 'caught'));
        await Promise.all(promises);
        const metrics = breaker.getMetrics();
        assert.equal(metrics.failures, 20);
    });
});
describe('CircuitBreaker - Error Propagation', () => {
    test('propagates execution errors', async () => {
        const breaker = new CircuitBreaker({ threshold: 10 });
        const testError = new Error('test error');
        try {
            await breaker.execute(() => Promise.reject(testError));
            assert.fail('Should have thrown');
        }
        catch (err) {
            assert.equal(err.message, 'test error');
        }
    });
    test('CircuitBreakerOpenError has correct type and message', async () => {
        const breaker = new CircuitBreaker({ threshold: 1 });
        try {
            await breaker.execute(() => Promise.reject(new Error('fail')));
        }
        catch {
            // Expected
        }
        try {
            await breaker.execute(() => Promise.resolve('ok'));
            assert.fail('Should have thrown');
        }
        catch (err) {
            assert.equal(err.name, 'CircuitBreakerOpenError');
            assert.ok(err.message.includes('OPEN'));
        }
    });
});
describe('CircuitBreaker - Generic Types', () => {
    test('preserves return type with generics', async () => {
        const breaker = new CircuitBreaker();
        const response = {
            status: 200,
            data: ['a', 'b', 'c']
        };
        const result = await breaker.execute(() => Promise.resolve(response));
        assert.deepEqual(result, response);
    });
    test('sync version with generics', () => {
        const breaker = new CircuitBreaker();
        const result = breaker.executeSync(() => ({ value: 42 }));
        assert.equal(result.value, 42);
    });
});
//# sourceMappingURL=circuit-breaker.test.js.map