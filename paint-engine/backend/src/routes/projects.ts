import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import { logger } from '../services/logger.js';

export function createProjectsRouter(db: Database.Database) {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    const result = (projects as any[]).map(p => {
      const sceneCount = (db.prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ?').get(p.id) as any).count;
      return { ...p, sceneCount };
    });
    res.json(result);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    if (!req.body.name?.trim()) throw new ValidationError('Projektname ist erforderlich');
    const id = uuid();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, req.body.name);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json(project);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('project', req.params.id);
    db.prepare('UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(req.body.name, req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(project);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('project', req.params.id);

    // Delete scenes and related data
    const scenes = db.prepare('SELECT id FROM scenes WHERE project_id = ?').all(req.params.id) as any[];
    for (const scene of scenes) {
      db.prepare('DELETE FROM scene_materials WHERE scene_id = ?').run(scene.id);
      db.prepare('DELETE FROM render_jobs WHERE scene_id = ?').run(scene.id);
    }
    db.prepare('DELETE FROM scenes WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

    logger.info('projects', `Deleted project ${req.params.id}`);
    res.json({ success: true });
  }));

  // POST archive (ZIP export)
  router.post('/:id/archive', asyncHandler(async (req, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) throw new NotFoundError('project', req.params.id);

    const scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ?').all(req.params.id) as any[];
    const materials = db.prepare(`
      SELECT DISTINCT m.* FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      JOIN scenes s ON s.id = sm.scene_id
      WHERE s.project_id = ?
    `).all(req.params.id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_archive.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Add project data as JSON
    archive.append(JSON.stringify({ project, scenes, materials }, null, 2), { name: 'project.json' });

    // Add rendered images/videos
    for (const scene of scenes) {
      if (scene.image_path) {
        const imgPath = path.join(process.cwd(), '..', 'public', scene.image_path);
        if (fs.existsSync(imgPath)) {
          archive.file(imgPath, { name: `renders/${path.basename(scene.image_path)}` });
        }
      }
      if (scene.video_path) {
        const vidPath = path.join(process.cwd(), '..', 'public', scene.video_path);
        if (fs.existsSync(vidPath)) {
          archive.file(vidPath, { name: `renders/${path.basename(scene.video_path)}` });
        }
      }
    }

    await archive.finalize();
  }));

  return router;
}
