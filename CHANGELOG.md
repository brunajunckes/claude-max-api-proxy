# Changelog

All notable changes to this project are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Model support: `claude-opus-4-7`.** New top-of-family Opus entry in
  `src/models.ts`. Registered at the head of `MODEL_DEFINITIONS` so it becomes
  the canonical Opus id exposed via `/v1/models`, with the same 1,800,000 ms
  wall-clock timeout and 120,000 ms stall timeout as the other Opus variants.
  Older Opus entries (`4-6`, `4`, `4-5`) remain available as aliases.
- **Anti-bleed regression tests.** Three new tests in
  `src/claude-cli.inspect.test.ts` guard the OLLAMA-ONLY probe short-circuit
  patched on 2026-04-21:
  1. Verifies `src/claude-cli.inspect.ts` keeps the early-return inside
     `probeModelAvailability(...)` before any `runClaudeCommand(...)` call.
  2. Verifies the compiled `dist/claude-cli.inspect.js` mirrors the same
     early-return (so `npm run build` cannot silently regenerate the original
     probe body).
  3. Behaviorally asserts `probeModelAvailability()` resolves in under 500 ms
     with a stub result — if the patch is reverted, the CLI spawn would make
     this race fail.

## [1.0.1] - 2026-04-20

### Added
- Caching layer and improved APM graceful fallback.
- Tracing + metrics + observability test suite.
- Phase 1 + Phase 2 quick-wins and high-value items.
- GraphQL support via `apollo-server-express` + `graphql`.
- Audit, error-handler, and health-check middlewares.

### Fixed
- Stop Claude CLI token bleed in probe + warmup loops (`claude-cli.inspect.ts`
  and the corresponding dist): `probeModelAvailability()` now returns a stub
  result synchronously instead of spawning `claude --print ...` once per
  candidate model on every `/health` tick.
- Pipe prompt through stdin to avoid `E2BIG` on large prompts.

### Changed
- Safer service defaults in v1.0.1 release.
- Thinking-label limits aligned with Claude CLI levels.
- Thinking budget now resolvable from multiple sources and persisted across
  restarts via a runtime admin endpoint.
