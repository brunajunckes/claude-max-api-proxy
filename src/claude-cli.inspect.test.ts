import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  classifyClaudeError,
  extractClaudeErrorFromMessages,
  extractClaudeErrorFromResult,
  parseAuthStatus,
  parseClaudeJsonOutput,
  probeModelAvailability,
} from "./claude-cli.inspect.js";
import type { ClaudeCliMessage, ClaudeCliResult } from "./types/claude-cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("parseAuthStatus parses valid auth JSON", () => {
  assert.deepEqual(
    parseAuthStatus('{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}'),
    {
      loggedIn: true,
      authMethod: "oauth_token",
      apiProvider: "firstParty",
    },
  );
});

test("parseAuthStatus returns null for invalid JSON", () => {
  assert.equal(parseAuthStatus("not json"), null);
});

test("parseClaudeJsonOutput parses array output", () => {
  const messages = parseClaudeJsonOutput('[{"type":"result","subtype":"success","is_error":false,"duration_ms":1,"duration_api_ms":1,"num_turns":1,"result":"OK","session_id":"abc","total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1},"modelUsage":{}}]');
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, "result");
});

test("extractClaudeErrorFromMessages classifies model access failures", () => {
  const messages: ClaudeCliMessage[] = [
    {
      type: "assistant",
      error: "invalid_request",
      message: {
        id: "msg_1",
        model: "<synthetic>",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "There's an issue with the selected model (claude-sonnet-4-6). It may not exist or you may not have access to it." }],
        stop_reason: "stop_sequence",
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      session_id: "session-1",
      uuid: "uuid-1",
    },
    {
      type: "result",
      subtype: "success",
      is_error: true,
      duration_ms: 1,
      duration_api_ms: 0,
      num_turns: 1,
      result: "There's an issue with the selected model (claude-sonnet-4-6). It may not exist or you may not have access to it.",
      session_id: "session-1",
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      modelUsage: {},
    },
  ];

  const error = extractClaudeErrorFromMessages(messages);
  assert.ok(error);
  assert.equal(error?.status, 400);
  assert.equal(error?.code, "model_unavailable");
});

test("extractClaudeErrorFromResult ignores successful results", () => {
  const result: ClaudeCliResult = {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: "OK",
    session_id: "session-1",
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 },
    modelUsage: {},
  };

  assert.equal(extractClaudeErrorFromResult(result), null);
});

test("classifyClaudeError maps auth failures", () => {
  const error = classifyClaudeError("Claude CLI is not authenticated. Run: claude auth login");
  assert.equal(error.status, 401);
  assert.equal(error.code, "auth_required");
});

// ------------------------------------------------------------------
// Anti-bleed patch guardrails (OLLAMA-ONLY RULE, patched 2026-04-21).
//
// probeModelAvailability() must return a stub result BEFORE calling
// runClaudeCommand(). Without the early-return, the probe loop spawns
// the Claude CLI once per candidate model on every /health tick, which
// burns tokens against the user's Anthropic subscription.
//
// These tests catch two regression paths:
//   1. Someone removes or re-orders the early-return in src.
//   2. Someone runs `npm run build` after a tampered src, regenerating
//      dist without the patch.
// ------------------------------------------------------------------

const PROBE_FN_MARKER = "export async function probeModelAvailability";
const RUN_CLI_CALL = "runClaudeCommand(";
// Match the early-return as live code — the line must start with whitespace
// only (no //, no /*, no *), so a commented-out or block-wrapped version
// does NOT satisfy the guard.
const EARLY_RETURN_LINE_REGEX =
  /^[ \t]*return \{ ok: true, model, resolvedModel: model \};[ \t]*$/m;

function assertEarlyReturnBeforeRunClaudeCommand(
  source: string,
  label: string,
): void {
  const probeStart = source.indexOf(PROBE_FN_MARKER);
  assert.notEqual(
    probeStart,
    -1,
    `${label}: probeModelAvailability declaration not found`,
  );

  const afterProbe = source.slice(probeStart);
  const match = EARLY_RETURN_LINE_REGEX.exec(afterProbe);
  assert.ok(
    match,
    `${label}: anti-bleed early-return marker missing or commented out`,
  );

  const returnIdx = probeStart + (match?.index ?? 0);
  const runCliIdx = source.indexOf(RUN_CLI_CALL, probeStart);
  if (runCliIdx !== -1) {
    assert.ok(
      returnIdx < runCliIdx,
      `${label}: early-return must appear BEFORE runClaudeCommand(...) — patch reverted?`,
    );
  }
}

test("anti-bleed: src/claude-cli.inspect.ts keeps early-return patch", () => {
  const srcPath = resolve(__dirname, "../src/claude-cli.inspect.ts");
  const source = readFileSync(srcPath, "utf8");
  assertEarlyReturnBeforeRunClaudeCommand(source, "src");
});

test("anti-bleed: dist/claude-cli.inspect.js keeps early-return patch", () => {
  const distPath = resolve(__dirname, "./claude-cli.inspect.js");
  const source = readFileSync(distPath, "utf8");
  assertEarlyReturnBeforeRunClaudeCommand(source, "dist");
});

test("anti-bleed: probeModelAvailability returns stub without spawning CLI", async () => {
  // If the patch is in place, this returns synchronously on the first tick.
  // If reverted, it would spawn `claude --print ...` and take seconds.
  const start = Date.now();
  const result = await Promise.race([
    probeModelAvailability("claude-test-anti-bleed-sentinel"),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("probe took too long — patch reverted?")), 500),
    ),
  ]);
  const elapsed = Date.now() - start;

  assert.deepEqual(result, {
    ok: true,
    model: "claude-test-anti-bleed-sentinel",
    resolvedModel: "claude-test-anti-bleed-sentinel",
  });
  assert.ok(elapsed < 500, `probe elapsed ${elapsed}ms — expected < 500ms`);
});
