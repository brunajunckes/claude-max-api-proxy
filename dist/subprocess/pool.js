/**
 * Subprocess Warm-up Pool
 *
 * Pre-spawns Claude CLI processes so requests don't pay cold-start cost.
 * Each pooled process runs `claude --print --output-format stream-json --verbose`
 * with stdin kept open, ready to receive a prompt.
 *
 * NOTE: Claude CLI's --print mode takes prompt as an argument, not stdin.
 * So the pool pre-validates that `claude` is accessible and warm in the OS
 * process cache by doing quick --version checks. This eliminates:
 * - Binary lookup overhead (PATH resolution)
 * - Shared library loading (first invocation loads dylibs)
 * - Node.js spawn() setup overhead on cold process table
 *
 * The real benefit is OS-level: after spawning a claude process, the kernel
 * caches the binary pages. Subsequent spawns reuse cached pages (warm start).
 */
import { spawn } from "child_process";

const POOL_SIZE = 3;
const WARMUP_INTERVAL_MS = 30 * 1000; // Re-warm every 30s

class SubprocessPool {
    warmedAt = 0;
    warming = false;

    /**
     * Warm the OS process cache by spawning quick --version processes.
     * This ensures the claude binary and its shared libs are in page cache.
     */
    async warm() {
        if (this.warming) return;
        this.warming = true;
        const isInitial = this.warmedAt === 0;
        const start = Date.now();
        try {
            const promises = [];
            for (let i = 0; i < POOL_SIZE; i++) {
                promises.push(this._spawnQuick());
            }
            await Promise.allSettled(promises);
            // On initial warm, also warm the CLI's module cache and auth path
            // by spawning a trivial haiku request and killing after first output
            if (isInitial) {
                await this._warmDeep();
            }
            this.warmedAt = Date.now();
            console.log(`[SubprocessPool] Warmed ${POOL_SIZE} processes${isInitial ? ' + deep warm' : ''} in ${Date.now() - start}ms`);
        } catch (err) {
            console.error("[SubprocessPool] Warm error:", err);
        } finally {
            this.warming = false;
        }
    }

    /**
     * Spawn a quick claude process to warm OS caches
     */
    _spawnQuick() {
        return new Promise((resolve) => {
            // Use clean env matching manager.js to avoid CLAUDE_CODE_* interference
            const env = { ...process.env };
            delete env.CLAUDE_CODE_ENTRYPOINT;
            delete env.CLAUDECODE;
            delete env.CLAUDE_CODE_SESSION;
            delete env.CLAUDE_CODE_PARENT;
            const proc = spawn("claude", ["--version"], {
                stdio: "pipe",
                env,
            });
            proc.on("close", () => resolve());
            proc.on("error", () => resolve());
            // Safety timeout
            setTimeout(() => {
                try { proc.kill(); } catch {}
                resolve();
            }, 5000);
        });
    }

    /**
     * Deep warm: spawn a trivial haiku request to warm CLI module cache
     * and API auth path. Kill after first output or 10s timeout.
     */
    _warmDeep() {
        return new Promise((resolve) => {
            const env = { ...process.env };
            delete env.CLAUDE_CODE_ENTRYPOINT;
            delete env.CLAUDECODE;
            delete env.CLAUDE_CODE_SESSION;
            delete env.CLAUDE_CODE_PARENT;
            try {
                const proc = spawn("claude", [
                    "--print", "--output-format", "stream-json",
                    "--model", "haiku",
                    "hi"
                ], { stdio: "pipe", env });
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    try { proc.kill(); } catch {}
                    resolve();
                };
                proc.stdout?.on("data", finish); // Kill on first output
                proc.on("close", finish);
                proc.on("error", finish);
                setTimeout(finish, 10000); // Safety timeout
            } catch {
                resolve();
            }
        });
    }

    /**
     * Check if pool is warm (recently warmed)
     */
    isWarm() {
        return (Date.now() - this.warmedAt) < WARMUP_INTERVAL_MS;
    }

    /**
     * Get pool status for health monitoring
     */
    getStatus() {
        return {
            warmedAt: this.warmedAt ? new Date(this.warmedAt).toISOString() : null,
            isWarm: this.isWarm(),
            poolSize: POOL_SIZE,
            warming: this.warming,
        };
    }
}

export const subprocessPool = new SubprocessPool();

// Initial warm-up on module load
subprocessPool.warm().catch(err => console.error("[SubprocessPool] Initial warm error:", err));

// Periodic re-warming
setInterval(() => {
    if (!subprocessPool.isWarm()) {
        subprocessPool.warm().catch(err => console.error("[SubprocessPool] Re-warm error:", err));
    }
}, WARMUP_INTERVAL_MS);
//# sourceMappingURL=pool.js.map
