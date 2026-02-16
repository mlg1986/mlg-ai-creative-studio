import { Router } from 'express';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { logger } from '../services/logger.js';

export function createSettingsRouter(db: Database.Database) {
  const router = Router();

  router.get('/api-key', asyncHandler(async (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any;
    const envKey = process.env.GEMINI_API_KEY;
    res.json({
      hasApiKey: !!(row?.value || (envKey && envKey !== 'your-api-key-here')),
      source: row?.value ? 'database' : envKey ? 'environment' : 'none',
    });
  }));

  router.put('/api-key', asyncHandler(async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      db.prepare("DELETE FROM settings WHERE key = 'gemini_api_key'").run();
      logger.info('settings', 'API key removed');
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?)").run(apiKey.trim());
      logger.info('settings', 'API key updated');
    }
    res.json({ success: true });
  }));

  router.get('/providers', asyncHandler(async (_req, res) => {
    const imageProvider = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const videoProvider = (db.prepare("SELECT value FROM settings WHERE key = 'video_provider'").get() as any)?.value || 'veo';
    res.json({ imageProvider, videoProvider });
  }));

  return router;
}
