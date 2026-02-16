import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateMaterial } from '../middleware/validate.js';
import { NotFoundError } from '../types/errors.js';
import { logger } from '../services/logger.js';

const uploadsDir = path.join(process.cwd(), '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

export function createMaterialsRouter(db: Database.Database) {
  const router = Router();

  // GET all materials with images
  router.get('/', asyncHandler(async (_req, res) => {
    const materials = db.prepare('SELECT * FROM materials ORDER BY created_at DESC').all();
    const images = db.prepare('SELECT * FROM material_images').all() as any[];

    const materialsWithImages = (materials as any[]).map(m => ({
      ...m,
      images: images.filter(img => img.material_id === m.id),
    }));

    res.json(materialsWithImages);
  }));

  // GET single material
  router.get('/:id', asyncHandler(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id) as any;
    if (!material) throw new NotFoundError('material', req.params.id);

    const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(req.params.id);
    res.json({ ...material, images });
  }));

  // POST create material with images
  router.post('/', upload.array('images', 14), asyncHandler(async (req, res) => {
    validateMaterial(req.body);

    const id = uuid();
    const perspectives = req.body.images_perspectives
      ? (typeof req.body.images_perspectives === 'string'
        ? JSON.parse(req.body.images_perspectives)
        : req.body.images_perspectives)
      : [];

    db.prepare(`
      INSERT INTO materials (id, name, category, description, material_type, dimensions, surface, weight, color, format_code, size, frame_option)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.body.name, req.body.category, req.body.description || null,
      req.body.material_type || null, req.body.dimensions || null,
      req.body.surface || null, req.body.weight || null, req.body.color || null,
      req.body.format_code || null, req.body.size || null, req.body.frame_option || null
    );

    const files = (req.files as Express.Multer.File[]) || [];
    const insertImage = db.prepare(`
      INSERT INTO material_images (id, material_id, image_path, perspective, is_primary)
      VALUES (?, ?, ?, ?, ?)
    `);

    files.forEach((file, i) => {
      const imgId = uuid();
      const perspective = perspectives[i] || 'front';
      const relativePath = `/uploads/${file.filename}`;
      insertImage.run(imgId, id, relativePath, perspective, i === 0 ? 1 : 0);
    });

    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
    const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(id);

    logger.info('materials', `Created material: ${req.body.name}`, { id, imageCount: files.length });
    res.status(201).json({ ...material, images });
  }));

  // PUT update material
  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('material', req.params.id);

    db.prepare(`
      UPDATE materials SET name=?, category=?, description=?, material_type=?, dimensions=?,
      surface=?, weight=?, color=?, format_code=?, size=?, frame_option=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      req.body.name, req.body.category, req.body.description || null,
      req.body.material_type || null, req.body.dimensions || null,
      req.body.surface || null, req.body.weight || null, req.body.color || null,
      req.body.format_code || null, req.body.size || null, req.body.frame_option || null,
      req.params.id
    );

    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(req.params.id);
    res.json({ ...material, images });
  }));

  // DELETE material
  router.delete('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('material', req.params.id);

    // Delete image files
    const images = db.prepare('SELECT image_path FROM material_images WHERE material_id = ?').all(req.params.id) as any[];
    for (const img of images) {
      const fullPath = path.join(process.cwd(), '..', 'public', img.image_path);
      try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    }

    db.prepare('DELETE FROM material_images WHERE material_id = ?').run(req.params.id);
    db.prepare('DELETE FROM scene_materials WHERE material_id = ?').run(req.params.id);
    db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);

    logger.info('materials', `Deleted material: ${existing.name}`, { id: req.params.id });
    res.json({ success: true });
  }));

  // PUT toggle status
  router.put('/:id/status', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new NotFoundError('material', req.params.id);

    const newStatus = existing.status === 'engaged' ? 'idle' : 'engaged';
    db.prepare('UPDATE materials SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, req.params.id);

    res.json({ id: req.params.id, status: newStatus });
  }));

  // POST add images to material
  router.post('/:id/images', upload.array('images', 14), asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('material', req.params.id);

    const perspectives = req.body.perspectives
      ? (typeof req.body.perspectives === 'string' ? JSON.parse(req.body.perspectives) : req.body.perspectives)
      : [];

    const files = (req.files as Express.Multer.File[]) || [];
    const insertImage = db.prepare(`
      INSERT INTO material_images (id, material_id, image_path, perspective, is_primary)
      VALUES (?, ?, ?, ?, 0)
    `);

    files.forEach((file, i) => {
      const imgId = uuid();
      const perspective = perspectives[i] || 'front';
      insertImage.run(imgId, req.params.id, `/uploads/${file.filename}`, perspective);
    });

    const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(req.params.id);
    res.json(images);
  }));

  // DELETE image
  router.delete('/:id/images/:imageId', asyncHandler(async (req, res) => {
    const img = db.prepare('SELECT * FROM material_images WHERE id = ? AND material_id = ?')
      .get(req.params.imageId, req.params.id) as any;
    if (!img) throw new NotFoundError('image', req.params.imageId);

    const fullPath = path.join(process.cwd(), '..', 'public', img.image_path);
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }

    db.prepare('DELETE FROM material_images WHERE id = ?').run(req.params.imageId);
    res.json({ success: true });
  }));

  return router;
}
