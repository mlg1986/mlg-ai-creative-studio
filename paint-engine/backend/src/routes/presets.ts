import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import { logger } from '../services/logger.js';

export function createPresetsRouter(db: Database.Database) {
  const router = Router();

  // GET all presets
  router.get('/', asyncHandler(async (_req, res) => {
    const presets = db.prepare('SELECT * FROM export_presets ORDER BY is_builtin DESC, name ASC').all();
    res.json(presets);
  }));

  // POST create custom preset
  router.post('/', asyncHandler(async (req, res) => {
    const { name, width, height } = req.body;
    if (!name || !width || !height) {
      throw new ValidationError('Name, Breite und Höhe sind erforderlich.');
    }
    if (width < 100 || height < 100 || width > 4096 || height > 4096) {
      throw new ValidationError('Breite und Höhe müssen zwischen 100 und 4096 px liegen.');
    }

    const id = uuid();
    db.prepare('INSERT INTO export_presets (id, name, width, height, is_builtin) VALUES (?, ?, ?, ?, 0)')
      .run(id, name, Math.round(width), Math.round(height));

    const preset = db.prepare('SELECT * FROM export_presets WHERE id = ?').get(id);
    logger.info('presets', `Created custom preset: ${name} (${width}x${height})`);
    res.status(201).json(preset);
  }));

  // DELETE custom preset (only non-builtin)
  router.delete('/:id', asyncHandler(async (req, res) => {
    const preset = db.prepare('SELECT * FROM export_presets WHERE id = ?').get(req.params.id) as any;
    if (!preset) throw new NotFoundError('preset', req.params.id);
    if (preset.is_builtin) {
      throw new ValidationError('Built-in Presets können nicht gelöscht werden.');
    }

    db.prepare('DELETE FROM export_presets WHERE id = ?').run(req.params.id);
    logger.info('presets', `Deleted preset: ${preset.name}`);
    res.json({ success: true });
  }));

  return router;
}
