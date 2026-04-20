# IMMEDIATE ACTION PLAN — Phase 6 Kickoff
**Created:** 2026-04-19 21:00 UTC  
**Status:** READY TO EXECUTE  
**Priority:** 🔴 URGENT — 3 sprints critical path  

---

## SPRINT 1: CONSOLIDATION (Week 1)

### Story 004: Test Coverage Expansion
**Objective:** 45% → 70% coverage  
**Effort:** 3 sprints  
**Status:** READY TO START

#### Checklist
- [ ] Add unit tests for Agent Router component
- [ ] Add integration tests for Skill Registry loader
- [ ] Add E2E tests for claude-mem serialization
- [ ] Update coverage reports
- [ ] Block merge if coverage < 70%

**Files Affected:**
- `tests/unit/agent-router.test.ts` (new)
- `tests/integration/skill-registry.test.ts` (new)
- `tests/e2e/memory.test.ts` (new)
- `jest.config.ts` (update thresholds)

---

### Story 005: Circuit Breaker Pattern
**Objective:** Resilience for Claude API fallback  
**Effort:** 2 sprints  
**Status:** READY TO START

#### Checklist
- [ ] Implement CircuitBreaker class (lib/circuit-breaker.ts)
- [ ] Integrate with Claude API client
- [ ] Add monitoring/metrics
- [ ] Write tests (90%+ coverage)
- [ ] Document pattern

**Files Affected:**
- `src/lib/circuit-breaker.ts` (new)
- `src/clients/claude-api.ts` (integrate)
- `src/monitoring/metrics.ts` (add counters)

---

### Story 006: Hot-Reload Configuration
**Objective:** Update config without restart  
**Effort:** 2 sprints  
**Status:** READY TO START

#### Checklist
- [ ] Create config watcher (fs.watch or chokidar)
- [ ] Implement ConfigManager with reload hooks
- [ ] Add CLI command: `reload-config`
- [ ] Add tests for reload events
- [ ] Update CONFIGURATION.md

**Files Affected:**
- `src/config/config-manager.ts` (new)
- `bin/cli.ts` (add reload command)
- `.env.example` (document all vars)

---

## SPRINT 2: INTEGRATION (Week 2-3)

### Story 007: Agent Router (Core)
**Objective:** Unified agent dispatch  
**Effort:** 3 sprints  
**Dependency:** Stories 004-006 complete

#### High-Level Design
```
Input Task → Classifier → Router → Agent Pool → Executor
                ↓
            (1.335 agents)
```

**Checklist**
- [ ] Design router interface + agent metadata schema
- [ ] Implement task classifier (keyword + intent)
- [ ] Implement agent selector (skill matching)
- [ ] Add 100+ test cases
- [ ] Benchmark latency vs. current

---

### Story 008: Skill Registry
**Objective:** Centralized skill discovery  
**Effort:** 2 sprints  
**Dependency:** Story 007

#### High-Level Design
```
SKILL.md → Parser → Registry → Query API → Cache
```

**Checklist**
- [ ] SKILL.md format spec (name, desc, params, example)
- [ ] Parser (extract from repo)
- [ ] Registry loader (index all 4.345 skills)
- [ ] Query API (skill search, parameter validation)
- [ ] CLI: `list-skills`, `search-skills`

---

## SPRINT 3: EVOLUTION (Week 3-4)

### Story 009: Memory Polymorphism
**Objective:** Cross-model persistence  
**Effort:** 3 sprints  
**Dependency:** Stories 007-008

#### Checklist
- [ ] Design serialization interface (Model-agnostic)
- [ ] Implement Redis backend (primary)
- [ ] Implement PostgreSQL backend (secondary)
- [ ] OLLAMA-ONLY mode override (for claude-mem)
- [ ] Tests for all backends

---

## EXECUTION SEQUENCE

**CRITICAL PATH:**
```
Story 004 (coverage) ─┐
Story 005 (circuit)  ├─→ Story 007 (router) ─┐
Story 006 (config)   ┘                        ├─→ Story 009 (memory)
                       Story 008 (registry)   ┘
```

**Parallelizable:**
- Stories 004, 005, 006 → run in parallel
- Story 007 can start when 004-006 complete
- Story 008 can start when 007 complete
- Story 009 waits for 007+008

---

## DEPENDENCIES TO FIX (FIRST)

1. **PostgreSQL Port Mismatch**
   - Current: docker-compose uses 5435
   - Fix: Change to 5432 in docker-compose.yml
   - Impact: Enables PostgreSQL for Story 009

2. **Hermes Gateway Offline**
   - Current: Port 9999 (unavailable)
   - Workaround: Use Ollama primary (already in place)
   - Impact: None (graceful degradation works)

3. **Memory Leak in Event Listeners**
   - Current: Unresolved
   - Mitigation: Add listener cleanup pattern
   - Priority: Story 004 (test coverage will expose it)

---

## ROLLOUT PLAN

### Week 1
- Commit audit docs
- Start Stories 004, 005, 006 in parallel
- Fix PostgreSQL port issue
- Create Story 007-009 branches

### Week 2-3
- Complete Stories 004-006
- Merge to main
- Start Story 007 (Agent Router)
- Parallel: Story 008 (Skill Registry)

### Week 3-4
- Complete Story 007-008
- Merge to main
- Start Story 009 (Memory Polymorphism)
- Performance testing + optimization

### Week 4+
- Complete Story 009
- Deploy Phase 6 to production
- Begin Phase 7 (self-evolution)

---

## SUCCESS METRICS

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Test Coverage | 45% | 70% | Week 1 |
| CRITICAL Issues | 2 | 0 | Week 2 |
| HIGH Issues | 2 | 0 | Week 3 |
| Agent Router Latency | N/A | <100ms | Week 2 |
| Skill Registry Size | N/A | 4.345 skills indexed | Week 3 |

---

## GO/NO-GO DECISION POINTS

✅ **GO if:**
- All Stories 004-006 tests pass
- PostgreSQL port fixed
- No new CRITICAL issues introduced

⛔ **NO-GO if:**
- Coverage stays below 65%
- Circuit breaker fails under load
- Event listener memory leak confirmed + unmitigated

---

*Ready to execute. Awaiting go-signal.*
