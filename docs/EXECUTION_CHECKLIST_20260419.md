# Execution Checklist — Auto Mode 2026-04-19 21:05

**Status:** 3 STORIES PARALELAS EM EXECUÇÃO

---

## REAL-TIME STATUS

### Story 004: Test Coverage Expansion (45% → 70%)
**Agent:** ab9b17c06fada3fc4  
**Priority:** HIGH  
**Target:** 94 testes, ≥70% coverage  

- [ ] Phase 1: Gap Analysis
  - [ ] npm run test:coverage baseline
  - [ ] Arquivos < 70% identificados
  - [ ] Gaps mapeados por componente

- [ ] Phase 2: Cache Middleware Tests
  - [ ] tests/unit/cache-middleware.test.ts criado (280 lines)
  - [ ] 18 test cases implementados
  - [ ] Coverage ≥90%

- [ ] Phase 3: Tracing Tests
  - [ ] tests/unit/tracing.test.ts criado (320 lines)
  - [ ] 22 test cases implementados
  - [ ] Coverage ≥90%

- [ ] Phase 4: Input Validation Edge Cases
  - [ ] tests/unit/input-validation.test.ts expandido (+150 lines)
  - [ ] Unicode, large JSON, tokens, SQL injection testados
  - [ ] Coverage ≥95%

- [ ] Phase 5: API Routes Integration
  - [ ] tests/integration/routes.test.ts expandido (+200 lines)
  - [ ] /health, /cache-stats, /metrics testados
  - [ ] Coverage ≥85%

- [ ] Phase 6: APM Integration
  - [ ] tests/unit/apm-integration.test.ts criado (200 lines)
  - [ ] Graceful fallback testado
  - [ ] Coverage ≥80%

- [ ] Phase 7: Validation & Merge
  - [ ] npm test all → 94 passing
  - [ ] npm test:coverage → ≥70%
  - [ ] npm run lint → 0 errors
  - [ ] npm run typecheck → 0 errors
  - [ ] PROGRESS.md atualizado
  - [ ] git commit (message: "test: expand coverage 45%→70% (94 tests, +54 cases)")

**Metrics Target:**
| Metric | Before | Target | Expected |
|--------|--------|--------|----------|
| Line Coverage | 45% | 70% | ✓ |
| Branch Coverage | 38% | 65% | ✓ |
| Function Coverage | 52% | 75% | ✓ |
| Statement Coverage | 44% | 70% | ✓ |
| Test Count | 40 | 94 | ✓ |

---

### Story 005: Circuit Breaker Pattern (CRITICAL)
**Agent:** aeef8d4a58f033bf0  
**Priority:** CRITICAL  
**Target:** 90 testes, ≥85% coverage, FSM state machine  

- [ ] Phase 1: Implementation
  - [ ] src/lib/circuit-breaker.ts criado (250 lines)
  - [ ] State enum: CLOSED, OPEN, HALF_OPEN
  - [ ] FSM completo com transitions
  - [ ] Threshold: 5 failures in 60s
  - [ ] Exponential backoff: 1s→2s→4s→8s (max 30s)

- [ ] Phase 2: Claude Client Integration
  - [ ] src/clients/circuit-breaker-claude.ts criado (120 lines)
  - [ ] Original Claude API wrapped
  - [ ] Fallback: cached/default responses

- [ ] Phase 3: Metrics & Monitoring
  - [ ] src/monitoring/metrics.ts expandido
  - [ ] circuitbreaker_state_changes (counter)
  - [ ] circuitbreaker_current_state (gauge)
  - [ ] circuitbreaker_failures (counter)
  - [ ] circuitbreaker_successes (counter)
  - [ ] circuitbreaker_call_duration_ms (histogram)

- [ ] Phase 4: Health Endpoint
  - [ ] POST /health expandido em routes.ts
  - [ ] Circuit breaker state incluído
  - [ ] Response: { status, failures, lastFailureAt }

- [ ] Phase 5: Configuration
  - [ ] .env.example atualizado
  - [ ] CIRCUIT_BREAKER_THRESHOLD=5
  - [ ] CIRCUIT_BREAKER_TIMEOUT_MS=60000
  - [ ] CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS=30000
  - [ ] CIRCUIT_BREAKER_BACKOFF_MAX_MS=30000

