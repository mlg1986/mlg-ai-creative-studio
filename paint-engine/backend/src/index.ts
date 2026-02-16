import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { logger } from './services/logger.js';
import { initDatabase } from './db/schema.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createMaterialsRouter } from './routes/materials.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createScenesRouter, cleanupStaleScenes } from './routes/scenes.js';
import { createVideoRouter } from './routes/video.js';
import { createProjectsRouter } from './routes/projects.js';
import { createSettingsRouter } from './routes/settings.js';
import { createDebugRouter } from './routes/debug.js';
import { createPresetsRouter } from './routes/presets.js';

// Load .env from project root
config({ path: path.join(process.cwd(), '..', '.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'] }));
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);

// Static files
const publicDir = path.join(process.cwd(), '..', 'public');
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));
app.use('/renders', express.static(path.join(publicDir, 'renders')));

// Ensure directories
['uploads', 'renders'].forEach(dir => {
  fs.mkdirSync(path.join(publicDir, dir), { recursive: true });
});
fs.mkdirSync(path.join(process.cwd(), '..', 'logs'), { recursive: true });

// Database
const dbPath = path.join(process.cwd(), '..', 'studio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Init schema + seeds
initDatabase(db);
cleanupStaleScenes(db);

// Routes
app.use('/api/materials', createMaterialsRouter(db));
app.use('/api/templates', createTemplatesRouter(db));
app.use('/api/scenes', createScenesRouter(db));
app.use('/api/scenes', createVideoRouter(db));
app.use('/api/projects', createProjectsRouter(db));
app.use('/api/settings', createSettingsRouter(db));
app.use('/api/presets', createPresetsRouter(db));

// Debug routes (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/debug', createDebugRouter(db));
}

// Health check
app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Error handler (must be last)
app.use(errorHandler);

// Start
const server = app.listen(PORT, () => {
  logger.info('startup', `Paint Engine Backend running on http://localhost:${PORT}`);

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    logger.warn('startup', 'GEMINI_API_KEY not set! AI features will not work. Set it in .env or via Settings.');
  }
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('startup', `Port ${PORT} is already in use. Use a different port or kill the process.`);
    process.exit(1);
  }
});

export default app;
