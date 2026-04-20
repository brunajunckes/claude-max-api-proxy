/**
 * Health Check & Readiness Endpoints
 */

import type { Request, Response } from 'express';
import { observabilityManager } from '../monitoring/observability.js';

export interface HealthCheckStatus {
  status: 'up' | 'degraded' | 'down';
  timestamp: Date;
  uptime_seconds: number;
  version: string;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  timestamp: Date;
  duration_ms: number;
  details?: Record<string, unknown>;
}

const startTime = Date.now();
const startupState = {
  config_loaded: false,
  models_verified: false,
  cache_initialized: false,
  database_connected: false,
};

export function markStartupComponent(component: keyof typeof startupState, loaded: boolean) {
  startupState[component] = loaded;
}

export function isStartupComplete(): boolean {
  return Object.values(startupState).every(v => v === true);
}

/**
 * Main health check handler (alias for readiness)
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  return handleHealthReadiness(req, res);
}

export async function handleHealthLiveness(req: Request, res: Response): Promise<void> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const status: HealthCheckStatus = {
    status: 'up',
    timestamp: new Date(),
    uptime_seconds: uptime,
    version: process.env.npm_package_version || '1.0.0',
  };
  res.status(200).json(status);
}

export async function handleHealthReadiness(req: Request, res: Response): Promise<void> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const snapshot = observabilityManager.getSnapshot();
  const errorRate = snapshot.requests.total > 0
    ? (snapshot.requests.errors / snapshot.requests.total)
    : 0;

  const isReady = startupState.config_loaded && errorRate < 0.1;
  const status: HealthCheckStatus = {
    status: isReady ? 'up' : 'degraded',
    timestamp: new Date(),
    uptime_seconds: uptime,
    version: process.env.npm_package_version || '1.0.0',
  };

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json(status);
}

export async function handleHealthFull(req: Request, res: Response): Promise<void> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const startupDuration = Date.now() - startTime;
  const snapshot = observabilityManager.getSnapshot();

  const checks: HealthCheckResult[] = [
    {
      name: 'config',
      status: startupState.config_loaded ? 'pass' : 'fail',
      timestamp: new Date(),
      duration_ms: 1,
    },
    {
      name: 'memory',
      status: snapshot.memory.heap_used_mb < snapshot.memory.heap_total_mb * 0.9 ? 'pass' : 'warn',
      timestamp: new Date(),
      duration_ms: 1,
      details: {
        heap_used_mb: snapshot.memory.heap_used_mb,
        heap_total_mb: snapshot.memory.heap_total_mb,
      },
    },
    {
      name: 'cpu',
      status: snapshot.cpu.percent < 80 ? 'pass' : 'warn',
      timestamp: new Date(),
      duration_ms: 1,
      details: { percent: snapshot.cpu.percent },
    },
  ];

  const errorRate = snapshot.requests.total > 0
    ? (snapshot.requests.errors / snapshot.requests.total)
    : 0;

  checks.push({
    name: 'error-rate',
    status: errorRate < 0.05 ? 'pass' : errorRate < 0.1 ? 'warn' : 'fail',
    timestamp: new Date(),
    duration_ms: 1,
    details: {
      errors: snapshot.requests.errors,
      total: snapshot.requests.total,
    },
  });

  const anyFail = checks.some(c => c.status === 'fail');
  const status = {
    status: anyFail ? 'down' : 'up',
    timestamp: new Date(),
    uptime_seconds: uptime,
    startup_duration_ms: startupDuration,
    version: process.env.npm_package_version || '1.0.0',
    metrics: {
      requests: {
        total: snapshot.requests.total,
        active: snapshot.requests.active,
        errors: snapshot.requests.errors,
        error_rate: Math.round(errorRate * 10000) / 100,
      },
      latency: {
        p50_ms: snapshot.latency.p50,
        p95_ms: snapshot.latency.p95,
        p99_ms: snapshot.latency.p99,
      },
      resources: {
        memory_heap_mb: snapshot.memory.heap_used_mb,
        cpu_percent: snapshot.cpu.percent,
      },
    },
    checks,
  };

  const statusCode = anyFail ? 503 : 200;
  res.status(statusCode).json(status);
}
