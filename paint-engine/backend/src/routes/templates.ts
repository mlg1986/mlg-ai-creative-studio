import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { NotFoundError, ValidationError } from '../types/errors.js';

export function createTemplatesRouter(db: Database.Database) {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    const templates = db.prepare('SELECT * FROM scene_templates ORDER BY is_builtin DESC, created_at ASC').all();
    res.json(templates);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    if (!req.body.name?.trim()) throw new ValidationError('Name ist erforderlich');
    if (!req.body.prompt_template?.trim()) throw new ValidationError('Prompt-Template ist erforderlich');

    const id = uuid();
    db.prepare(`
      INSERT INTO scene_templates (id, name, icon, description, prompt_template, typical_use, is_builtin)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, req.body.name, req.body.icon || '📷', req.body.description || '', req.body.prompt_template, req.body.typical_use || '');

    const template = db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(id);
    res.status(201).json(template);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('template', req.params.id);

    db.prepare(`
      UPDATE scene_templates SET name=?, icon=?, description=?, prompt_template=?, typical_use=? WHERE id=?
    `).run(req.body.name, req.body.icon, req.body.description, req.body.prompt_template, req.body.typical_use, req.params.id);

    const template = db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(req.params.id);
    res.json(template);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('template', req.params.id);
    if (existing.is_builtin) throw new ValidationError('Built-in Templates können nicht gelöscht werden');

    db.prepare('DELETE FROM scene_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  }));

  return router;
}
