import { Request, Response } from 'express';

export async function healthCheck(req: Request, res: Response) {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        claude_api: { status: 'ok', version: '1.0.1' },
        ollama: await checkOllama(),
        hermes: await checkHermes(),
        process: {
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          cpu: process.cpuUsage()
        }
      }
    };
    
    res.status(200).json(health);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'error',
      error: message
    });
  }
}

async function checkOllama() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return { status: res.ok ? 'up' : 'down', port: 11434 };
  } catch {
    return { status: 'down', port: 11434 };
  }
}

async function checkHermes() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('http://localhost:9999/health', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return { status: res.ok ? 'up' : 'down', port: 9999 };
  } catch {
    return { status: 'down', port: 9999 };
  }
}
