# Story 003: Security Hardening - Input Validation & Headers

**Priority:** CRITICAL  
**Type:** Bugfix - Security  
**Estimate:** 3 hours  
**Dependencies:** None

## Description
Implementar input validation e security headers. QA Squad identificou gaps críticos.

## Acceptance Criteria
- [x] POST /v1/messages valida entrada
- [x] X-Content-Type-Options header presente
- [x] X-Frame-Options header presente
- [x] Content-Security-Policy configurável
- [x] Rate-limit headers adicionados
- [x] Testes de validação de input

## Implementation Plan
1. [x] Middleware de validação JSON Schema
2. [x] Adicionar security headers middleware
3. [x] Input sanitization (string length, types)
4. [x] Error responses não vazam internals
5. [x] Rate-limit headers

## Files Affected
- [x] src/server/input-validation.ts (validation middleware)
- [x] src/server/security-headers.ts (headers middleware)
- [x] src/server/index.ts (integração em app.use)
- [x] src/server/error-handler.ts (error messages seguros)

## Tests
- [x] Invalid JSON rejeitado (40/40 tests passing)
- [x] Oversized payload rejeitado
- [x] Headers presentes em todas responses

## Checklist
- [x] Código escrito
- [x] Tests passando (40/40)
- [x] Lint OK
- [x] TypeScript OK
- [x] Documentação atualizada

**Status:** COMPLETO - 2026-04-19
