import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateSceneCreate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import { logger } from '../services/logger.js';
import { getImageProvider } from '../services/providerFactory.js';
import { verificationService } from '../services/verificationService.js';
import { patternMemory } from '../services/patternMemory.js';
import {
  buildSceneMaterialContext,
  buildMaterialRestrictionPrompt,
  buildMaterialContext,
  SCENE_INTELLIGENCE_SYSTEM_PROMPT,
  FEEDBACK_ADDENDUM_SYSTEM_PROMPT,
  buildImageGenerationPrompt,
  EXPORT_PRESET_TO_ASPECT_RATIO,
  widthHeightToAspectRatio,
  TAG_PROMPTS,
} from '../services/promptBuilder.js';

/** Gemini 3 Pro Image: max 14 reference images per request (see ai.google.dev/gemini-api/docs/image-generation). */
const MAX_REFERENCE_IMAGES = 14;
/** Max motif files accepted in one upload request; total used = remaining slots after material refs + blueprint. */
const MAX_MOTIF_UPLOAD = 14;

function getMotifPathsFromScene(scene: any): string[] {
  if (scene.motif_image_paths) {
    try {
      const arr = JSON.parse(scene.motif_image_paths);
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch { return []; }
  }
  return scene.motif_image_path ? [scene.motif_image_path] : [];
}

function getExtraRefPathsFromScene(scene: any): string[] {
  if (scene.extra_reference_paths) {
    try {
      const arr = JSON.parse(scene.extra_reference_paths);
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch { return []; }
  }
  return [];
}

/** Read image dimensions from file so refinement keeps exact aspect ratio (e.g. 16:9 not 9:16). */
function getImageDimensionsFromFile(filePath: string): { width: number; height: number } | null {
  try {
    const buf = fs.readFileSync(filePath, { start: 0, end: 65536 });
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png' || (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e)) {
      if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return width > 0 && height > 0 ? { width, height } : null;
      }
    }
    if (ext === '.jpg' || ext === '.jpeg' || (buf[0] === 0xff && buf[1] === 0xd8)) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          return width > 0 && height > 0 ? { width, height } : null;
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

const rendersDir = path.join(process.cwd(), '..', 'public', 'renders');
const uploadsDir = path.join(process.cwd(), '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `motif-${uuid()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const extraRefStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `extra-${uuid()}${ext}`);
  },
});
const uploadExtraRef = multer({ storage: extraRefStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const MAX_EXTRA_REFERENCE_IMAGES = 8;

export function cleanupStaleScenes(db: Database.Database) {
  logger.info('scenes', 'Cleaning up stale generating scenes');

  // Mark scenes stuck in 'generating' for more than 30 minutes as 'failed'
  // Or just reset them all on startup since background tasks won't survive a restart anyway
  const result = db.prepare(`
    UPDATE scenes 
    SET image_status = 'failed' 
    WHERE image_status = 'generating'
  `).run();

  if (result.changes > 0) {
    logger.info('scenes', `Marked ${result.changes} stale scenes as failed`);
  }

  // Also cleanup render_jobs
  db.prepare(`
    UPDATE render_jobs
    SET status = 'failed', error_message = 'Server restarted during processing'
    WHERE status = 'processing'
  `).run();
}

export function createScenesRouter(db: Database.Database) {
  const router = Router();

  // GET scenes for project
  router.get('/', asyncHandler(async (req, res) => {
    const projectId = req.query.projectId as string;
    let scenes;
    if (projectId) {
      scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    } else {
      scenes = db.prepare('SELECT * FROM scenes ORDER BY created_at DESC').all();
    }

    const scenesWithMaterials = (scenes as any[]).map(s => {
      const materials = db.prepare(`
        SELECT m.* FROM materials m
        JOIN scene_materials sm ON sm.material_id = m.id
        WHERE sm.scene_id = ?
      `).all(s.id);
      return { ...s, materials };
    });

    res.json(scenesWithMaterials);
  }));

  // POST upload motif image(s) – single or multiple (max MAX_MOTIF_UPLOAD); returns paths for scene creation
  router.post('/upload-motif', upload.array('motif', MAX_MOTIF_UPLOAD), asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw new ValidationError('Keine Datei hochgeladen.');
    const paths = files.map(f => `/uploads/${f.filename}`);
    logger.info('scenes', `Motif(s) uploaded: ${paths.length} file(s)`);
    res.json({ paths, path: paths[0] });
  }));

  // POST upload extra reference image(s) – persons, objects, etc. for prompt referencing
  router.post('/upload-extra-reference', uploadExtraRef.array('extraRef', MAX_EXTRA_REFERENCE_IMAGES), asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw new ValidationError('Keine Datei hochgeladen.');
    const paths = files.map(f => `/uploads/${f.filename}`);
    logger.info('scenes', `Extra reference image(s) uploaded: ${paths.length} file(s)`);
    res.json({ paths });
  }));

  // GET single scene
  router.get('/:id', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    const materials = db.prepare(`
      SELECT m.* FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      WHERE sm.scene_id = ?
    `).all(scene.id);

    res.json({ ...scene, materials });
  }));

  // PATCH scene (review feedback + full scene edit)
  router.patch('/:id', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    const {
      review_notes,
      review_rating,
      name,
      template_id,
      scene_description,
      prompt_tags,
      format,
      export_preset,
      blueprint_image_path,
      motif_image_path,
      motif_image_paths,
      extra_reference_paths,
      materialIds,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (review_notes !== undefined) {
      updates.push('review_notes = ?');
      values.push(review_notes === '' ? null : review_notes);
    }
    if (review_rating !== undefined) {
      updates.push('review_rating = ?');
      values.push(review_rating == null ? null : Number(review_rating));
    }
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name === '' ? null : name);
    }
    if (template_id !== undefined) {
      updates.push('template_id = ?');
      values.push(template_id === '' ? null : template_id);
    }
    if (scene_description !== undefined) {
      updates.push('scene_description = ?');
      values.push(scene_description === '' ? null : scene_description);
    }
    if (prompt_tags !== undefined) {
      updates.push('prompt_tags = ?');
      values.push(
        Array.isArray(prompt_tags)
          ? (prompt_tags.length ? JSON.stringify(prompt_tags) : null)
          : prompt_tags === '' ? null : prompt_tags
      );
    }
    if (format !== undefined) {
      updates.push('format = ?');
      values.push(format === '' ? null : format);
    }
    if (export_preset !== undefined) {
      updates.push('export_preset = ?');
      values.push(export_preset === '' ? null : export_preset);
    }
    if (blueprint_image_path !== undefined) {
      updates.push('blueprint_image_path = ?');
      values.push(blueprint_image_path === '' ? null : blueprint_image_path);
    }
    if (motif_image_path !== undefined) {
      updates.push('motif_image_path = ?');
      values.push(motif_image_path === '' ? null : motif_image_path);
    }
    if (motif_image_paths !== undefined) {
      updates.push('motif_image_paths = ?');
      values.push(
        Array.isArray(motif_image_paths)
          ? (motif_image_paths.length ? JSON.stringify(motif_image_paths) : null)
          : motif_image_paths === '' ? null : motif_image_paths
      );
    }
    if (extra_reference_paths !== undefined) {
      updates.push('extra_reference_paths = ?');
      values.push(
        Array.isArray(extra_reference_paths)
          ? (extra_reference_paths.length ? JSON.stringify(extra_reference_paths) : null)
          : extra_reference_paths === '' ? null : extra_reference_paths
      );
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);
      db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (Array.isArray(materialIds)) {
      const sceneId = req.params.id;
      db.prepare('DELETE FROM scene_materials WHERE scene_id = ?').run(sceneId);
      const insertStmt = db.prepare('INSERT INTO scene_materials (scene_id, material_id) VALUES (?, ?)');
      for (const mid of materialIds) {
        if (mid) insertStmt.run(sceneId, mid);
      }
    }

    const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    const materials = db.prepare('SELECT m.* FROM materials m JOIN scene_materials sm ON sm.material_id = m.id WHERE sm.scene_id = ?').all(req.params.id);
    res.json({ ...updated, materials });
  }));

  // DELETE scene
  router.delete('/:id', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    const sceneId = req.params.id;
    db.prepare('DELETE FROM render_jobs WHERE scene_id = ?').run(sceneId);
    db.prepare('DELETE FROM scene_materials WHERE scene_id = ?').run(sceneId);
    db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);

    const publicDir = path.join(process.cwd(), '..', 'public');
    for (const file of [`renders/${sceneId}.png`, `renders/${sceneId}_video.mp4`]) {
      const fullPath = path.join(publicDir, file);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (err) {
        logger.warn('scenes', `Could not delete file ${file}: ${(err as Error).message}`);
      }
    }

    res.json({ success: true });
  }));

  // POST prepare refinement (get AI addendum from review_notes + ground truth materials)
  router.post('/:id/prepare-refinement', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);
    if (!scene.review_notes || !scene.review_notes.trim()) {
      throw new ValidationError('Kein Feedback gespeichert. Bitte zuerst Bewertung eintragen und speichern.');
    }
    if (!scene.enriched_prompt) {
      throw new ValidationError('Szene hat keinen Prompt. Verfeinerung nicht möglich.');
    }

    const requestedMaterialIds: string[] | undefined = req.body?.materialIds;
    const hasExtensionImage: boolean = req.body?.hasExtensionImage === true;

    let filteredMaterials: any[];
    if (requestedMaterialIds?.length) {
      const placeholders = requestedMaterialIds.map(() => '?').join(',');
      filteredMaterials = db.prepare(
        `SELECT m.* FROM materials m WHERE m.id IN (${placeholders})`
      ).all(...requestedMaterialIds) as any[];
    } else {
      filteredMaterials = db.prepare(`
        SELECT m.* FROM materials m
        JOIN scene_materials sm ON sm.material_id = m.id
        WHERE sm.scene_id = ? AND m.status = 'engaged'
      `).all(scene.id) as any[];
    }

    const materialContext = buildSceneMaterialContext(filteredMaterials);

    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const provider = getImageProvider(providerName, apiKey);

    let userFeedbackInput = `USER FEEDBACK:\n${scene.review_notes.trim()}\n\nORIGINAL SCENE CONTEXT:\n${scene.enriched_prompt.slice(0, 800)}\n\nMATERIAL CONTEXT (GROUND TRUTH):\n${materialContext}`;

    if (hasExtensionImage) {
      userFeedbackInput += `\n\nEXTENSION IMAGE:\nThe user has uploaded an extension image. This image shows a person, object, or visual that the user wants to INSERT into the scene. The element to be added should match the appearance of this extension image exactly. Do NOT invent any appearance details beyond what the user described and what the extension image shows.`;
    }

    if (filteredMaterials.length > 0) {
      const materialNames = filteredMaterials.map((m: any) => `${m.name} (${m.category})`).join(', ');
      userFeedbackInput += `\n\nMATERIALS TO INCLUDE:\nThe user wants these materials to be visibly present in the scene: ${materialNames}. Include one instruction that these materials must appear in the image and their appearance must match the attached material reference images.`;
    }

    logger.info('scenes', `Preparing refinement instructions for scene ${scene.id} (extensionImage=${hasExtensionImage}, materials=${filteredMaterials.length})`);
    const addendum = await provider.enrichPrompt(FEEDBACK_ADDENDUM_SYSTEM_PROMPT, userFeedbackInput);

    res.json({
      promptAddendum: addendum.trim()
    });
  }));

  // POST regenerate with feedback (AI addendum from review_notes or manual override)
  router.post('/:id/regenerate-with-feedback', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    // Manual override or AI generation
    let addendumTrimmed = req.body?.promptAddendum?.trim();

    if (!addendumTrimmed) {
      if (!scene.review_notes || !scene.review_notes.trim()) {
        throw new ValidationError('Kein Feedback gespeichert. Bitte zuerst Bewertung eintragen und speichern.');
      }
      if (!scene.enriched_prompt) {
        throw new ValidationError('Szene hat keinen Prompt. Regenerierung mit Feedback nicht möglich.');
      }
    }

    const requestedMaterialIds: string[] | undefined = req.body?.materialIds;

    let materials: any[];
    if (requestedMaterialIds?.length) {
      const placeholders = requestedMaterialIds.map(() => '?').join(',');
      materials = db.prepare(
        `SELECT m.*, mi.image_path as img_path, mi.perspective FROM materials m
         LEFT JOIN material_images mi ON mi.material_id = m.id
         WHERE m.id IN (${placeholders})`
      ).all(...requestedMaterialIds) as any[];
    } else {
      materials = db.prepare(`
        SELECT m.*, mi.image_path as img_path, mi.perspective FROM materials m
        JOIN scene_materials sm ON sm.material_id = m.id
        LEFT JOIN material_images mi ON mi.material_id = m.id
        WHERE sm.scene_id = ? AND m.status = 'engaged'
      `).all(scene.id) as any[];
    }

    const materialMap = new Map<string, any>();
    const materialsForContext: any[] = [];

    for (const row of materials) {
      if (!materialMap.has(row.id)) {
        const mat = { ...row, images: [] };
        materialMap.set(row.id, mat);
        materialsForContext.push(row);
      }
      if (row.img_path) {
        materialMap.get(row.id)!.images.push({ image_path: row.img_path, perspective: row.perspective });
      }
    }

    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const provider = getImageProvider(providerName, apiKey);

    // If no addendum provided, generate it using material context
    if (!addendumTrimmed) {
      const materialContext = buildSceneMaterialContext(materialsForContext);
      const userFeedbackInput = `USER FEEDBACK:\n${scene.review_notes.trim()}\n\nORIGINAL SCENE CONTEXT:\n${scene.enriched_prompt.slice(0, 800)}\n\nMATERIAL CONTEXT (GROUND TRUTH):\n${materialContext}`;

      logger.info('scenes', `Generating feedback addendum for scene ${scene.id}`);
      const addendum = await provider.enrichPrompt(FEEDBACK_ADDENDUM_SYSTEM_PROMPT, userFeedbackInput);
      addendumTrimmed = addendum.trim();
    }

    if (!addendumTrimmed) {
      throw new ValidationError('KI konnte keine Anweisungen aus dem Feedback ableiten.');
    }

    // Build refinement details for transparency
    const materialsArr = Array.from(materialMap.values());
    const refinementMaterials = materialsArr.map((mat: any) => ({
      materialName: mat.name,
      category: mat.category,
      imagePaths: (mat.images || []).map((img: any) => img.image_path),
    }));
    const refinementMaterialsJson = JSON.stringify(refinementMaterials);

    // Check if source image exists
    const hasSourceImage = !!(scene.image_path);

    // Save current version before overwriting if it exists
    if (scene.image_path) {
      saveSceneVersion(db, scene);
    }

    db.prepare("UPDATE scenes SET image_status = 'generating', last_refinement_prompt = ?, last_refinement_materials = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(addendumTrimmed, refinementMaterialsJson, scene.id);

    // Create render job
    const jobId = uuid();
    db.prepare(`
      INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
      VALUES (?, ?, 'image', 'processing', CURRENT_TIMESTAMP)
    `).run(jobId, scene.id);

    res.json({
      id: scene.id,
      image_status: 'generating',
      message: 'Regeneration with feedback started'
    });

    // Background generation
    const materialsArrForGen = Array.from(materialMap.values());
    const updatedScene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(scene.id) as any;
    const bodyExtraPaths: string[] = Array.isArray(req.body?.extraReferencePaths) ? req.body.extraReferencePaths : [];

    generateImageWithFeedback(db, scene.id, jobId, updatedScene, materialsArrForGen, addendumTrimmed, bodyExtraPaths).catch(err => {
      logger.error('scenes', `Regeneration with feedback failed for scene ${scene.id}`, { error: err?.message });
    });
  }));


  // POST restore version
  router.post('/:id/versions/:versionId/restore', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    const version = db.prepare('SELECT * FROM scene_versions WHERE id = ? AND scene_id = ?').get(req.params.versionId, scene.id) as any;
    if (!version) throw new NotFoundError('version', req.params.versionId);

    // Set scene to this version (open for editing, no duplicate version created)
    db.prepare(`
      UPDATE scenes 
      SET image_path = ?, enriched_prompt = ?, image_status = 'done', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(version.image_path, version.prompt, scene.id);

    res.json({ success: true, message: 'Version restored' });
  }));

  // GET versions
  router.get('/:id/versions', asyncHandler(async (req, res) => {
    const versions = db.prepare('SELECT * FROM scene_versions WHERE scene_id = ? ORDER BY version_number DESC').all(req.params.id);
    res.json(versions);
  }));

  // DELETE single version (removes DB row and version image file)
  router.delete('/:id/versions/:versionId', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    const version = db.prepare('SELECT * FROM scene_versions WHERE id = ? AND scene_id = ?').get(req.params.versionId, scene.id) as any;
    if (!version) throw new NotFoundError('version', req.params.versionId);

    const relativePath = version.image_path.startsWith('/') ? version.image_path.slice(1) : version.image_path;
    const fullPath = path.join(process.cwd(), '..', 'public', relativePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.info('scenes', `Deleted version file: ${relativePath}`);
      }
    } catch (err) {
      logger.warn('scenes', `Could not delete version file ${fullPath}: ${(err as Error).message}`);
    }

    db.prepare('DELETE FROM scene_versions WHERE id = ? AND scene_id = ?').run(version.id, scene.id);
    res.json({ success: true });
  }));

  function saveSceneVersion(db: Database.Database, scene: any) {
    try {
      // 1. Get next version number
      const lastVer = db.prepare('SELECT MAX(version_number) as max_ver FROM scene_versions WHERE scene_id = ?').get(scene.id) as any;
      const nextVer = (lastVer?.max_ver || 0) + 1;

      // 2. Generate version ID and Path
      const versionId = uuid();
      const ext = path.extname(scene.image_path);
      const versionFilename = `scene-${scene.id}-v${nextVer}${ext}`;
      const versionPath = `/renders/versions/${versionFilename}`;
      const fullVersionPath = path.join(process.cwd(), '..', 'public', versionPath);
      const textDir = path.dirname(fullVersionPath);

      if (!fs.existsSync(textDir)) fs.mkdirSync(textDir, { recursive: true });

      // 3. Copy file
      const relativeImagePath = scene.image_path.startsWith('/') ? scene.image_path.slice(1) : scene.image_path;
      const sourcePath = path.join(process.cwd(), '..', 'public', relativeImagePath);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, fullVersionPath);

        // 4. Insert into DB
        db.prepare(`
        INSERT INTO scene_versions (id, scene_id, image_path, prompt, version_number, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(versionId, scene.id, versionPath, scene.enriched_prompt, nextVer);

        logger.info('scenes', `Saved version ${nextVer} for scene ${scene.id}`);
      } else {
        logger.warn('scenes', `Version save failed: Source image not found at ${sourcePath}`);
        // Log original path too
        logger.warn('scenes', `Original scene image_path: ${scene.image_path}`);
      }

    } catch (err) {
      logger.error('scenes', `Failed to save scene version for ${scene.id}`, { error: (err as Error).message });
    }
  }

  // POST create scene + generate image
  router.post('/', asyncHandler(async (req, res) => {
    validateSceneCreate(req.body, db);

    const { projectId, templateId, sceneDescription, materialIds = [], format, exportPreset, promptTags, blueprintImagePath, motifImagePath, motifImagePaths, extraReferencePaths } = req.body;
    const safeMaterialIds: string[] = Array.isArray(materialIds) ? materialIds : [];
    const motifPaths: string[] = Array.isArray(motifImagePaths) && motifImagePaths.length
      ? motifImagePaths.slice(0, MAX_REFERENCE_IMAGES)
      : (motifImagePath ? [motifImagePath] : []);
    const extraRefPaths: string[] = Array.isArray(extraReferencePaths)
      ? extraReferencePaths.slice(0, MAX_EXTRA_REFERENCE_IMAGES) : [];

    logger.info('scenes', `Creating scene: materials=${safeMaterialIds.length}, preset=${exportPreset}, format=${format}`);

    // Get the project (use default if not specified)
    const pid = projectId || 'default';
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) throw new NotFoundError('project', pid);

    // Get template if selected
    let template: any = null;
    if (templateId) {
      template = db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(templateId);
      if (!template) throw new NotFoundError('template', templateId);
    }

    // Get materials with images (materials are optional)
    const materials: any[] = [];
    for (const matId of safeMaterialIds) {
      const mat = db.prepare('SELECT * FROM materials WHERE id = ?').get(matId) as any;
      if (!mat) throw new NotFoundError('material', matId);

      // Filter out idle materials
      if (mat.status === 'idle') {
        logger.info('scenes', `Skipping idle material: ${mat.name} (${mat.id})`);
        continue;
      }

      const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(matId);
      materials.push({ ...mat, images });
    }

    // Create scene
    const sceneId = uuid();
    const orderIndex = (db.prepare('SELECT MAX(order_index) as max_idx FROM scenes WHERE project_id = ?').get(pid) as any)?.max_idx || 0;

    const motifPathsJson = motifPaths.length ? JSON.stringify(motifPaths) : null;
    const motifPathSingle = motifPaths[0] || null;
    const promptTagsJson = Array.isArray(promptTags) ? JSON.stringify(promptTags) : null;
    const extraRefPathsJson = extraRefPaths.length ? JSON.stringify(extraRefPaths) : null;
    const presetRow = db.prepare('SELECT width, height FROM export_presets WHERE id = ?').get(exportPreset || 'free') as { width: number; height: number } | undefined;
    const targetWidth = presetRow?.width ?? null;
    const targetHeight = presetRow?.height ?? null;
    db.prepare(`
      INSERT INTO scenes (id, project_id, name, order_index, template_id, scene_description, prompt_tags, format, export_preset, target_width, target_height, blueprint_image_path, motif_image_path, motif_image_paths, extra_reference_paths, image_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')
    `).run(sceneId, pid, `Scene ${orderIndex + 1}`, orderIndex + 1, templateId || null,
      sceneDescription || null, promptTagsJson, format || null, exportPreset || 'free', targetWidth, targetHeight, blueprintImagePath || null,
      motifPathSingle, motifPathsJson, extraRefPathsJson);

    // Link materials (if any were selected)
    const insertMat = db.prepare('INSERT INTO scene_materials (scene_id, material_id) VALUES (?, ?)');
    for (const matId of safeMaterialIds) {
      insertMat.run(sceneId, matId);
    }

    // Create render job
    const jobId = uuid();
    db.prepare(`
      INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
      VALUES (?, ?, 'image', 'processing', CURRENT_TIMESTAMP)
    `).run(jobId, sceneId);

    // Return immediately, generate in background
    res.status(201).json({
      id: sceneId,
      image_status: 'generating',
      message: 'Image generation started',
    });

    // Background generation
    generateImage(db, sceneId, jobId, materials, template, sceneDescription, format, exportPreset, blueprintImagePath, motifPaths, promptTags, extraRefPaths).catch(err => {
      logger.error('scenes', `Background image generation failed for scene ${sceneId}`, { error: err?.message });
    });
  }));

  // POST regenerate
  router.post('/:id/regenerate', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);

    // Get materials
    const materials = db.prepare(`
      SELECT m.*, mi.image_path as img_path, mi.perspective FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      LEFT JOIN material_images mi ON mi.material_id = m.id
      WHERE sm.scene_id = ? AND m.status != 'idle'
    `).all(scene.id) as any[];

    // Group images by material
    const materialMap = new Map<string, any>();
    for (const row of materials) {
      if (!materialMap.has(row.id)) {
        materialMap.set(row.id, { ...row, images: [] });
      }
      if (row.img_path) {
        materialMap.get(row.id)!.images.push({ image_path: row.img_path, perspective: row.perspective });
      }
    }

    const template = scene.template_id
      ? db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(scene.template_id)
      : null;

    db.prepare("UPDATE scenes SET image_status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.params.id);

    const jobId = uuid();
    db.prepare(`
      INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
      VALUES (?, ?, 'image', 'processing', CURRENT_TIMESTAMP)
    `).run(jobId, scene.id);

    res.json({ id: scene.id, image_status: 'generating', message: 'Regeneration started' });

    const motifPaths = getMotifPathsFromScene(scene);
    const extraRefPaths = getExtraRefPathsFromScene(scene);
    const promptTags = scene.prompt_tags ? JSON.parse(scene.prompt_tags) : [];
    generateImage(db, scene.id, jobId, Array.from(materialMap.values()), template, scene.scene_description, scene.format, scene.export_preset, scene.blueprint_image_path, motifPaths, promptTags, extraRefPaths).catch(err => {
      logger.error('scenes', `Regeneration failed for scene ${scene.id}`, { error: err?.message });
    });
  }));

  // POST generate format variant from existing scene
  router.post('/:id/variant', asyncHandler(async (req, res) => {
    const sourceScene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!sourceScene) throw new NotFoundError('scene', req.params.id);
    if (!sourceScene.enriched_prompt) {
      throw new ValidationError('Die Quell-Szene hat keinen angereicherten Prompt. Generiere zuerst ein Bild.');
    }

    const { exportPreset } = req.body;
    if (!exportPreset) throw new ValidationError('Export-Preset ist erforderlich.');

    // Get materials from source scene
    const materials = db.prepare(`
      SELECT m.*, mi.image_path as img_path, mi.perspective FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      LEFT JOIN material_images mi ON mi.material_id = m.id
      WHERE sm.scene_id = ? AND m.status = 'engaged'
    `).all(sourceScene.id) as any[];

    const materialMap = new Map<string, any>();
    for (const row of materials) {
      if (!materialMap.has(row.id)) {
        materialMap.set(row.id, { ...row, images: [] });
      }
      if (row.img_path) {
        materialMap.get(row.id)!.images.push({ image_path: row.img_path, perspective: row.perspective });
      }
    }

    const template = sourceScene.template_id
      ? db.prepare('SELECT * FROM scene_templates WHERE id = ?').get(sourceScene.template_id)
      : null;

    // Create new scene as variant
    const sceneId = uuid();
    const orderIndex = (db.prepare('SELECT MAX(order_index) as max_idx FROM scenes WHERE project_id = ?').get(sourceScene.project_id) as any)?.max_idx || 0;

    // Look up preset name for scene name
    const presetInfo = db.prepare('SELECT name, width, height FROM export_presets WHERE id = ?').get(exportPreset) as any;
    const variantName = presetInfo ? `${sourceScene.name} (${presetInfo.name})` : `${sourceScene.name} (Variante)`;

    const variantMotifPaths = getMotifPathsFromScene(sourceScene);
    const variantMotifPathsJson = variantMotifPaths.length ? JSON.stringify(variantMotifPaths) : null;
    const variantExtraRefPaths = getExtraRefPathsFromScene(sourceScene);
    const variantExtraRefPathsJson = variantExtraRefPaths.length ? JSON.stringify(variantExtraRefPaths) : null;
    const variantTargetWidth = presetInfo?.width ?? null;
    const variantTargetHeight = presetInfo?.height ?? null;
    db.prepare(`
      INSERT INTO scenes (id, project_id, name, order_index, template_id, scene_description, enriched_prompt, format, export_preset, target_width, target_height, blueprint_image_path, motif_image_path, motif_image_paths, extra_reference_paths, image_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')
    `).run(sceneId, sourceScene.project_id, variantName, orderIndex + 1,
      sourceScene.template_id || null, sourceScene.scene_description || null,
      sourceScene.enriched_prompt, sourceScene.format || null, exportPreset,
      variantTargetWidth, variantTargetHeight, sourceScene.blueprint_image_path || null, variantMotifPaths[0] || null, variantMotifPathsJson, variantExtraRefPathsJson);

    // Link same materials
    const insertMat = db.prepare('INSERT INTO scene_materials (scene_id, material_id) VALUES (?, ?)');
    for (const matId of materialMap.keys()) {
      insertMat.run(sceneId, matId);
    }

    const jobId = uuid();
    db.prepare(`
      INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
      VALUES (?, ?, 'image', 'processing', CURRENT_TIMESTAMP)
    `).run(jobId, sceneId);

    res.status(201).json({ id: sceneId, image_status: 'generating', message: 'Format variant generation started' });

    // Background: reuse enriched prompt but with new aspect ratio
    const promptTags = sourceScene.prompt_tags ? JSON.parse(sourceScene.prompt_tags) : [];
    generateImage(db, sceneId, jobId, Array.from(materialMap.values()), template,
      sourceScene.scene_description, sourceScene.format, exportPreset, sourceScene.blueprint_image_path, variantMotifPaths, promptTags, variantExtraRefPaths).catch(err => {
        logger.error('scenes', `Variant generation failed for scene ${sceneId}`, { error: err?.message });
      });
  }));

  // POST vision-correction (analyze image and regenerate)
  router.post('/:id/vision-correction', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) throw new NotFoundError('scene', req.params.id);
    if (!scene.image_path) {
      throw new ValidationError('Die Szene hat kein Bild, das analysiert werden kann.');
    }

    // Get materials for context
    const materials = db.prepare(`
      SELECT m.* FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      WHERE sm.scene_id = ? AND m.status != 'idle'
    `).all(scene.id) as any[];

    const materialContext = buildSceneMaterialContext(materials);

    // Load source image bank
    const imagePath = path.join(process.cwd(), '..', 'public', scene.image_path);
    if (!fs.existsSync(imagePath)) {
      throw new ValidationError('Bilddatei nicht gefunden.');
    }
    const imageData = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const provider = getImageProvider(providerName, apiKey);

    logger.info('scenes', `Running Vision Correction for scene ${scene.id}`);

    // 1. Analyze for consistency
    const analysis = await provider.analyzeImageConsistency({
      image: { base64: imageData.toString('base64'), mimeType },
      materialContext,
      sceneDescription: scene.scene_description,
    });

    if (analysis.trim().toLowerCase() === 'no errors found.') {
      return res.json({ id: scene.id, message: 'No consistency errors found.' });
    }

    // 2. Save analysis to review_notes if it found issues
    db.prepare('UPDATE scenes SET review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(analysis.trim(), scene.id);

    // 3. Trigger regeneration with feedback (reusing existing logic)
    const addendumRequest = `VISION ANALYSIS FEEDBACK (Errors found):
${analysis.trim()}

MATERIAL CONTEXT:
${materialContext}

ORIGINAL SCENE PROMPT:
${scene.enriched_prompt?.slice(0, 800)}`;

    const addendum = await provider.enrichPrompt(FEEDBACK_ADDENDUM_SYSTEM_PROMPT, addendumRequest);
    const addendumTrimmed = addendum.trim();

    if (!addendumTrimmed) {
      throw new ValidationError('KI konnte keine Anweisungen aus der Vision-Analyse ableiten.');
    }

    db.prepare("UPDATE scenes SET image_status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(scene.id);

    const jobId = uuid();
    db.prepare(`
        INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
        VALUES (?, ?, 'image', 'processing', CURRENT_TIMESTAMP)
      `).run(jobId, scene.id);

    // Group materials for regeneration
    const materialMap = new Map<string, any>();
    for (const mat of materials) {
      const images = db.prepare('SELECT * FROM material_images WHERE material_id = ?').all(mat.id);
      materialMap.set(mat.id, { ...mat, images });
    }

    // Refresh scene data
    const updatedScene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(scene.id) as any;

    res.json({ id: scene.id, image_status: 'generating', message: 'Vision Correction analysis completed, regeneration started', analysis });

    generateImageWithFeedback(db, scene.id, jobId, updatedScene, Array.from(materialMap.values()), addendumTrimmed).catch(err => {
      logger.error('scenes', `Vision Correction regeneration failed for scene ${scene.id}`, { error: err?.message });
    });
  }));

  return router;
}

