# Story 004: Expand Test Coverage to 70%

**Priority:** HIGH  
**Type:** Quality - Testing  
**Effort:** 5 sprints  
**Status:** READY TO START  
**Target Completion:** 2026-04-22

---

## OBJECTIVE
Aumentar cobertura de testes de 45% → 70%+ para phase 6 approval.

---

## CHECKLIST EXECUTÁVEL

### Phase 1: Gap Analysis
- [ ] Rodar `npm run test:coverage` para baseline
- [ ] Identificar arquivos abaixo de 70%
- [ ] Mapear test gaps por componente
- [ ] Priorizar: cache > tracing > validation

### Phase 2: Cache Middleware Tests
- [ ] Criar `tests/unit/cache-middleware.test.ts`
- [ ] Testes: hit, miss, eviction, TTL expiry
- [ ] Testes: concurrent access patterns
- [ ] Testes: memory pressure (cache clearing)
- [ ] Coverage target: ≥90% em cache-middleware.ts

### Phase 3: Tracing Tests
- [ ] Criar `tests/unit/tracing.test.ts`
- [ ] Testes: context initialization
- [ ] Testes: span creation e lifecycle
- [ ] Testes: W3C trace context propagation
- [ ] Testes: error capture com stack trace
- [ ] Coverage target: ≥90% em tracing.ts

### Phase 4: Input Validation Edge Cases
- [ ] Expandir `tests/unit/input-validation.test.ts`
- [ ] Testes: Unicode/emoji payloads
- [ ] Testes: Extremely large JSON
- [ ] Testes: Malformed tokens
- [ ] Testes: SQL injection attempts (blocked)
- [ ] Coverage target: ≥95% em input-validation.ts

### Phase 5: API Routes Integration
- [ ] Expandir `tests/integration/routes.test.ts`
- [ ] Testes: /health endpoint com circuit breaker state
- [ ] Testes: /cache-stats endpoint
- [ ] Testes: /metrics com tracing data
- [ ] Coverage target: ≥85% em routes.ts

### Phase 6: APM Integration
- [ ] Testes: Graceful fallback quando APM unavailable
- [ ] Testes: Métricas buffering (offline scenario)
- [ ] Testes: Event listener cleanup
- [ ] Coverage target: ≥80% em apm/

### Phase 7: Validation & Merge
- [ ] Rodar `npm run test` (all tests)
- [ ] Rodar `npm run test:coverage` → report ≥70%
- [ ] Rodar `npm run lint` → 0 errors
- [ ] Rodar `npm run typecheck` → 0 errors
- [ ] Update test counts na PROGRESS.md
- [ ] Create PR + request review

---

## FILE LIST (CRIAR/EXPANDIR)

**NEW:**
- `tests/unit/cache-middleware.test.ts` (280 lines, ~18 test cases)
- `tests/unit/tracing.test.ts` (320 lines, ~22 test cases)
- `tests/unit/apm-integration.test.ts` (200 lines, ~14 test cases)

**EXPAND:**
- `tests/unit/input-validation.test.ts` (+150 lines)
- `tests/integration/routes.test.ts` (+200 lines)
- `jest.config.ts` (update thresholds: branches=70, lines=70)

**UPDATE:**
- `PROGRESS.md` (test count: 40 → 94 expected)

---

## METRICS BEFORE/AFTER

| Metric | Before | Target | Tool |
|--------|--------|--------|------|
| Line Coverage | 45% | 70% | c8 |
| Branch Coverage | 38% | 65% | c8 |
| Function Coverage | 52% | 75% | c8 |
| Statement Coverage | 44% | 70% | c8 |
| **Total Tests** | 40 | 94 | npm test |
| **Passing** | 40 | 94 | npm test |

---

## CRITICAL SUCCESS FACTORS

✅ **GO if:**
- Coverage ≥ 70% across all metrics
- All 94 tests passing
- No new CRITICAL/HIGH issues
- Lint + typecheck clean

⛔ **BLOCK if:**
- Coverage < 65% (retry)
- Any test failure (debug + fix)
- New security issues detected

---

## NOTES

- Event listener cleanup pattern will surface memory leak
- APM graceful fallback tests will validate monitoring resilience
- Input validation edge cases will improve security posture

**Status:** PENDING - Ready to spawn agents  
**Assigned:** @dev, @qa  
**Reviewers:** @architect, @analyst
