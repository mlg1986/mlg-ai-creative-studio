import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../types/errors.js';
import { logger } from '../services/logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    logger.error('http', `${req.method} ${req.path} → ${err.statusCode} ${err.code}`, {
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof (multer as any).MulterError) {
    const code = 'FILE_ERROR';
    const message = (err as any).code === 'LIMIT_FILE_SIZE'
      ? 'Datei zu groß (max. 50 MB).'
      : (err as any).code === 'LIMIT_FILE_COUNT'
        ? 'Zu viele Dateien.'
        : `Upload-Fehler: ${(err as any).code}`;
    logger.error('http', `${req.method} ${req.path} → 413 ${code}`, { message });
    return res.status(413).json({ error: { code, message } });
  }

  logger.error('http', `${req.method} ${req.path} → 500 INTERNAL_ERROR`, {
    error: err.message,
    stack: err.stack,
  });
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}
