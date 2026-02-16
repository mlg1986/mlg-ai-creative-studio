import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http', `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, {
      query: Object.keys(req.query).length ? req.query : undefined,
      body: req.method !== 'GET' ? summarizeBody(req.body) : undefined,
    });
  });
  next();
}

function summarizeBody(body: any): any {
  if (!body) return undefined;
  const summary = { ...body };
  for (const key of Object.keys(summary)) {
    if (typeof summary[key] === 'string' && summary[key].length > 500) {
      summary[key] = `[${summary[key].length} chars truncated]`;
    }
  }
  return summary;
}
