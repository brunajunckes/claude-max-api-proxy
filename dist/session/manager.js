/**
 * Session Manager
 *
 * Maps Clawdbot conversation IDs to Claude CLI session IDs
 * for maintaining conversation context across requests.
 */
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
const SESSION_FILE = path.join(process.env.HOME || "/tmp", ".claude-code-cli-sessions.json");
// Session TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
class SessionManager {
    sessions = new Map();
    loaded = false;
    dirty = false;
    saveTimer = null;
    /**
     * Load sessions from disk
     */
    async load() {
        if (this.loaded)
            return;
        try {
            const data = await fs.readFile(SESSION_FILE, "utf-8");
            const parsed = JSON.parse(data);
            this.sessions = new Map(Object.entries(parsed));
            this.loaded = true;
            console.log(`[SessionManager] Loaded ${this.sessions.size} sessions`);
        }
        catch {
            // File doesn't exist or is invalid, start fresh
            this.sessions = new Map();
            this.loaded = true;
        }
    }
    /**
     * Save sessions to disk (synchronous — only for shutdown hooks)
     */
    saveSync() {
        try {
            const data = Object.fromEntries(this.sessions);
            fsSync.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
            this.dirty = false;
        } catch (err) {
            console.error("[SessionManager] Sync save error:", err);
        }
    }
    /**
     * Schedule an async save debounced to 1 second.
     * Prevents blocking the event loop on every mutation.
     */
    scheduleSave() {
        this.dirty = true;
        if (this.saveTimer) return; // Already scheduled
        this.saveTimer = setTimeout(async () => {
            this.saveTimer = null;
            if (!this.dirty) return;
            try {
                const data = Object.fromEntries(this.sessions);
                await fs.writeFile(SESSION_FILE, JSON.stringify(data, null, 2));
                this.dirty = false;
            } catch (err) {
                console.error("[SessionManager] Async save error:", err);
            }
        }, 1000);
    }
    async save() {
        this.scheduleSave();
    }
    /**
     * Get or create a Claude session ID for a Clawdbot conversation.
     * Returns { sessionId, isResume } so callers know whether to use --resume.
     * Validates session age before resuming — stale sessions get fresh IDs.
     */
    getOrCreate(clawdbotId, model = "sonnet") {
        const existing = this.sessions.get(clawdbotId);
        if (existing) {
            // Check session health: if last used > 6 hours ago, create fresh
            const ageMs = Date.now() - existing.lastUsedAt;
            const MAX_RESUME_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
            if (ageMs > MAX_RESUME_AGE_MS) {
                console.log(`[SessionManager] Session ${clawdbotId} stale (${Math.round(ageMs / 3600000)}h), creating fresh`);
                this.sessions.delete(clawdbotId);
                // Fall through to create new session
            } else {
                existing.lastUsedAt = Date.now();
                existing.model = model;
                this.scheduleSave();
                return { sessionId: existing.claudeSessionId, isResume: true };
            }
        }
        const claudeSessionId = uuidv4();
        const mapping = {
            clawdbotId,
            claudeSessionId,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            model,
        };
        this.sessions.set(clawdbotId, mapping);
        console.log(`[SessionManager] Created session: ${clawdbotId} -> ${claudeSessionId}`);
        this.scheduleSave();
        return { sessionId: claudeSessionId, isResume: false };
    }
    /**
     * Get existing session if it exists
     */
    get(clawdbotId) {
        return this.sessions.get(clawdbotId);
    }
    /**
     * Delete a session
     */
    delete(clawdbotId) {
        const deleted = this.sessions.delete(clawdbotId);
        if (deleted) {
            this.scheduleSave();
        }
        return deleted;
    }
    /**
     * Clean up expired sessions
     */
    cleanup() {
        const cutoff = Date.now() - SESSION_TTL_MS;
        let removed = 0;
        for (const [key, session] of this.sessions) {
            if (session.lastUsedAt < cutoff) {
                this.sessions.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[SessionManager] Cleaned up ${removed} expired sessions`);
            this.scheduleSave();
        }
        return removed;
    }
    /**
     * Get all active sessions
     */
    getAll() {
        return Array.from(this.sessions.values());
    }
    /**
     * Get session count
     */
    get size() {
        return this.sessions.size;
    }
}
// Singleton instance
export const sessionManager = new SessionManager();
// Initialize on module load
sessionManager.load().catch((err) => console.error("[SessionManager] Load error:", err));
// Periodic cleanup every hour
setInterval(() => {
    sessionManager.cleanup();
}, 60 * 60 * 1000);
// Flush dirty state on shutdown (sync to prevent data loss)
process.on("SIGTERM", () => { if (sessionManager.dirty) sessionManager.saveSync(); });
process.on("SIGINT", () => { if (sessionManager.dirty) sessionManager.saveSync(); });
//# sourceMappingURL=manager.js.map