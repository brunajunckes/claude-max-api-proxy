import { Request, Response, NextFunction } from 'express';

export class APIError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err instanceof APIError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';
  const retryable = err instanceof APIError ? err.retryable : false;

  console.error('[ERROR]', {
    path: req.path,
    method: req.method,
    statusCode,
    message,
    timestamp: new Date().toISOString()
  });

  res.status(statusCode).json({
    error: message,
    statusCode,
    timestamp: new Date().toISOString(),
    retryable,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err instanceof Error ? err.stack : undefined 
    })
  });
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
