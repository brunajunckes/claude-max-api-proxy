/**
 * SQLite-backed Conversation Store
 *
 * Persists full message history per conversation independently of Claude CLI sessions.
 * Acts as a fallback when session resume fails — can replay from store.
 */
import { DatabaseSync } from "node:sqlite";
import path from "path";

const DB_PATH = path.join(process.env.HOME || "/tmp", ".claude-proxy-conversations.db");

class ConversationStore {
    db = null;

    init() {
        if (this.db) return;
        this.db = new DatabaseSync(DB_PATH);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                model TEXT,
                session_id TEXT
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT,
                event TEXT NOT NULL,
                duration_ms INTEGER,
                success INTEGER,
                error TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_metrics_event ON metrics(event);
            CREATE INDEX IF NOT EXISTS idx_metrics_time ON metrics(created_at);
        `);
        console.log(`[ConversationStore] Initialized at ${DB_PATH}`);
    }

    /**
     * Ensure a conversation exists, creating it if needed
     */
    ensureConversation(conversationId, model, sessionId) {
        this.init();
        const existing = this.db.prepare(
            "SELECT id FROM conversations WHERE id = ?"
        ).get(conversationId);
        if (!existing) {
            this.db.prepare(
                "INSERT INTO conversations (id, created_at, updated_at, model, session_id) VALUES (?, ?, ?, ?, ?)"
            ).run(conversationId, Date.now(), Date.now(), model || null, sessionId || null);
        } else {
            this.db.prepare(
                "UPDATE conversations SET updated_at = ?, session_id = COALESCE(?, session_id) WHERE id = ?"
            ).run(Date.now(), sessionId || null, conversationId);
        }
    }

    /**
     * Append a message to a conversation
     */
    addMessage(conversationId, role, content) {
        this.init();
        this.db.prepare(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
        ).run(conversationId, role, content, Date.now());
    }

    /**
     * Get full message history for a conversation
     */
    getMessages(conversationId) {
        this.init();
        return this.db.prepare(
            "SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC"
        ).all(conversationId);
    }

    /**
     * Get conversation metadata
     */
    getConversation(conversationId) {
        this.init();
        return this.db.prepare(
            "SELECT * FROM conversations WHERE id = ?"
        ).get(conversationId);
    }

    /**
     * Record a metric event (for health monitoring)
     */
    recordMetric(event, { conversationId, durationMs, success, error } = {}) {
        this.init();
        this.db.prepare(
            "INSERT INTO metrics (conversation_id, event, duration_ms, success, error, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(conversationId || null, event, durationMs || null, success ? 1 : 0, error || null, Date.now());
    }

    /**
     * Get health metrics summary for the last N minutes
     */
    getHealthMetrics(minutesBack = 60) {
        this.init();
        const cutoff = Date.now() - (minutesBack * 60 * 1000);
        const rows = this.db.prepare(`
            SELECT
                event,
                COUNT(*) as count,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
                AVG(duration_ms) as avg_duration_ms,
                MIN(duration_ms) as min_duration_ms,
                MAX(duration_ms) as max_duration_ms
            FROM metrics
            WHERE created_at > ?
            GROUP BY event
        `).all(cutoff);
        return rows;
    }

    /**
     * Get recent errors
     */
    getRecentErrors(limit = 10) {
        this.init();
        return this.db.prepare(
            "SELECT * FROM metrics WHERE success = 0 AND error IS NOT NULL ORDER BY created_at DESC LIMIT ?"
        ).all(limit);
    }

    /**
     * Clean up old conversations (older than N days)
     */
    cleanup(daysOld = 7) {
        this.init();
        const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
        const convIds = this.db.prepare(
            "SELECT id FROM conversations WHERE updated_at < ?"
        ).all(cutoff).map(r => r.id);
        if (convIds.length === 0) return 0;
        const placeholders = convIds.map(() => "?").join(",");
        this.db.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...convIds);
        this.db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...convIds);
        // Also clean old metrics
        this.db.prepare("DELETE FROM metrics WHERE created_at < ?").run(cutoff);
        console.log(`[ConversationStore] Cleaned up ${convIds.length} old conversations`);
        return convIds.length;
    }

    /**
     * Get store stats
     */
    getStats() {
        this.init();
        const convCount = this.db.prepare("SELECT COUNT(*) as c FROM conversations").get().c;
        const msgCount = this.db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
        const metricCount = this.db.prepare("SELECT COUNT(*) as c FROM metrics").get().c;
        return { conversations: convCount, messages: msgCount, metrics: metricCount };
    }
}

export const conversationStore = new ConversationStore();

// Periodic cleanup every 6 hours
setInterval(() => {
    try { conversationStore.cleanup(); } catch (e) { console.error("[ConversationStore] Cleanup error:", e); }
}, 6 * 60 * 60 * 1000);
//# sourceMappingURL=conversation.js.map
