import { Request, Response, NextFunction } from 'express';
import { execSync } from 'child_process';

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log da requisição
  const auditLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'REDACTED' : 'none'
    },
    ip: req.ip
  };

  // Capturar resposta
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    const logEntry = {
      ...auditLog,
      statusCode: res.statusCode,
      duration: duration + 'ms',
      size: JSON.stringify(data).length + ' bytes'
    };

    // Log to console
    console.log('[AUDIT]', JSON.stringify(logEntry));
    
    // Log to file (async)
    setImmediate(() => {
      const logFile = '/root/memory/api-audit-' + new Date().toISOString().split('T')[0] + '.log';
      try {
        execSync(`echo '${JSON.stringify(logEntry).replace(/'/g, "'\\''")}' >> ${logFile}`);
      } catch (err) {
        console.error('Failed to write audit log:', err);
      }
    });

    return originalJson.call(this, data);
  };

  next();
}
