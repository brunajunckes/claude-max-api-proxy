/**
 * API Route Handlers
 *
 * Implements OpenAI-compatible endpoints for integration with OpenClaw/Clawdbot.
 *
 * CONCURRENCY MODEL: Queue-and-Serialize per conversation.
 * - Each conversation gets a FIFO queue
 * - Requests for the same conversation are processed sequentially
 * - Different conversations run fully in parallel
 * - No request is ever silently killed — every request gets a response
 */
import { v4 as uuidv4 } from "uuid";
import { ClaudeSubprocess } from "../subprocess/manager.js";
import { openaiToCli } from "../adapter/openai-to-cli.js";
import { cliResultToOpenai, createDoneChunk, } from "../adapter/cli-to-openai.js";
import { sessionManager } from "../session/manager.js";
import { conversationStore } from "../store/conversation.js";
import { subprocessPool } from "../subprocess/pool.js";
import { getModelTimeout, isValidModel, getModelList } from "../models.js";

/**
 * Per-conversation request queues.
 * Maps conversationId -> { queue: Array<Function>, processing: boolean }
 *
 * Each queue entry is a function that returns a Promise (the request handler).
 * Only one request processes at a time per conversation.
 * Different conversations are fully independent.
 */
const conversationQueues = new Map();

/**
 * Enqueue a request for a conversation and process sequentially.
 * Returns a promise that resolves when THIS request completes.
 */
function enqueueRequest(conversationId, handler) {
    return new Promise((resolve, reject) => {
        let entry = conversationQueues.get(conversationId);
        if (!entry) {
            entry = { queue: [], processing: false };
            conversationQueues.set(conversationId, entry);
        }

        entry.queue.push({ handler, resolve, reject });

        if (!entry.processing) {
            processQueue(conversationId);
        }
    });
}

/**
 * Process the next item in a conversation's queue.
 */
async function processQueue(conversationId) {
    const entry = conversationQueues.get(conversationId);
    if (!entry || entry.queue.length === 0) {
        if (entry) {
            entry.processing = false;
            // Clean up empty queues to prevent memory leaks
            if (entry.queue.length === 0) {
                conversationQueues.delete(conversationId);
            }
        }
        return;
    }

    entry.processing = true;
    const { handler, resolve, reject } = entry.queue.shift();

    try {
        const result = await handler();
        resolve(result);
    } catch (err) {
        reject(err);
    }

    // Process next item in queue (if any)
    processQueue(conversationId);
}

/**
 * Handle POST /v1/chat/completions
 *
 * Main endpoint for chat requests, supports both streaming and non-streaming.
 * Requests for the same conversation are queued and processed sequentially.
 */
