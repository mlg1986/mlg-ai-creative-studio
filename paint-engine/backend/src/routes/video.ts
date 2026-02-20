import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateVideoGenerate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import { logger } from '../services/logger.js';
import { getVideoProvider } from '../services/providerFactory.js';
import { getPromptEnricherForDb } from '../services/promptEnricher.js';
import { buildSceneMaterialContext } from '../services/promptBuilder.js';

const rendersDir = path.join(process.cwd(), '..', 'public', 'renders');

const VIDEO_STYLE_PROMPTS: Record<string, string> = {
  cinematic: 'Cinematic camera movement with dramatic lighting transitions. Slow, smooth dolly shots revealing the scene. Film-like color grading.',
  energetic: 'Dynamic camera movement with quick pans and tilts. Vibrant energy, slight zoom effects. Upbeat, lively atmosphere.',
  minimal: 'Very subtle, almost imperceptible camera drift. Clean, minimal aesthetic. Gentle focus shifts between objects.',
  cozy: 'Warm, gentle camera movement like a soft breath. Cozy atmosphere with warm color tones. Intimate, personal perspective.',
};

export function createVideoRouter(db: Database.Database) {
  const router = Router();

  // POST generate video from scene image
  router.post('/:sceneId/video', asyncHandler(async (req, res) => {
    validateVideoGenerate(req.body);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.sceneId) as any;
    if (!scene) throw new NotFoundError('scene', req.params.sceneId);
    if (scene.image_status !== 'done' || !scene.image_path) {
      throw new ValidationError('Scene must have a generated image before creating a video');
    }

    const { videoStyle, videoPrompt, durationSeconds } = req.body;
    const duration = durationSeconds || 8;
    const style = videoStyle || 'cinematic';

    // Update scene
    db.prepare(`
      UPDATE scenes SET video_prompt = ?, video_style = ?, video_duration = ?, video_status = 'generating', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(videoPrompt || null, style, duration, scene.id);

    // Create render job
    const jobId = uuid();
    db.prepare(`
      INSERT INTO render_jobs (id, scene_id, job_type, status, started_at)
      VALUES (?, ?, 'video', 'processing', CURRENT_TIMESTAMP)
    `).run(jobId, scene.id);

    const costEstimate = duration * 0.75;
    res.json({
      id: scene.id,
      video_status: 'generating',
      cost_estimate: costEstimate,
      message: 'Video generation started',
    });

    // Background generation
    generateVideo(db, scene, jobId, style, videoPrompt, duration).catch(err => {
      logger.error('video', `Background video generation failed for scene ${scene.id}`, { error: err?.message });
    });
  }));

  // GET video status
  router.get('/:sceneId/video/status', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT id, video_status, video_path, video_style, video_duration FROM scenes WHERE id = ?')
      .get(req.params.sceneId) as any;
    if (!scene) throw new NotFoundError('scene', req.params.sceneId);

    const job = db.prepare(`
      SELECT * FROM render_jobs WHERE scene_id = ? AND job_type = 'video' ORDER BY started_at DESC LIMIT 1
    `).get(scene.id) as any;

    res.json({
      video_status: scene.video_status,
      video_path: scene.video_path,
      video_style: scene.video_style,
      video_duration: scene.video_duration,
      job: job || null,
    });
  }));

  return router;
}

async function generateVideo(
  db: Database.Database, scene: any, jobId: string,
  style: string, userPrompt: string | null, durationSeconds: number
) {
  try {
    const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    const providerName = (db.prepare("SELECT value FROM settings WHERE key = 'video_provider'").get() as any)?.value || 'veo';
    const provider = getVideoProvider(providerName, apiKey) as any;

    // Read source image
    const imagePath = path.join(process.cwd(), '..', 'public', scene.image_path);
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');

    // === NEW: Fetch materials for context injection ===
    const sceneMaterials = db.prepare(`
      SELECT m.* FROM materials m
      JOIN scene_materials sm ON sm.material_id = m.id
      WHERE sm.scene_id = ?
    `).all(scene.id) as any[];

    const materialContext = sceneMaterials.length > 0
      ? buildSceneMaterialContext(sceneMaterials)
      : '';

    // Build video prompt with material context
    const stylePrompt = VIDEO_STYLE_PROMPTS[style] || VIDEO_STYLE_PROMPTS.cinematic;
    const materialFidelityInstruction = materialContext
      ? `\n\nMATERIAL FIDELITY REQUIREMENT:\nMaintain ALL material properties from the source image throughout the video:\n${materialContext}\n\nIMPORTANT: Do NOT alter materials, labels, colors, or proportions during camera movement or lighting changes.`
      : '';
    const combinedPrompt = [stylePrompt, userPrompt, materialFidelityInstruction].filter(Boolean).join(' ');

    // Optimize prompt via Scene Intelligence (Gemini oder OpenAI)
    const enricher = getPromptEnricherForDb(db);
    const optimizedPrompt = await enricher.enrichPrompt(
      'You are a video prompt optimizer for Veo 3.1. Convert the user description into an optimized video generation prompt. Focus on camera movement, lighting changes, and scene dynamics. CRITICAL: Preserve all material properties, labels, and proportions from the source image.',
      combinedPrompt
    );

    // Generate video
    logger.info('video', `Starting video generation for scene ${scene.id}: ${durationSeconds}s, style=${style}`);
    const operationName = await provider.generateVideoFromImage({
      prompt: optimizedPrompt,
      sourceImage: { base64: imageBase64, mimeType: 'image/png' },
      aspectRatio: '16:9',
      durationSeconds,
      style,
      negativePrompt: 'blurry, low quality, text artifacts, watermark, unrealistic proportions',
    });

    // Store operation name
    db.prepare('UPDATE render_jobs SET google_operation_name = ? WHERE id = ?').run(operationName, jobId);

    // Poll until done
    const operation = await provider.pollVideoUntilDone({ name: operationName });

    // Download video
    fs.mkdirSync(rendersDir, { recursive: true });
    const videoPath = `/renders/${scene.id}_video.mp4`;
    const fullVideoPath = path.join(process.cwd(), '..', 'public', videoPath);
    await provider.downloadVideo(operation, fullVideoPath);

    // Update DB
    db.prepare("UPDATE scenes SET video_path = ?, video_status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(videoPath, scene.id);
    db.prepare("UPDATE render_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, cost_estimate = ? WHERE id = ?")
      .run(durationSeconds * 0.75, jobId);

    logger.info('video', `Video generated successfully for scene ${scene.id}`);
  } catch (error: any) {
    logger.error('video', `Video generation failed for scene ${scene.id}`, { error: error?.message });
    db.prepare("UPDATE scenes SET video_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(scene.id);
    db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(error?.message || 'Unknown error', jobId);
  }
}
