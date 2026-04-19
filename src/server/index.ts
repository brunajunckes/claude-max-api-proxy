/**
 * Express HTTP Server
 *
 * Provides OpenAI-compatible API endpoints that wrap Claude Code CLI
 */
import express from "express";
import { createServer, type Server } from "http";
import type { Socket } from "net";
import { performance } from "perf_hooks";
import {
  handleChatCompletions,
  handleModels,
  handleHealth,
  handleGetThinkingBudget,
  handleSetThinkingBudget,
} from "./routes.js";
import { runtimeConfig } from "../config.js";
import { auditMiddleware } from "./audit-middleware.js";
import { errorHandler } from "./error-handler.js";
import { healthCheck } from "./health-check.js";
import { observabilityManager } from "../monitoring/observability.js";
import { tracingManager } from "../monitoring/tracing.js";
import { cacheMiddleware } from "./cache-middleware.js";
import { createRateLimiter } from "./rate-limit.js";
import { securityHeadersMiddleware } from "./security-headers.js";
import { inputValidationMiddleware } from "./input-validation.js";
import "../subprocess/pool.js";
import "../store/conversation.js";

export interface ServerConfig {
  port: number;
  host?: string;
}

let serverInstance: Server | null = null;

function createApp(): express.Application {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  // Security headers middleware (high priority)
  app.use(securityHeadersMiddleware);

  // Input validation middleware
  app.use(inputValidationMiddleware);

  // Tracing middleware
  app.use((req, _res, next) => {
    const traceContext = tracingManager.extractTraceContext(req.headers);
    (req as any).traceContext = traceContext;
    next();
  });

  // Observability middleware
  app.use((req, res, next) => {
    const startTime = performance.now();
    observabilityManager.recordActiveRequest(1);

    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = performance.now() - startTime;
      const isError = res.statusCode >= 400;

      observabilityManager.recordRequest(duration, isError);
      observabilityManager.recordActiveRequest(-1);

      return originalSend.call(this, data);
    };

    next();
  });

  // Audit middleware
  app.use(auditMiddleware);

  // Rate limiting middleware
  const rateLimiter = createRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 min default
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    perConversation: process.env.RATE_LIMIT_PER_CONVERSATION !== 'false',
  });
  app.use(rateLimiter.middleware());

  app.use((req, _res, next) => {
    if (process.env.DEBUG) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Thinking-Budget",
    );
    // CORS headers respect security headers set above
    next();
  });

  app.options("*", (_req, res) => {
    res.sendStatus(200);
  });

  // Enhanced health check
  app.get("/health", healthCheck);
  app.get("/v1/models", cacheMiddleware("models-v1", 300000), handleModels);
  app.post("/v1/chat/completions", handleChatCompletions);

  // Metrics endpoint
  app.get("/metrics", (_req, res) => {
    const snapshot = observabilityManager.getSnapshot();
    res.json({
      timestamp: snapshot.timestamp,
      memory: snapshot.memory,
      cpu: snapshot.cpu,
      requests: snapshot.requests,
      latency: snapshot.latency
    });
  });

  if (runtimeConfig.enableAdminApi) {
    app.get("/admin/thinking-budget", handleGetThinkingBudget);
    app.post("/admin/thinking-budget", handleSetThinkingBudget);
    app.put("/admin/thinking-budget", handleSetThinkingBudget);
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        message: "Not found",
        type: "invalid_request_error",
        code: "not_found",
      },
    });
  });

  // Enhanced error handler
  app.use(errorHandler);

  return app;
}

export async function startServer(config: ServerConfig): Promise<Server> {
  const { port, host = "127.0.0.1" } = config;
  if (serverInstance) {
    console.log("[Server] Already running, returning existing instance");
    return serverInstance;
  }
  const app = createApp();
  return new Promise<Server>((resolve, reject) => {
    serverInstance = createServer(app);

    serverInstance.on("connection", (socket: Socket) => {
      socket.setNoDelay(true);
    });

    serverInstance.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });

    serverInstance.listen(port, host, () => {
      console.log(
        `[Server] Claude Code CLI provider running at http://${host}:${port}`,
      );
      console.log(
        `[Server] OpenAI-compatible endpoint: http://${host}:${port}/v1/chat/completions`,
      );
      resolve(serverInstance!);
    });
  });
}

export async function stopServer(): Promise<void> {
  if (!serverInstance) return;
  return new Promise<void>((resolve, reject) => {
    serverInstance!.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log("[Server] Stopped");
        serverInstance = null;
        resolve();
      }
    });
  });
}

export function getServer(): Server | null {
  return serverInstance;
}
