/**
 * Converts OpenAI chat request format to Claude CLI input
 */
import { resolveModel } from "../models.js";
/**
 * Extract Claude model alias from request model string.
 * Returns null for unrecognized models (caller decides fallback behavior).
 */
export function extractModel(model) {
    // Returns CLI alias or falls back to "sonnet" if model was not validated upstream
    return resolveModel(model) ?? "sonnet";
}
/**
 * Flatten content to a string. Handles both string content and
 * OpenAI multi-part content arrays [{type: "text", text: "..."}].
 */
function flattenContent(content) {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") return part;
                if (part && typeof part === "object" && part.text) return part.text;
                if (part && typeof part === "object" && part.type === "text" && part.text) return part.text;
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    return String(content || "");
}
/**
 * Extract system messages and non-system messages separately.
 *
 * System messages are passed via --system-prompt to Claude CLI,
 * which ensures they are treated as actual system instructions
 * rather than user text that the model may ignore.
 */
export function extractSystemAndPrompt(messages) {
    const systemParts = [];
    const promptParts = [];
    for (const msg of messages) {
        const text = flattenContent(msg.content);
        switch (msg.role) {
            case "system":
            case "developer":
                // Collect system/developer messages separately for --system-prompt
                // OpenAI API uses "developer" role for reasoning models (o1, etc.)
                // OpenClaw sends "developer" when model.reasoning is true
                systemParts.push(text);
                break;
            case "user":
                // User messages are the main prompt
                promptParts.push(text);
                break;
            case "assistant":
                // Previous assistant responses for context
                promptParts.push(`<previous_response>\n${text}\n</previous_response>\n`);
                break;
        }
    }
    return {
        systemPrompt: systemParts.join("\n\n") || undefined,
        prompt: promptParts.join("\n").trim(),
    };
}
/**
 * Extract only the last user message for resume mode.
 * When resuming a session, Claude CLI loads history from disk —
 * we only need to send the new message.
 */
export function extractLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
            return flattenContent(messages[i].content);
        }
    }
    return "";
}
/**
 * Convert OpenAI chat request to CLI input format
 */
export function openaiToCli(request, isResume = false) {
    if (isResume) {
        // On resume, only send the latest user message — CLI has the rest
        return {
            prompt: extractLastUserMessage(request.messages),
            systemPrompt: undefined,
            model: extractModel(request.model),
            sessionId: request.user,
            isResume: true,
        };
    }
    const { systemPrompt, prompt } = extractSystemAndPrompt(request.messages);
    return {
        prompt,
        systemPrompt,
        model: extractModel(request.model),
        sessionId: request.user,
        isResume: false,
    };
}
//# sourceMappingURL=openai-to-cli.js.map