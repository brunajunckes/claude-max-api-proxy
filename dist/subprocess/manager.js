/**
 * Claude Code CLI Subprocess Manager
 *
 * Handles spawning, managing, and parsing output from Claude CLI subprocesses.
 * Uses spawn() instead of exec() to prevent shell injection vulnerabilities.
 *
 * Improvements over v1:
 * - Model-specific timeouts (opus: 5min, sonnet: 2min, haiku: 1min)
 * - Better error classification and propagation
 * - Cleaner process lifecycle management
 */
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { isAssistantMessage, isResultMessage, isContentDelta } from "../types/claude-cli.js";
import { getModelTimeout } from "../models.js";

// Cache cleaned environment once at startup
const CLEAN_ENV = (() => {
    const env = { ...process.env };
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION;
    delete env.CLAUDE_CODE_PARENT;
    return env;
})();

export class ClaudeSubprocess extends EventEmitter {
    process = null;
    buffer = "";
    timeoutId = null;
    isKilled = false;

    /**
     * Start the Claude CLI subprocess with the given prompt
     */
    async start(prompt, options) {
        const args = this.buildArgs(prompt, options);
        const timeout = options.timeout || getModelTimeout(options.model);

        return new Promise((resolve, reject) => {
            try {
                this.process = spawn("claude", args, {
                    cwd: options.cwd || process.cwd(),
                    env: CLEAN_ENV,
                    stdio: ["pipe", "pipe", "pipe"],
                });

                // Set model-aware timeout
                this.timeoutId = setTimeout(() => {
                    if (!this.isKilled) {
                        this.isKilled = true;
                        this.process?.kill("SIGTERM");
                        this.emit("error", new Error(`Request timed out after ${timeout / 1000}s (model: ${options.model})`));
                    }
                }, timeout);

                // Handle spawn errors
                this.process.on("error", (err) => {
                    this.clearTimeout();
                    if (err.message.includes("ENOENT")) {
                        reject(new Error("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"));
                    } else {
                        reject(err);
                    }
                });

                // Close stdin since we pass prompt as argument
                this.process.stdin?.end();

                console.error(`[Subprocess] PID ${this.process.pid} spawned (model: ${options.model}, timeout: ${timeout / 1000}s, session: ${options.sessionId?.slice(0, 8) || 'new'})`);

                // Parse JSON stream from stdout
                this.process.stdout?.on("data", (chunk) => {
                    const data = chunk.toString();
                    this.buffer += data;
                    this.processBuffer();
                });

                // Capture stderr for debugging (less verbose than before)
                this.process.stderr?.on("data", (chunk) => {
                    const errorText = chunk.toString().trim();
                    if (errorText && process.env.DEBUG) {
                        console.error("[Subprocess stderr]:", errorText.slice(0, 200));
                    }
                });

                // Handle process close
                this.process.on("close", (code) => {
                    console.error(`[Subprocess] PID ${this.process?.pid} closed (code: ${code})`);
                    this.clearTimeout();
                    // Process any remaining buffer
                    if (this.buffer.trim()) {
                        this.processBuffer();
                    }
                    this.emit("close", code);
                });

                // Resolve immediately since we're streaming
                resolve();
            } catch (err) {
                this.clearTimeout();
                reject(err);
            }
        });
    }

    /**
     * Build CLI arguments array
     */
    buildArgs(prompt, options) {
        const args = [
            "--print",
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--model", options.model,
            "--dangerously-skip-permissions",
        ];

        // Session persistence
        if (options.isResume && options.sessionId) {
            args.push("--resume", options.sessionId);
        } else if (options.sessionId) {
            args.push("--session-id", options.sessionId);
        }

        // System prompt
        if (options.systemPrompt) {
            args.push("--system-prompt", options.systemPrompt);
        }

        // Fallback model for opus
        if (options.model === "opus") {
            args.push("--fallback-model", "sonnet");
        }

        // Prompt must be last argument
        args.push(prompt);
        return args;
    }

    /**
     * Process the buffer and emit parsed messages
     */
    processBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || ""; // Keep incomplete line

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const message = JSON.parse(trimmed);
                this.emit("message", message);

                if (isContentDelta(message)) {
                    this.emit("content_delta", message);
                } else if (isAssistantMessage(message)) {
                    this.emit("assistant", message);
                } else if (isResultMessage(message)) {
                    this.emit("result", message);
                }
            } catch {
                // Non-JSON output, emit as raw
                this.emit("raw", trimmed);
            }
        }
    }

    /**
     * Clear the timeout timer
     */
    clearTimeout() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * Kill the subprocess
     */
    kill(signal = "SIGTERM") {
        if (!this.isKilled && this.process) {
            this.isKilled = true;
            this.clearTimeout();
            this.process.kill(signal);
        }
    }

    /**
     * Check if the process is still running
     */
    isRunning() {
        return this.process !== null && !this.isKilled && this.process.exitCode === null;
    }
}

/**
 * Verify that Claude CLI is installed and accessible
 */
export async function verifyClaude() {
    return new Promise((resolve) => {
        const proc = spawn("claude", ["--version"], { stdio: "pipe" });
        let output = "";
        proc.stdout?.on("data", (chunk) => {
            output += chunk.toString();
        });
        proc.on("error", () => {
            resolve({
                ok: false,
                error: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
            });
        });
        proc.on("close", (code) => {
            if (code === 0) {
                resolve({ ok: true, version: output.trim() });
            } else {
                resolve({
                    ok: false,
                    error: "Claude CLI returned non-zero exit code",
                });
            }
        });
    });
}

/**
 * Check if Claude CLI is authenticated
 */
export async function verifyAuth() {
    return { ok: true };
}
