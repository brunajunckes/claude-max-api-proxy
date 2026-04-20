# Story 005: Circuit Breaker Pattern for Resilience

**Priority:** CRITICAL  
**Type:** Feature - Resilience  
**Effort:** 4 sprints  
**Status:** READY TO START  
**Target Completion:** 2026-04-23

---

## OBJECTIVE
Implementar circuit breaker para Claude API calls com fallback gracioso. Previne cascata de falhas.

---

## CHECKLIST EXECUTÁVEL

### Phase 1: Circuit Breaker Implementation
- [ ] Criar `src/lib/circuit-breaker.ts`
  - [ ] Type definitions (State enum, Config interface)
  - [ ] CircuitBreaker class com FSM (CLOSED → OPEN → HALF_OPEN → CLOSED)
  - [ ] Threshold config: 5 failures em 60s → OPEN
  - [ ] Half-open timeout: 30s auto-recovery attempt
  - [ ] Exponential backoff: 1s → 2s → 4s → 8s (max 30s)

### Phase 2: Integration with Claude Client
- [ ] Criar `src/clients/circuit-breaker-claude.ts` (wrapper)
- [ ] Wrappear original claude-api.ts com circuit breaker
- [ ] Implement fallback: OPEN state → fallback response (cached/default)
- [ ] Track original vs. fallback calls via metrics

### Phase 3: Monitoring & Metrics
- [ ] Adicionar em `src/monitoring/metrics.ts`:
  - [ ] Counter: `circuitbreaker_state_changes` (labeled by state)
  - [ ] Gauge: `circuitbreaker_current_state` (per breaker)
  - [ ] Counter: `circuitbreaker_failures` (total)
  - [ ] Counter: `circuitbreaker_successes` (total)
  - [ ] Histogram: `circuitbreaker_call_duration_ms`

### Phase 4: Health Endpoint Updates
- [ ] Expandir POST `/health` em routes.ts
- [ ] Incluir circuitbreaker state: `{ status: "CLOSED|OPEN|HALF_OPEN", failures: N, lastFailureAt: timestamp }`
- [ ] Testes: Validar estado está correto em cada transição

### Phase 5: Configuration
- [ ] Adicionar em `.env.example`:
  - [ ] `CIRCUIT_BREAKER_THRESHOLD=5` (failures to trigger OPEN)
  - [ ] `CIRCUIT_BREAKER_TIMEOUT_MS=60000` (reset window)
  - [ ] `CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS=30000` (recovery attempt)
  - [ ] `CIRCUIT_BREAKER_BACKOFF_MAX_MS=30000` (max backoff)

### Phase 6: Tests
- [ ] Criar `tests/unit/circuit-breaker.test.ts` (70+ test cases)
  - [ ] Test: CLOSED → OPEN transition on threshold
  - [ ] Test: OPEN → HALF_OPEN after timeout
  - [ ] Test: HALF_OPEN → CLOSED on success
  - [ ] Test: HALF_OPEN → OPEN on failure
  - [ ] Test: Exponential backoff progression
  - [ ] Test: Concurrent requests (thread safety)
  - [ ] Test: Fallback response when OPEN
  - [ ] Test: Metrics updated correctly

- [ ] Criar `tests/integration/circuit-breaker-claude.test.ts` (20+ test cases)
  - [ ] Integration: Real Claude API call with breaker
  - [ ] Fallback: Valid response structure when OPEN
  - [ ] Graceful degradation: Partial features available

### Phase 7: Documentation & Validation
- [ ] Criar `CIRCUIT_BREAKER.md` com:
  - [ ] FSM diagram
  - [ ] Configuration options
  - [ ] Metrics collected
  - [ ] Troubleshooting guide
- [ ] Rodar `npm run lint` → 0 errors
- [ ] Rodar `npm run typecheck` → 0 errors
- [ ] Rodar `npm test` → all tests green
- [ ] Update PROGRESS.md (add circuit breaker status)
- [ ] Create PR + request review

---

## FILE LIST (CRIAR/EXPANDIR)

**NEW:**
- `src/lib/circuit-breaker.ts` (250 lines)
- `src/clients/circuit-breaker-claude.ts` (120 lines)
- `tests/unit/circuit-breaker.test.ts` (400 lines, 70+ cases)
- `tests/integration/circuit-breaker-claude.test.ts` (280 lines, 20+ cases)
- `docs/CIRCUIT_BREAKER.md` (150 lines)

**EXPAND:**
- `src/monitoring/metrics.ts` (+40 lines, 5 new metrics)
- `src/server/routes.ts` (expand /health, +30 lines)
- `.env.example` (+4 vars)

**UPDATE:**
- `PROGRESS.md` (add circuit breaker feature note)

---

## STATE MACHINE

```
          failure (< threshold)
              ↓
    CLOSED ←-----→ OPEN
      ↑                ↓
      |         timeout (30s)
      |                ↓
      └── success ← HALF_OPEN
                   ↓
                failure → OPEN (restart backoff)
```

---

## METRICS EXPOSED

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `circuitbreaker_state_changes` | Counter | `state=CLOSED\|OPEN\|HALF_OPEN` | State transitions |
| `circuitbreaker_current_state` | Gauge | `breaker_name` | Current state (0=CLOSED, 1=OPEN, 2=HALF_OPEN) |
| `circuitbreaker_failures` | Counter | `breaker_name` | Total failures |
| `circuitbreaker_successes` | Counter | `breaker_name` | Total successes |
| `circuitbreaker_call_duration_ms` | Histogram | `breaker_name, state` | Call latency |

---

## SUCCESS CRITERIA

✅ **GO if:**
- All 90 tests passing (70 unit + 20 integration)
- Coverage ≥ 85% in circuit-breaker code
- Fallback response validated
- All metrics exposed correctly
- Zero new CRITICAL/HIGH issues

⛔ **BLOCK if:**
- Tests < 90 passing
- Coverage < 80%
- Fallback response invalid
- Metrics missing or incorrect

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| **Fallback response structure** | Test with real Claude API mock + schema validation |
| **Thread safety** | Use atomic operations + test with concurrent requests |
| **Backoff explosion** | Cap exponential backoff at 30s max |
| **Metric cardinality** | Limit labels (breaker_name only) |

---

## NOTES

- Fallback response should match Claude API format (for seamless handling)
- Consider async metric updates to avoid blocking request path
- Monitor circuitbreaker_state_changes in production (indicates API issues)

**Status:** PENDING - Ready to spawn agents  
**Assigned:** @dev, @qa  
**Reviewers:** @architect, @devops
