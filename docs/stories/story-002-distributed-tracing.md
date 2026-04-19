# Story 002: Complete Distributed Tracing Setup

**Priority:** HIGH  
**Type:** Feature - Infrastructure  
**Estimate:** 6 hours  
**Dependencies:** None

## Description
Completar setup de distributed tracing com OpenTelemetry. Atualmente temos imports mas integração incompleta.

## Acceptance Criteria
- [x] Todos os requests rastreados (trace ID)
- [x] Spans criados para subprocess, cache, API
- [x] Trace correlation com APM
- [x] Jaeger exporter configurável
- [x] Testes de trace propagation

## Implementation Plan
1. [x] Estender TracingManager com setup OpenTelemetry
2. [x] Middleware para trace context injection
3. [x] Subprocess span tracking
4. [x] Cache operation spans
5. [x] Exporter configurável (Jaeger/Tempo/console)

## Files Affected
- [x] src/monitoring/tracing.ts (expand com TracingManager)
- [x] src/server/index.ts (middleware de trace context)
- [x] src/server/cache-middleware.ts (cache spans)
- [x] src/server/routes.ts (API spans)

## Tests
- [x] Trace propagation cross-service
- [x] Span hierarchy correto
- [x] Exporter failover com console fallback

## Checklist
- [x] Código escrito
- [x] Tests passando (40/40)
- [x] TypeScript OK
- [x] Documentação atualizada

**Status:** COMPLETO - 2026-04-19
