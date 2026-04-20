# Story 006: Hot-Reload Configuration Support

**Priority:** MEDIUM  
**Type:** Feature - Operations  
**Estimate:** 3 hours  
**Dependencies:** None

## Description
Suportar hot-reload de configurações sem reiniciar servidor. Cache TTL, rate-limits, Hermes paths.

## Acceptance Criteria
- [x] Config loader com file watcher
- [x] Reload endpoints (POST /admin/config/reload)
- [x] Validação antes de aplicar
- [x] Rollback automático se inválida
- [x] Event broadcast via WebSocket (opcional)
- [x] CLI command: reload-config

## Implementation Plan
1. Criar ConfigManager com hot-reload
2. Integrar file watcher (chokidar ou fs.watch)
3. Validação de schema antes de aplicar
4. Endpoint POST /admin/config/reload
5. Histórico de reloads (últimos 10)
6. CLI command para reload remoto

## Files Affected
- src/config/manager.ts (create)
- src/config/schema.ts (validation)
- src/server/index.ts (endpoint + watcher)
- src/server/routes.ts (admin routes)
- bin/cli.ts (reload command)

## Tests
- [x] Valid config load
- [x] Invalid config rejection + rollback
- [x] File watcher trigger
- [x] Concurrent reload handling
- [x] History tracking

## Checklist
- [ ] Código escrito
- [ ] Tests passando
- [ ] TypeScript OK
- [ ] CLI command funciona

**Status:** PENDING - 2026-04-19