export async function handleChatCompletions(req, res) {
    const requestId = uuidv4().replace(/-/g, "").slice(0, 24);
    const body = req.body;
    const stream = body.stream === true;

    // Validate request
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({
            error: {
                message: "messages is required and must be a non-empty array",
                type: "invalid_request_error",
                code: "invalid_messages",
            },
        });
        return;
    }

    // Validate model
    if (body.model && !isValidModel(body.model)) {
        res.status(400).json({
            error: {
                message: `Model '${body.model}' is not supported. Use GET /v1/models for available models.`,
                type: "invalid_request_error",
                code: "model_not_found",
            },
        });
        return;
    }

    const startTime = Date.now();
    const conversationId = body.user || requestId;
    const queueEntry = conversationQueues.get(conversationId);
    const queueDepth = queueEntry ? queueEntry.queue.length : 0;

    // Reject if queue is too deep (prevent unbounded memory growth)
    const MAX_QUEUE_DEPTH = 5;
    if (queueDepth >= MAX_QUEUE_DEPTH) {
        console.warn(`[Routes] Queue full for ${conversationId} (${queueDepth} queued), rejecting`);
        res.status(429).json({
            error: {
                message: `Too many queued requests for this conversation (${queueDepth}). Please wait for current requests to complete.`,
                type: "rate_limit_error",
                code: "queue_full",
            },
        });
        return;
    }

    if (queueDepth > 0) {
        console.log(`[Routes] Queuing request for conversation ${conversationId} (${queueDepth} ahead)`);
    }

    try {
        await enqueueRequest(conversationId, async () => {
            const { sessionId, isResume } = sessionManager.getOrCreate(conversationId, body.model);
            console.log(`[Routes] Processing conversation ${conversationId}: session=${sessionId}, resume=${isResume}`);

            // Store conversation and incoming messages
            conversationStore.ensureConversation(conversationId, body.model, sessionId);
            const lastUserMsg = body.messages.filter(m => m.role === "user").pop();
            if (lastUserMsg) {
                const content = typeof lastUserMsg.content === "string"
                    ? lastUserMsg.content
                    : JSON.stringify(lastUserMsg.content);
                conversationStore.addMessage(conversationId, "user", content);
            }

            // Convert to CLI input format — skip history replay on resume
            const cliInput = openaiToCli(body, isResume);
            cliInput.sessionId = sessionId;
            cliInput.isResume = isResume;
            cliInput._conversationId = conversationId;
            cliInput._startTime = startTime;

            if (stream) {
                await handleStreamingResponse(req, res, cliInput, requestId);
            } else {
                await handleNonStreamingResponse(res, cliInput, requestId);
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[handleChatCompletions] Error:", message);
        if (!res.headersSent) {
            res.status(500).json({
                error: {
                    message,
                    type: "server_error",
                    code: null,
                },
            });
        }
    }
}

/**
 * SSE keepalive interval (ms).
 * Sends a comment line to prevent connection timeouts.
 */
const SSE_KEEPALIVE_INTERVAL = 5000; // 5 seconds — aggressive to prevent OpenClaw HTTP timeouts

/**
 * Spawn a subprocess with retry logic.
 * On first failure, waits briefly and retries once.
 * Returns the subprocess (caller wires up event handlers before calling this).
 */
async function spawnWithRetry(subprocess, prompt, options, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await subprocess.start(prompt, options);
            return; // Success
        } catch (err) {
            if (attempt < maxRetries) {
                const delay = 1000 * (attempt + 1); // 1s, 2s, etc.
                console.warn(`[Routes] Subprocess start failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${err.message}`);
                await new Promise(r => setTimeout(r, delay));
                // Create a fresh subprocess for retry
                subprocess.kill();
                // Re-initialize (the subprocess class handles this via kill + re-start)
            } else {
                throw err;
            }
        }
    }
}

/**
 * Handle streaming response (SSE)
 *
 * Each request gets its own subprocess — no abort logic needed.
 * The queue ensures only one request runs per conversation at a time.
 */