async function generateImage(
  db: Database.Database,
  sceneId: string,
  jobId: string,
  materials: any[],
  template: any,
  sceneDescription: string | null,
  format: string | null,
  exportPreset: string | null,
  blueprintImagePath: string | null,
  motifImagePaths: string[],
  promptTags: string[] = [],
  extraRefImagePaths: string[] = []
): Promise<void> {
  try {
    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-api-key-here') {
      const msg = 'Kein gültiger API-Key konfiguriert. Bitte in den Einstellungen (⚙️) einen Gemini API-Key hinterlegen.';
      db.prepare("UPDATE scenes SET image_status = 'failed', last_error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(msg, sceneId);
      db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(msg, jobId);
      return;
    }
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const provider = getImageProvider(providerName, apiKey);

    // Safety filter: Ensure only non-idle materials are used
    const activeMaterials = materials.filter(m => m.status !== 'idle');
    const motifPaths = Array.isArray(motifImagePaths) ? motifImagePaths.slice(0, MAX_REFERENCE_IMAGES) : [];
    const hasMotif = motifPaths.length > 0;

    // Build material context
    const materialContext = buildSceneMaterialContext(activeMaterials);

    // Build tag strings
    const tagPrompts = promptTags
      .map(id => TAG_PROMPTS[id])
      .filter(Boolean);

    // Build scene intelligence prompt
    let templatePrompt = template?.prompt_template?.replace('{materials}', materialContext) || '';

    // IF no template is provided, explicitly tell the AI to decide the best composition
    if (!template) {
      const tagContext = tagPrompts.length > 0
        ? `Given the selected scene elements (${promptTags.join(', ')}), choose the most professional and visually appealing composition for these products.`
        : 'Choose the most professional and visually appealing product photography composition for these materials.';

      templatePrompt = `No specific template selected. AI DECISION REQUIRED: ${tagContext}`;
    }

    const hasExtraRefs = extraRefImagePaths.length > 0;
    const extraRefPromptLine = hasExtraRefs
      ? `## Additional Reference Images (Person/Objects): ${extraRefImagePaths.length} extra reference image(s) have been provided by the user. These images show persons, objects, or visual references that the user may describe in their instructions above. The user can refer to them as "Extra-Referenzbild 1", "Extra-Referenzbild 2", etc. (numbered in order). Use these images to faithfully reproduce the depicted person/object/visual in the generated scene as described by the user. These extra reference images appear AFTER the blueprint image and BEFORE the motif images in the reference image sequence.`
      : '';

    const motifPromptLine = hasMotif
      ? `## Canvas Motifs (ONLY these – no other images): ${motifPaths.length} motif image(s) were uploaded by the user. ONLY these exact motif images may appear in the scene (e.g. on canvases or as templates). Do not use any other graphics, illustrations, or motifs. The format (aspect ratio, proportions) of each motif must NEVER be changed – no stretching, cropping, or distortion. The motif images are included as the LAST ${motifPaths.length} reference image(s).`
      : '';

    const tagSection = tagPrompts.length > 0
      ? `## Scene Elements & Context:\n${tagPrompts.map(p => `- ${p}`).join('\n')}`
      : '';

    const materialCategories = activeMaterials.map((m: any) => m.category);
    const materialRestriction = buildMaterialRestrictionPrompt(materialCategories);

    const materialsSection = activeMaterials.length > 0
      ? `## Materials in this scene (ONLY these may appear):\n${materialContext}\nOnly the materials listed above may appear in the scene. Do not add brushes, palettes, pencils, pens, or any object that is not in this list. No generic or foreign props.`
      : '## Materials: No specific materials were selected. Do not show paint pots (Farbtöpfe), brushes (Pinsel), palettes (Malpalette), colored pencils, pens, or unpainted/blank canvas. Focus only on the environment and any uploaded motifs.';

    const userPromptParts = [
      materialsSection,
      materialRestriction,
      `## Scene Guidance: ${templatePrompt}`,
      tagSection,
      sceneDescription ? `## User Custom Instructions: ${sceneDescription}` : '',
      format ? `## Style Format: ${format} (vorlage = unframed template with numbers, gerahmt = stretched on wooden frame, ausmalen = artistically painted)` : '',
      extraRefPromptLine,
      motifPromptLine,
      `\nGenerate a detailed, photorealistic scene description optimized for AI image generation. Include specific details about:\n1. Exact placement and arrangement of each element\n2. Lighting direction, color temperature, and shadows\n3. Camera angle and depth of field\n4. Surface interactions (reflections, shadows, textures)\n5. Overall mood and atmosphere`,
    ].filter(Boolean).join('\n\n');

    // Scene Intelligence
    logger.info('scenes', `Running Scene Intelligence for scene ${sceneId}`);
    let enrichedPrompt = await provider.enrichPrompt(SCENE_INTELLIGENCE_SYSTEM_PROMPT, userPromptParts);

    // Fallback if Scene Intelligence returns empty (sometimes happens with image-only responses)
    if (!enrichedPrompt || enrichedPrompt.trim().length === 0) {
      logger.warn('scenes', `Scene Intelligence returned empty prompt, using original description as fallback`);
      enrichedPrompt = sceneDescription || 'A professional product photography scene showcasing the materials';
    }

    // When user uploaded extra reference images, ensure the image model is explicitly told to use them
    if (hasExtraRefs && enrichedPrompt && enrichedPrompt.trim().length > 0) {
      enrichedPrompt = enrichedPrompt.trim() + '\n\nThe user has uploaded one or more additional reference images (person, object, or visual). The generated image MUST include and faithfully reproduce the content of these reference image(s) in the scene, placed and styled in a natural way. They are provided as the additional reference images (in order: first, second, …) after the blueprint in the reference image set.';
    }

    // === NEW: Inject successful patterns from memory ===
    const enrichedPromptWithPatterns = patternMemory.injectSuccessfulPatterns(db, materialCategories, enrichedPrompt);

    db.prepare('UPDATE scenes SET enriched_prompt = ? WHERE id = ?').run(enrichedPromptWithPatterns, sceneId);

    // Collect reference images
    const referenceImages = collectReferenceImages(activeMaterials, blueprintImagePath, motifPaths, extraRefImagePaths);

    // Resolve aspect ratio
    let aspectRatio = EXPORT_PRESET_TO_ASPECT_RATIO[exportPreset || 'free'] || '3:2';
    const presetRow = db.prepare('SELECT width, height FROM export_presets WHERE id = ?').get(exportPreset || 'free') as any;
    if (presetRow) {
      aspectRatio = widthHeightToAspectRatio(presetRow.width, presetRow.height);
    }
    const imagePrompt = buildImageGenerationPrompt(enrichedPromptWithPatterns, activeMaterials, hasMotif, aspectRatio, promptTags);

    logger.info('scenes', `Generating image for scene ${sceneId} with ${referenceImages.length} reference images, aspect=${aspectRatio}`);
    const result = await provider.generateImage({
      prompt: imagePrompt,
      referenceImages,
      aspectRatio,
      imageSize: '2K',
    });

    // Save image
    fs.mkdirSync(rendersDir, { recursive: true });
    const imagePath = `/renders/${sceneId}.png`;
    const fullPath = path.join(process.cwd(), '..', 'public', imagePath);
    fs.writeFileSync(fullPath, Buffer.from(result.imageBase64, 'base64'));

    // === NEW: Automatic Material Consistency Verification (only if materials are present) ===
    let verificationResult = null;

    if (activeMaterials.length > 0) {
      logger.info('scenes', `Running automatic material consistency verification for scene ${sceneId}`);

      const materialsContext = activeMaterials.map(mat => ({
        materialId: mat.id,
        name: mat.name,
        category: mat.category,
        description: mat.description,
        dimensions: mat.dimensions,
        color: mat.color,
        formatCode: mat.format_code,
        imagePaths: mat.images ? mat.images.map((img: any) => img.image_path) : [],
      }));

      verificationResult = await verificationService.verifyMaterialConsistency(
        result.imageBase64,
        materialsContext,
        sceneDescription
      );

      // Save verification results to database
      db.prepare(`
        UPDATE scenes
        SET verification_score = ?,
            verification_issues = ?,
            verification_attempts = COALESCE(verification_attempts, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        verificationResult.score,
        JSON.stringify(verificationResult.issues),
        sceneId
      );

      // Save verification log
      verificationService.saveVerificationLog(db, sceneId, 'image', verificationResult);

      logger.info('scenes', `Verification complete: score=${verificationResult.score}, passed=${verificationResult.passed}, issues=${verificationResult.issues.length}`);
    } else {
      logger.info('scenes', `Skipping verification - no materials in scene ${sceneId}`);
    }

    // Auto-refinement logic (only if verification was run)
    if (verificationResult) {
      const currentAttempts = db.prepare('SELECT verification_attempts FROM scenes WHERE id = ?').get(sceneId) as any;
      const attempts = currentAttempts?.verification_attempts || 0;

      if (!verificationResult.passed && attempts < 3) {
        // Verification failed but we haven't exceeded retry limit
        const criticalIssues = verificationResult.issues.filter(i => i.severity === 'critical').length;

        if (verificationResult.score < 70 || criticalIssues > 0) {
          logger.info('scenes', `Auto-refinement triggered: score=${verificationResult.score}, critical=${criticalIssues}, attempt=${attempts}/3`);

          // Generate refinement prompt from verification issues
          const refinementPrompt = verificationService.generateRefinementPrompt(verificationResult);

          if (refinementPrompt) {
            // Update scene status to indicate refinement
            db.prepare("UPDATE scenes SET image_status = 'generating', last_error_message = 'Auto-refining based on verification issues' WHERE id = ?")
              .run(sceneId);

            // Create new render job for refinement
            const refinementJobId = uuid();
            db.prepare(`INSERT INTO render_jobs (id, scene_id, job_type, status) VALUES (?, ?, 'image-refinement', 'pending')`)
              .run(refinementJobId, sceneId);

            // Trigger auto-refinement
            const updatedScene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as any;
            generateImageWithFeedback(db, sceneId, refinementJobId, updatedScene, activeMaterials, refinementPrompt).catch(err => {
              logger.error('scenes', `Auto-refinement failed for scene ${sceneId}`, { error: err?.message });
            });

            logger.info('scenes', `Auto-refinement started for scene ${sceneId} (attempt ${attempts}/3)`);
            return; // Exit early - refinement will complete asynchronously
          }
        }
      }
    }

    // If verification passed OR max attempts reached OR no materials, mark as done
    db.prepare("UPDATE scenes SET image_path = ?, image_status = 'done', last_error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(imagePath, sceneId);
    db.prepare("UPDATE render_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, cost_estimate = ? WHERE id = ?")
      .run(result.cost || 0.04, jobId);

    // === NEW: Save successful patterns to memory (score >= 90, only if materials present) ===
    if (verificationResult && verificationResult.score >= 90) {
      const sceneRow = db.prepare('SELECT enriched_prompt FROM scenes WHERE id = ?').get(sceneId) as any;
      const savedPrompt = sceneRow?.enriched_prompt || enrichedPromptWithPatterns;

      for (const mat of activeMaterials) {
        patternMemory.saveSuccessfulPattern(db, mat.category, savedPrompt, verificationResult.score);
      }

      logger.info('scenes', `Saved successful patterns for ${activeMaterials.length} material categories (score: ${verificationResult.score})`);
    }

    logger.info('scenes', `Image generated successfully for scene ${sceneId}${verificationResult ? ` with verification score ${verificationResult.score}` : ' (no verification - no materials)'}`);
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    logger.error('scenes', `Image generation failed for scene ${sceneId}`, { error: errorMsg });
    db.prepare("UPDATE scenes SET image_status = 'failed', last_error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(errorMsg, sceneId);
    db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(errorMsg, jobId);
  }
}

async function generateImageWithFeedback(
  db: Database.Database,
  sceneId: string,
  jobId: string,
  scene: any,
  materials: any[],
  addendum: string,
  extraRefPathsForRequest?: string[]
) {
  try {
    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-api-key-here') {
      const msg = 'Kein gültiger API-Key konfiguriert. Bitte in den Einstellungen (⚙️) einen Gemini API-Key hinterlegen.';
      db.prepare("UPDATE scenes SET image_status = 'failed', last_error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(msg, sceneId);
      db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(msg, jobId);
      return;
    }
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'gemini';
    const provider = getImageProvider(providerName, apiKey);

    const motifPaths = getMotifPathsFromScene(scene);
    const extraRefPaths = (extraRefPathsForRequest?.length
      ? [...getExtraRefPathsFromScene(scene), ...extraRefPathsForRequest].slice(0, MAX_EXTRA_REFERENCE_IMAGES)
      : getExtraRefPathsFromScene(scene));
    const hasMotif = motifPaths.length > 0;

    // Refinement always sends: (1) source image to edit, (2) material reference images when selected, (3) extra refs, (4) uploaded motif images
    const referenceImages = collectReferenceImages(materials, scene.blueprint_image_path, motifPaths, extraRefPaths);
    logger.info('scenes', `Refinement refs: source image=1, materials=${materials.length}, extraRefs=${extraRefPaths.length}, motifs=${motifPaths.length}, total ref images=${referenceImages.length}`);

    const combinedPrompt = `REFINEMENT REQUEST: This is an Image-to-Image request to fix specific errors in the existing photo.
1. Maintain the overall composition, lighting, and camera setup of the source image.
2. IMPLEMENT the specific corrections listed below.
3. Ensure the physical materials (pots, brushes, canvas) follow the material specifications exactly.
4. The resulting image should be a "fixed" version of the source image.

--- Original Base Prompt ---
${scene.enriched_prompt}

--- Specific Corrections required ---
${addendum}`;

    // Store the full combined prompt for transparency
    db.prepare('UPDATE scenes SET last_refinement_prompt = ? WHERE id = ?').run(combinedPrompt, sceneId);

    // Load current image for Image-to-Image and get dimensions FROM FILE so format is never wrong (16:9 stays 16:9)
    let sourceImage: { base64: string; mimeType: string } | undefined;
    let aspectRatio = EXPORT_PRESET_TO_ASPECT_RATIO[scene.export_preset || 'free'] || '3:2';
    let targetW: number | null = scene.target_width ?? null;
    let targetH: number | null = scene.target_height ?? null;

    if (scene.image_path) {
      const currentPath = path.join(process.cwd(), '..', 'public', scene.image_path);
      try {
        if (fs.existsSync(currentPath)) {
          const imageData = fs.readFileSync(currentPath);
          const ext = path.extname(currentPath).toLowerCase();
          const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          sourceImage = { base64: imageData.toString('base64'), mimeType };
          logger.info('scenes', `Loaded current image for refinement: ${scene.image_path}`);

          const dims = getImageDimensionsFromFile(currentPath);
          if (dims) {
            targetW = dims.width;
            targetH = dims.height;
            aspectRatio = widthHeightToAspectRatio(dims.width, dims.height);
            logger.info('scenes', `Refinement aspect ratio from source image: ${dims.width}x${dims.height} -> ${aspectRatio}`);
          }
        }
      } catch (err) {
        logger.warn('scenes', `Could not load current image for refinement: ${currentPath}`);
      }
    }

    if (targetW == null || targetH == null) {
      const presetRow = db.prepare('SELECT width, height FROM export_presets WHERE id = ?').get(scene.export_preset || 'free') as any;
      if (presetRow) {
        aspectRatio = widthHeightToAspectRatio(presetRow.width, presetRow.height);
        targetW = presetRow.width;
        targetH = presetRow.height;
      }
    }

    const dimensionInstruction = targetW != null && targetH != null
      ? `\n=== CRITICAL: PRESERVE FORMAT AND DIMENSIONS ===\nThe output image MUST have EXACTLY the same aspect ratio and orientation as the source image: ${targetW}x${targetH} (${aspectRatio}). DO NOT rotate, crop, or change the image dimensions. If the source is landscape, the output MUST be landscape. If portrait, the output MUST be portrait.\n`
      : '';

    // Build a dedicated REFINEMENT prompt — NOT the generic generation prompt.
    // The generic buildImageGenerationPrompt says "Generate a photorealistic product photograph..."
    // which tells the AI to CREATE a new image, defeating the purpose of refinement.
    // Instead, we build a targeted editing prompt that emphasizes the corrections.
    const materialContext = materials.map((mat: any) => {
      // Use the comprehensive material builder to get all details (labels, lids, etc.)
      return `MATERIAL ${mat.name} (${mat.category}):\n${buildMaterialContext(mat)}`;
    }).join('\n\n');

    const imagePrompt = `TASK: EDIT SOURCE IMAGE (RETOUCHING)
    ${dimensionInstruction}
    You are an expert photo retoucher. Your task is to MODIFY the attached source image based on the user's feedback.
    
    INPUTS YOU RECEIVE:
    1. SOURCE IMAGE (first image): The photo to edit. This is the main image; preserve its composition, lighting, and 95% of its content, then apply the requested corrections.
    2. REFERENCE IMAGES (following): Material reference photos (when materials are selected), optional additional reference images (person/object/photo), and uploaded motif images (last). Use these for correct proportions, appearance, and motif/format fidelity. Only the source image should be modified; reference images are for guidance only.${extraRefPaths.length > 0 ? ' If additional reference image(s) are provided (person, object, or photo), the USER CORRECTIONS text below describes how to use them (e.g. "add this person", "include this image", "place this object in the scene").' : ''}
    3. CORRECTIONS: Specific changes requested by the user (see below).
    4. CONTEXT: The original description of the scene (for understanding materials/mood ONLY).
    
    === USER CORRECTIONS (HIGHEST PRIORITY) ===
    ${addendum}
    
    === RULES ===
    - DO NOT generate a new image from scratch.
    - DO NOT change the camera angle or composition.
    - DO NOT change the lighting unless requested.
    - DO NOT change the aspect ratio or orientation of the image. The output MUST match the source image format exactly (landscape stays landscape, portrait stays portrait).
    - ONLY apply the corrections listed above.
    - The result must look like the source image with the specific edits applied.
    - ONLY the materials and motifs from the reference images may appear. Do NOT add any new objects (brushes, palettes, colored pencils, pens, or other props) that are not in the reference images.
    - Motif formats must NEVER be changed: preserve each motif's exact aspect ratio and proportions; no stretching, cropping, or distortion.
    - NEVER add any text, writing, labels, numbers, or letters onto the image unless the user EXPLICITLY requested it in the corrections above. If no text/labels are requested, the image must contain NO visible text or writing.
    
    === OUTPUT ===
    You MUST respond with exactly one image (the edited photo). Do not respond with text only. Output the edited image.
    
    === MATERIAL SPECIFICATIONS (STRICT ADHERENCE REQUIRED) ===
    The following materials appear in the source image. You MUST ensure they look exactly as described below and in the reference images. Do NOT replace them with generic versions. Do not add any object that is not in these materials or in the uploaded motif images.
    
    ${materialContext || 'No specific materials.'}
    
    === ORIGINAL SCENE CONTEXT (BACKGROUND INFO ONLY) ===
    ${scene.enriched_prompt?.slice(0, 1000) || 'No context.'}`;

    logger.info('scenes', `Generating image with feedback addendum for scene ${sceneId}, aspect=${aspectRatio}`);
    const result = await provider.generateImage({
      prompt: imagePrompt,
      referenceImages,
      aspectRatio,
      imageSize: '2K',
      sourceImage,
    });

    fs.mkdirSync(rendersDir, { recursive: true });
    const imagePath = `/renders/${sceneId}.png`;
    const fullPath = path.join(process.cwd(), '..', 'public', imagePath);
    fs.writeFileSync(fullPath, Buffer.from(result.imageBase64, 'base64'));

    db.prepare("UPDATE scenes SET image_path = ?, image_status = 'done', last_error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(imagePath, sceneId);
    db.prepare("UPDATE render_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, cost_estimate = ? WHERE id = ?")
      .run(result.cost || 0.04, jobId);

    logger.info('scenes', `Image generated with feedback for scene ${sceneId}`);
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    logger.error('scenes', `Regenerate with feedback failed for scene ${sceneId}`, { error: errorMsg });
    db.prepare("UPDATE scenes SET image_status = 'failed', last_error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(errorMsg, sceneId);
    db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(errorMsg, jobId);
  }
}

/**
 * Helper to collect and prioritize reference images.
 * Ensures critical materials (like paint pots) and motifs are correctly represented within limits.
 */
/**
 * Determines perspective priority for different material categories.
 * Higher priority = more important for accurate reproduction.
 */
function getPerspectivePriority(category: string, perspective: string): number {
  const perspectiveLower = (perspective || '').toLowerCase();

  switch (category) {
    case 'paint_pots':
      // Detail views show labels (CRITICAL), then front/top views, then others
      if (perspectiveLower.includes('detail')) return 100;
      if (perspectiveLower.includes('front')) return 90;
      if (perspectiveLower.includes('top')) return 85;
      if (perspectiveLower.includes('packaged')) return 70;
      return 60;

    case 'brushes':
      // Front shows bristles (important), then side, then detail
      if (perspectiveLower.includes('front')) return 100;
      if (perspectiveLower.includes('side')) return 90;
      if (perspectiveLower.includes('detail')) return 85;
      return 70;

    case 'mnz_motif':
      // Front is CRITICAL (never show back), then detail, NEVER back
      if (perspectiveLower.includes('back')) return 0; // NEVER use back view
      if (perspectiveLower.includes('front')) return 100;
      if (perspectiveLower.includes('detail')) return 90;
      return 70;

    default:
      // For other materials, prioritize front, detail, then others
      if (perspectiveLower.includes('front')) return 100;
      if (perspectiveLower.includes('detail')) return 95;
      if (perspectiveLower.includes('side')) return 85;
      if (perspectiveLower.includes('top')) return 80;
      return 70;
  }
}

function collectReferenceImages(
  materials: any[],
  blueprintImagePath: string | null,
  motifPaths: string[],
  extraRefPaths: string[] = []
): { base64: string; mimeType: string }[] {
  const referenceImages: { base64: string; mimeType: string }[] = [];

  // 1. Reserve slots for motifs, blueprint, and extra reference images (they are critical at the end)
  const reservedSlots = (blueprintImagePath ? 1 : 0) + motifPaths.length + extraRefPaths.length;
  const materialSlots = MAX_REFERENCE_IMAGES - reservedSlots;

  // 2. Prioritize materials: paint_pots and brushes first
  const sortedMaterials = [...materials].sort((a, b) => {
    const priority = (cat: string) => cat === 'paint_pots' ? 0 : (cat === 'brushes' ? 1 : 2);
    return priority(a.category) - priority(b.category);
  });

  // 3. Add images for materials with intelligent perspective prioritization
  for (const mat of sortedMaterials) {
    if (referenceImages.length >= materialSlots) break;
    if (mat.images && mat.images.length > 0) {
      // Sort images by perspective priority
      const sortedImages = [...mat.images].sort((a, b) => {
        const priorityA = getPerspectivePriority(mat.category, a.perspective);
        const priorityB = getPerspectivePriority(mat.category, b.perspective);
        return priorityB - priorityA; // Descending order (highest priority first)
      });

      // Filter out back views for mnz_motif
      const filteredImages = mat.category === 'mnz_motif'
        ? sortedImages.filter(img => !((img.perspective || '').toLowerCase().includes('back')))
        : sortedImages;

      // Determine max images per material based on category
      let maxPerMat = 2; // Default
      if (mat.category === 'paint_pots') {
        maxPerMat = 5; // More images for paint pots (need to show different labels)
      } else if (mat.category === 'brushes') {
        maxPerMat = 3; // A few images for brushes
      } else if (mat.category === 'mnz_motif') {
        maxPerMat = 2; // Limited for canvas (structure reference only)
      }

      // Add top-priority images for this material
      for (const img of filteredImages.slice(0, maxPerMat)) {
        if (referenceImages.length >= materialSlots) break;
        const imgPath = path.join(process.cwd(), '..', 'public', img.image_path);
        try {
          const imageData = fs.readFileSync(imgPath);
          const ext = path.extname(imgPath).toLowerCase();
          const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          referenceImages.push({ base64: imageData.toString('base64'), mimeType });
          logger.info('scenes', `Added reference image: ${mat.name} - ${img.perspective || 'default'} view (priority: ${getPerspectivePriority(mat.category, img.perspective)})`);
        } catch (err) {
          logger.warn('scenes', `Could not read reference image: ${imgPath}`);
        }
      }
    }
  }

  // 4. Add Blueprint
  if (blueprintImagePath && referenceImages.length < MAX_REFERENCE_IMAGES) {
    const bpPath = path.join(process.cwd(), '..', 'public', blueprintImagePath);
    try {
      const bpData = fs.readFileSync(bpPath);
      referenceImages.push({ base64: bpData.toString('base64'), mimeType: 'image/png' });
      logger.info('scenes', 'Added blueprint image');
    } catch { /* ignore */ }
  }

  // 5. Add Extra Reference Images (person, objects, etc.) – between blueprint and motifs
  for (let i = 0; i < extraRefPaths.length; i++) {
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) break;
    const relPath = extraRefPaths[i];
    const extraPath = path.join(process.cwd(), '..', 'public', relPath);
    try {
      const extraData = fs.readFileSync(extraPath);
      const ext = path.extname(extraPath).toLowerCase();
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      referenceImages.push({ base64: extraData.toString('base64'), mimeType });
      logger.info('scenes', `Added extra reference image ${i + 1}: ${relPath}`);
    } catch (err) {
      logger.warn('scenes', `Could not read extra reference image: ${extraPath}`);
    }
  }

  // 6. Add Motifs (they MUST be LAST as per promptBuilder expectations)
  for (const relPath of motifPaths) {
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) break;
    const motifPath = path.join(process.cwd(), '..', 'public', relPath);
    try {
      const motifData = fs.readFileSync(motifPath);
      const ext = path.extname(motifPath).toLowerCase();
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      referenceImages.push({ base64: motifData.toString('base64'), mimeType });
      logger.info('scenes', `Added motif image (LAST position): ${relPath}`);
    } catch (err) {
      logger.warn('scenes', `Could not read motif image: ${motifPath}`);
    }
  }

  logger.info('scenes', `Collected ${referenceImages.length} reference images (max: ${MAX_REFERENCE_IMAGES})`);

  return referenceImages;
}
