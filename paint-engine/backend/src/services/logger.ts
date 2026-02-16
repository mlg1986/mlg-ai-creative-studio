import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_FILE = path.join(process.cwd(), '..', 'logs', 'paint-engine.log');
const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: LogLevel, context: string, message: string, data?: any) {
  if (LEVELS[level] < LEVELS[LOG_LEVEL]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(data && { data }),
  };

  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m'
  };
  console.log(
    `${colors[level]}[${level.toUpperCase()}]\x1b[0m [${context}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ''
  );

  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Silently fail file logging
  }
}

export const logger = {
  debug: (ctx: string, msg: string, data?: any) => log('debug', ctx, msg, data),
  info: (ctx: string, msg: string, data?: any) => log('info', ctx, msg, data),
  warn: (ctx: string, msg: string, data?: any) => log('warn', ctx, msg, data),
  error: (ctx: string, msg: string, data?: any) => log('error', ctx, msg, data),
};