- [ ] Phase 6: Tests (90 total)
  - [ ] tests/unit/circuit-breaker.test.ts (400 lines, 70 cases)
    - [ ] CLOSED→OPEN transition on threshold
    - [ ] OPEN→HALF_OPEN after timeout
    - [ ] HALF_OPEN→CLOSED on success
    - [ ] HALF_OPEN→OPEN on failure
    - [ ] Exponential backoff progression
    - [ ] Concurrent requests (thread safety)
    - [ ] Fallback response when OPEN
    - [ ] Metrics updated correctly
  
  - [ ] tests/integration/circuit-breaker-claude.test.ts (280 lines, 20 cases)
    - [ ] Real Claude API call with breaker
    - [ ] Fallback validation
    - [ ] Graceful degradation

- [ ] Phase 7: Documentation & Merge
  - [ ] docs/CIRCUIT_BREAKER.md criado (150 lines)
    - [ ] FSM diagram
    - [ ] Configuration options
    - [ ] Metrics collected
    - [ ] Troubleshooting guide
  - [ ] npm test all → 90 passing (circuit breaker)
  - [ ] Coverage ≥85% em circuit-breaker code
  - [ ] npm run lint → 0 errors
  - [ ] npm run typecheck → 0 errors
  - [ ] PROGRESS.md atualizado
  - [ ] git commit (message: "feat: circuit breaker pattern w/ 90 tests + FSM")

**Test Structure:**
| Component | Unit Tests | Integration Tests | Coverage Target |
|-----------|-----------|-------------------|-----------------|
| circuit-breaker.ts | 70 | - | 90% |
| circuit-breaker-claude.ts | - | 20 | 85% |
| **Total** | **70** | **20** | **85%** |

---

### Story 006: Hot-Reload Config
**Agent:** af07c429da7c305de  
**Priority:** MEDIUM  
**Target:** 3 horas, config reload sem restart  

- [ ] Component 1: ConfigManager
  - [ ] src/config/manager.ts criado
  - [ ] File watcher implementado (chokidar)
  - [ ] On-change: reload + validate
  - [ ] Rollback if invalid

- [ ] Component 2: Validation Schema
  - [ ] src/config/schema.ts criado/atualizado
  - [ ] Validate: cache TTL, rate-limits, Hermes paths
  - [ ] Type-safe config object

- [ ] Component 3: Hot-Reload Endpoint
  - [ ] POST /admin/config/reload em routes.ts
  - [ ] Accept: { configPath?: string }
  - [ ] Response: { success, oldConfig, newConfig, changes }
  - [ ] Reload history (last 10)

- [ ] Component 4: CLI Command
  - [ ] 'reload-config' command em bin/cli.ts
  - [ ] Usage: npm run cli reload-config
  - [ ] Remote support: --remote <url>

- [ ] Component 5: Tests
  - [ ] tests/unit/config-manager.test.ts criado
    - [ ] Valid config load
    - [ ] Invalid config rejection + rollback
    - [ ] File watcher trigger
    - [ ] Concurrent reload handling
    - [ ] History tracking (last 10)

- [ ] Component 6: Validation & Merge
  - [ ] npm test all → green
  - [ ] npm run lint → 0 errors
  - [ ] npm run typecheck → 0 errors
  - [ ] CLI command working
  - [ ] PROGRESS.md atualizado
  - [ ] git commit (message: "feat: hot-reload config support + CLI command")

---

## CONSOLIDATED RESULTS (ao final)

- [ ] Total tests: 40 → 130+ (passing)
- [ ] Coverage: 45% → 75%+
- [ ] New features: Circuit Breaker + Hot-Reload
- [ ] New metrics: 5 (circuit breaker)
- [ ] New files: 10+ (tests, implementations)
- [ ] All PRs ready for review

---

## BLOCKERS & RISKS

| Risk | Mitigation | Status |
|------|-----------|--------|
| Memory leak in event listeners | Monitored in Phase 6 Story 004 | 🟡 |
| Redis DOWN | Graceful fallback tested | ✓ |
| PostgreSQL port mismatch | Config fix in Story 006 | 🔄 |
| Circuit breaker thread safety | Concurrent tests in Phase 6 | 🔄 |

---

**Updated:** 2026-04-19 21:05  
**Mode:** AUTO — No user interaction required  
**ETA:** ~2-3 hours (parallel execution)
