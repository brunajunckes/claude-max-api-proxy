# claude server Investigation

## Command
```
claude server --port <port> --auth-token <token> [--unix <socket>] [--idle-timeout <ms>] [--max-sessions <n>]
```

## Options Discovered
- `--auth-token <token>` - Bearer token for auth
- `--host <string>` - Bind address (default: "0.0.0.0")
- `--idle-timeout <ms>` - Idle timeout for detached sessions (default: 600000, 0=never)
- `--max-sessions <n>` - Max concurrent sessions (default: 32, 0=unlimited)
- `--port <number>` - HTTP port (default: 0 = random)
- `--unix <path>` - Listen on unix domain socket
- `--workspace <dir>` - Default working directory

## Findings (2026-03-07)
- Process starts but produces NO output (stdout or stderr)
- Does NOT bind to specified port (lsof shows nothing)
- Does NOT create unix socket file
- Exits with 143 (SIGTERM) when killed, no errors
- Suspicion: requires subscription check or internal auth that fails silently
- May need `ANTHROPIC_API_KEY` or specific Max subscription state

## Protocol (Unknown)
- Not OpenAI-compatible (no /v1/chat/completions observed)
- Likely custom session-based protocol
- Would need to reverse-engineer from `claude-code` source

## Recommendation
- Not viable as a drop-in replacement for subprocess spawning yet
- Continue using subprocess approach with session persistence
- Revisit when protocol documentation is published or source can be inspected
