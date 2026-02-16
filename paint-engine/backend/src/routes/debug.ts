import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';

const LOG_FILE = path.join(process.cwd(), '..', 'logs', 'paint-engine.log');

export function createDebugRouter(db: Database.Database) {
  const router = Router();

  router.get('/status', asyncHandler(async (_req, res) => {
    const stats = {
      materials: (db.prepare('SELECT COUNT(*) as count FROM materials').get() as any).count,
      scenes: (db.prepare('SELECT COUNT(*) as count FROM scenes').get() as any).count,
      activeJobs: db.prepare("SELECT * FROM render_jobs WHERE status IN ('pending','processing')").all(),
      lastErrors: db.prepare("SELECT * FROM render_jobs WHERE status = 'failed' ORDER BY completed_at DESC LIMIT 5").all(),
      provider: {
        image: (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini',
        video: (db.prepare("SELECT value FROM settings WHERE key = 'video_provider'").get() as any)?.value || 'veo',
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
    res.json(stats);
  }));

  router.get('/logs', asyncHandler(async (req, res) => {
    const lines = parseInt(req.query.lines as string) || 50;
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
      const logLines = logContent.trim().split('\n').slice(-lines).map(l => {
        try { return JSON.parse(l); } catch { return { raw: l }; }
      });
      res.json(logLines);
    } catch {
      res.json([]);
    }
  }));

  router.get('/prompt/:sceneId', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT enriched_prompt FROM scenes WHERE id = ?').get(req.params.sceneId) as any;
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    res.json({ enrichedPrompt: scene.enriched_prompt });
  }));

  router.get('/health', asyncHandler(async (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database unavailable' });
    }
  }));

  return router;
}