async function handleStreamingResponse(req, res, cliInput, requestId) {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if proxied
    res.flushHeaders();
    res.write(":ok\n\n");

    const timeout = getModelTimeout(cliInput.model);

    return new Promise((resolve) => {
        const subprocess = new ClaudeSubprocess();
        let isFirst = true;
        let lastModel = "claude-sonnet-4";
        let isComplete = false;
        let fullResponse = "";
        let clientDisconnected = false;
        let isRetrying = false; // Guard: prevents first close handler from acting during retry
        let spawnTime = 0;
        let firstByteTime = 0;

        // Pre-built SSE chunk template parts (avoid JSON.stringify per token)
        const chunkId = `chatcmpl-${requestId}`;
        const buildChunk = (text, model, first) => {
            const escaped = JSON.stringify(text);
            const ts = Math.floor(Date.now() / 1000);
            if (first) {
                return `data: {"id":"${chunkId}","object":"chat.completion.chunk","created":${ts},"model":"${model}","choices":[{"index":0,"delta":{"role":"assistant","content":${escaped}},"finish_reason":null}]}\n\n`;
            }
            return `data: {"id":"${chunkId}","object":"chat.completion.chunk","created":${ts},"model":"${model}","choices":[{"index":0,"delta":{"content":${escaped}},"finish_reason":null}]}\n\n`;
        };

        // SSE keepalive: send comment every 5s to prevent connection timeouts
        const keepaliveId = setInterval(() => {
            if (!isComplete && !clientDisconnected && !res.writableEnded) {
                res.write(":keepalive\n\n");
            }
        }, SSE_KEEPALIVE_INTERVAL);

        // Timeout handler for this specific request
        const timeoutId = setTimeout(() => {
            if (!isComplete) {
                console.error(`[Streaming] Request ${requestId} timed out after ${timeout}ms`);
                subprocess.kill();
                // Invalidate session on timeout to prevent stale resume
                if (cliInput._conversationId) {
                    sessionManager.delete(cliInput._conversationId);
                    console.warn(`[Streaming] Session invalidated for ${cliInput._conversationId} due to timeout`);
                }
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({
                        error: { message: `Request timed out after ${timeout / 1000}s`, type: "timeout_error", code: null },
                    })}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                cleanup();
                resolve();
            }
        }, timeout);

        let cleanup = () => {
            clearTimeout(timeoutId);
            clearInterval(keepaliveId);
        };

        // Handle client disconnect — give subprocess a grace period to finish
        // OpenClaw sometimes drops the HTTP connection when a new user message
        // arrives during streaming. We give the subprocess a grace period to
        // complete naturally, then kill it to prevent zombie processes that
        // permanently block the conversation queue.
        const DISCONNECT_GRACE_MS = 60000; // 60 seconds to finish after client disconnects
        res.on("close", () => {
            clientDisconnected = true;
            if (isRetrying) return; // Retry handler owns disconnect cleanup
            if (!isComplete) {
                console.warn(`[Streaming] Client disconnected for ${requestId}, subprocess gets ${DISCONNECT_GRACE_MS / 1000}s grace period`);
                // Set a grace period — if subprocess doesn't finish in time, kill it
                const disconnectTimeout = setTimeout(() => {
                    if (!isComplete) {
                        console.warn(`[Streaming] Grace period expired for ${requestId}, killing subprocess`);
                        subprocess.kill();
                        // Store partial response if we have any
                        if (fullResponse && cliInput._conversationId) {
                            try {
                                conversationStore.addMessage(cliInput._conversationId, "assistant", fullResponse + "\n\n[Response truncated — client disconnected]");
                            } catch (e) { console.error("[Routes] Store error:", e); }
                        }
                        cleanup();
                        resolve();
                    }
                }, DISCONNECT_GRACE_MS);
                // If subprocess finishes within grace period, clear the timeout
                const origCleanup = cleanup;
                cleanup = () => {
                    clearTimeout(disconnectTimeout);
                    origCleanup();
                };
            } else {
                cleanup();
                resolve();
            }
        });

        // Stream content deltas to the client
        subprocess.on("content_delta", (event) => {
            const text = event.event?.delta?.text || "";
            fullResponse += text; // Always buffer, even after disconnect
            if (clientDisconnected) return; // Skip writing to closed connection
            if (text && !res.writableEnded) {
                // TTFB logging on first token
                if (isFirst && !firstByteTime) {
                    firstByteTime = Date.now();
                    const ttfb = firstByteTime - (cliInput._startTime || firstByteTime);
                    const spawnDelta = spawnTime ? spawnTime - (cliInput._startTime || spawnTime) : 0;
                    const tokenDelta = spawnTime ? firstByteTime - spawnTime : 0;
                    console.log(`[Streaming] TTFB: ${ttfb}ms (spawn: ${spawnDelta}ms, first-token: ${tokenDelta}ms) [${requestId}]`);
                }
                res.write(buildChunk(text, lastModel, isFirst));
                isFirst = false;
            }
        });

        // Capture model name from assistant message
        subprocess.on("assistant", (message) => {
            lastModel = message.message.model;
        });

        subprocess.on("result", (_result) => {
            isComplete = true;
            cleanup();

            // Extract usage from CLI result message
            const usageData = _result?.usage ? {
                prompt_tokens: _result.usage.input_tokens || 0,
                completion_tokens: _result.usage.output_tokens || 0,
                total_tokens: (_result.usage.input_tokens || 0) + (_result.usage.output_tokens || 0),
            } : null;

            // Store response and record metric — even if client disconnected
            try {
                if (fullResponse && cliInput._conversationId) {
                    conversationStore.addMessage(cliInput._conversationId, "assistant", fullResponse);
                    if (clientDisconnected) {
                        console.log(`[Streaming] Subprocess completed after client disconnect. Response stored (${fullResponse.length} chars) for ${cliInput._conversationId}`);
                    }
                }
                conversationStore.recordMetric("request_complete", {
                    conversationId: cliInput._conversationId,
                    durationMs: Date.now() - (cliInput._startTime || Date.now()),
                    success: true,
                    clientDisconnected,
                });
            } catch (e) { console.error("[Routes] Store error:", e); }

            if (!clientDisconnected && !res.writableEnded) {
                // Send final chunk with usage data (OpenAI convention)
                const doneChunk = createDoneChunk(requestId, lastModel);
                if (usageData) {
                    doneChunk.usage = usageData;
                }
                res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
                res.write("data: [DONE]\n\n");
                res.end();
            }
            resolve();
        });

        subprocess.on("error", (error) => {
            isComplete = true;
            cleanup();
            console.error("[Streaming] Error:", error.message);
            try {
                conversationStore.recordMetric("request_error", {
                    conversationId: cliInput._conversationId,
                    durationMs: Date.now() - (cliInput._startTime || Date.now()),
                    success: false,
                    error: error.message,
                    clientDisconnected,
                });
            } catch (e) { console.error("[Routes] Metric error:", e); }

            if (!clientDisconnected && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({
                    error: { message: error.message, type: "server_error", code: null },
                })}\n\n`);
                res.write("data: [DONE]\n\n");
                res.end();
            }
            resolve();
        });

        subprocess.on("close", (code) => {
            cleanup();
            if (!clientDisconnected && !res.writableEnded) {
                if (code !== 0 && !isComplete) {
                    res.write(`data: ${JSON.stringify({
                        error: { message: `Process exited with code ${code}`, type: "server_error", code: null },
                    })}\n\n`);
                }
                res.write("data: [DONE]\n\n");
                res.end();
            }
            resolve();
        });

        // Record spawn time for TTFB logging
        spawnTime = Date.now();

        // Start subprocess with retry on failure
        const startOpts = {
            model: cliInput.model,
            sessionId: cliInput.sessionId,
            systemPrompt: cliInput.systemPrompt,
            isResume: cliInput.isResume,
            timeout: timeout,
        };

        subprocess.start(cliInput.prompt, startOpts).catch(async (err) => {
            console.warn(`[Streaming] First attempt failed: ${err.message}, retrying...`);
            isRetrying = true; // Signal first close handler to skip
            // Create fresh subprocess for retry, re-attach handlers
            subprocess.kill();
            const retry = new ClaudeSubprocess();
            isFirst = true;

            retry.on("content_delta", (event) => {
                if (clientDisconnected) return;
                const text = event.event?.delta?.text || "";
                fullResponse += text;
                if (text && !res.writableEnded) {
                    if (isFirst && !firstByteTime) {
                        firstByteTime = Date.now();
                        console.log(`[Streaming] TTFB (retry): ${firstByteTime - (cliInput._startTime || firstByteTime)}ms [${requestId}]`);
                    }
                    res.write(buildChunk(text, lastModel, isFirst));
                    isFirst = false;
                }
            });
            retry.on("assistant", (message) => { lastModel = message.message.model; });
            retry.on("result", (_result) => {
                isComplete = true;
                cleanup();

                // Extract usage from CLI result message
                const usageData = _result?.usage ? {
                    prompt_tokens: _result.usage.input_tokens || 0,
                    completion_tokens: _result.usage.output_tokens || 0,
                    total_tokens: (_result.usage.input_tokens || 0) + (_result.usage.output_tokens || 0),
                } : null;

                try {
                    if (fullResponse && cliInput._conversationId) {
                        conversationStore.addMessage(cliInput._conversationId, "assistant", fullResponse);
                    }
                    conversationStore.recordMetric("request_complete", {
                        conversationId: cliInput._conversationId,
                        durationMs: Date.now() - (cliInput._startTime || Date.now()),
                        success: true,
                    });
                } catch (e) { console.error("[Routes] Store error:", e); }
                if (!res.writableEnded) {
                    const doneChunk = createDoneChunk(requestId, lastModel);
                    if (usageData) {
                        doneChunk.usage = usageData;
                    }
                    res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                resolve();
            });
            retry.on("error", (error) => {
                isComplete = true;
                cleanup();
                console.error("[Streaming] Retry also failed:", error.message);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ error: { message: error.message, type: "server_error", code: null } })}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                resolve();
            });
            retry.on("close", (code) => {
                cleanup();
                if (!res.writableEnded) {
                    if (code !== 0 && !isComplete) {
                        res.write(`data: ${JSON.stringify({ error: { message: `Process exited with code ${code}`, type: "server_error", code: null } })}\n\n`);
                    }
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                resolve();
            });
            res.on("close", () => {
                clientDisconnected = true;
                if (isComplete) { cleanup(); resolve(); }
                else {
                    // Grace period for retry subprocess
                    const retryDisconnectTimeout = setTimeout(() => {
                        if (!isComplete) {
                            console.warn(`[Streaming] Retry grace period expired for ${requestId}, killing subprocess`);
                            retry.kill();
                            cleanup();
                            resolve();
                        }
                    }, DISCONNECT_GRACE_MS);
                    const origCleanup2 = cleanup;
                    cleanup = () => { clearTimeout(retryDisconnectTimeout); origCleanup2(); };
                }
            });

            // If resume failed, retry WITHOUT resume (fresh session)
            const retryOpts = { ...startOpts };
            if (retryOpts.isResume) {
                console.warn(`[Streaming] Dropping --resume for retry (session may be corrupted)`);
                retryOpts.isResume = false;
                // Invalidate the session so future requests get a fresh one
                sessionManager.delete(cliInput._conversationId);
            }

            await new Promise(r => setTimeout(r, 1000)); // Brief backoff
            retry.start(cliInput.prompt, retryOpts).catch((retryErr) => {
                cleanup();
                console.error("[Streaming] Retry start also failed:", retryErr);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ error: { message: retryErr.message, type: "server_error", code: null } })}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                resolve();
            });
        });
    });
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(res, cliInput, requestId) {
    const timeout = getModelTimeout(cliInput.model);

    return new Promise((resolve) => {
        const subprocess = new ClaudeSubprocess();
        let finalResult = null;
        let isComplete = false;

        const timeoutId = setTimeout(() => {
            if (!isComplete) {
                console.error(`[NonStreaming] Request ${requestId} timed out after ${timeout}ms`);
                subprocess.kill();
                if (!res.headersSent) {
                    res.status(504).json({
                        error: {
                            message: `Request timed out after ${timeout / 1000}s`,
                            type: "timeout_error",
                            code: null,
                        },
                    });
                }
                resolve();
            }
        }, timeout);

        const cleanup = () => {
            clearTimeout(timeoutId);
        };

        subprocess.on("result", (result) => {
            finalResult = result;
        });

        subprocess.on("error", (error) => {
            isComplete = true;
            cleanup();
            console.error("[NonStreaming] Error:", error.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: {
                        message: error.message,
                        type: "server_error",
                        code: null,
                    },
                });
            }
            resolve();
        });

        subprocess.on("close", (code) => {
            isComplete = true;
            cleanup();
            if (finalResult) {
                // Store and record
                try {
                    if (finalResult.result && cliInput._conversationId) {
                        conversationStore.addMessage(cliInput._conversationId, "assistant", finalResult.result);
                    }
                    conversationStore.recordMetric("request_complete", {
                        conversationId: cliInput._conversationId,
                        durationMs: Date.now() - (cliInput._startTime || Date.now()),
                        success: true,
                    });
                } catch (e) { console.error("[Routes] Store error:", e); }

                if (!res.headersSent) {
                    res.json(cliResultToOpenai(finalResult, requestId));
                }
            } else if (!res.headersSent) {
                res.status(500).json({
                    error: {
                        message: `Claude CLI exited with code ${code} without response`,
                        type: "server_error",
                        code: null,
                    },
                });
            }
            resolve();
        });

        // Start subprocess
        subprocess.start(cliInput.prompt, {
            model: cliInput.model,
            sessionId: cliInput.sessionId,
            systemPrompt: cliInput.systemPrompt,
            isResume: cliInput.isResume,
            timeout: timeout,
        }).catch((error) => {
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({
                    error: {
                        message: error.message,
                        type: "server_error",
                        code: null,
                    },
                });
            }
            resolve();
        });
    });
}

/**
 * Handle GET /v1/models — derived from central model registry
 */
export function handleModels(_req, res) {
    res.json({
        object: "list",
        data: getModelList(),
    });
}

/**
 * Handle GET /health
 */
export function handleHealth(_req, res) {
    let metrics = null;
    let storeStats = null;
    let poolStatus = null;
    let recentErrors = [];
    try {
        metrics = conversationStore.getHealthMetrics(60);
        storeStats = conversationStore.getStats();
        recentErrors = conversationStore.getRecentErrors(5);
    } catch (e) { /* store not initialized yet */ }
    try {
        poolStatus = subprocessPool.getStatus();
    } catch (e) { /* pool not ready */ }

    // Include queue status in health
    const queueStatus = {};
    for (const [convId, entry] of conversationQueues) {
        if (entry.queue.length > 0 || entry.processing) {
            queueStatus[convId] = {
                queued: entry.queue.length,
                processing: entry.processing,
            };
        }
    }

    res.json({
        status: "ok",
        provider: "claude-code-cli",
        timestamp: new Date().toISOString(),
        sessions: {
            active: sessionManager.size,
        },
        pool: poolStatus,
        store: storeStats,
        metrics,
        recentErrors,
        queues: Object.keys(queueStatus).length > 0 ? queueStatus : undefined,
    });
}
