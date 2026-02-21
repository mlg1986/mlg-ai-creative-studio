import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { NotFoundError, ValidationError } from '../types/errors.js';

export function createPromptTagsRouter(db: Database.Database) {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    const tags = db.prepare(`
      SELECT id, category_id, label, prompt, order_index, is_builtin
      FROM prompt_tags
      ORDER BY category_id ASC, order_index ASC
    `).all();
    res.json(tags);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    if (!req.body.label?.trim()) throw new ValidationError('Label ist erforderlich');
    if (!req.body.prompt?.trim()) throw new ValidationError('Prompt ist erforderlich');
    if (!req.body.category_id?.trim()) throw new ValidationError('Kategorie ist erforderlich');

    const id = uuid();
    const orderIndex = typeof req.body.order_index === 'number' ? req.body.order_index : 0;
    db.prepare(`
      INSERT INTO prompt_tags (id, category_id, label, prompt, order_index, is_builtin)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, req.body.category_id.trim(), req.body.label.trim(), req.body.prompt.trim(), orderIndex);

    const tag = db.prepare('SELECT id, category_id, label, prompt, order_index, is_builtin FROM prompt_tags WHERE id = ?').get(id);
    res.status(201).json(tag);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM prompt_tags WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('prompt_tag', req.params.id);
    if (existing.is_builtin) throw new ValidationError('Built-in Szene-Elemente können nicht bearbeitet werden. Nutzen Sie „Als eigenes Element speichern“.');

    const label = req.body.label?.trim() ?? existing.label;
    const prompt = req.body.prompt?.trim() ?? existing.prompt;
    const categoryId = req.body.category_id?.trim() ?? existing.category_id;
    const orderIndex = typeof req.body.order_index === 'number' ? req.body.order_index : existing.order_index;

    if (!label) throw new ValidationError('Label ist erforderlich');
    if (!prompt) throw new ValidationError('Prompt ist erforderlich');

    db.prepare(`
      UPDATE prompt_tags SET label=?, prompt=?, category_id=?, order_index=? WHERE id=?
    `).run(label, prompt, categoryId, orderIndex, req.params.id);

    const tag = db.prepare('SELECT id, category_id, label, prompt, order_index, is_builtin FROM prompt_tags WHERE id = ?').get(req.params.id);
    res.json(tag);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM prompt_tags WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('prompt_tag', req.params.id);
    if (existing.is_builtin) throw new ValidationError('Built-in Szene-Elemente können nicht gelöscht werden');

    db.prepare('DELETE FROM prompt_tags WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  }));

  return router;
}
