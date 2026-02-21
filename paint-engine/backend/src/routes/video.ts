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
import { getVideoProviderOption, VIDEO_PROVIDER_IDS } from '../config/videoProviders.js';
import { VIDEO_PROMPT_SYSTEM_PROMPT } from '../config/videoPromptSystem.js';

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

    const { videoStyle, videoPrompt, durationSeconds, videoProvider: bodyVideoProvider } = req.body;
    const duration = durationSeconds || 8;
    const style = videoStyle || 'cinematic';
    const providerName = (bodyVideoProvider && VIDEO_PROVIDER_IDS.includes(bodyVideoProvider))
      ? bodyVideoProvider
      : ((db.prepare("SELECT value FROM settings WHERE key = 'video_provider'").get() as any)?.value || 'veo');
    const providerOption = getVideoProviderOption(providerName);
    const costPerSecond = providerOption?.costPerSecond ?? 0.75;
    const costEstimate = duration * costPerSecond;

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

    res.json({
      id: scene.id,
      video_status: 'generating',
      cost_estimate: costEstimate,
      message: 'Video generation started',
    });

    // Background generation
    generateVideo(db, scene, jobId, style, videoPrompt, duration, providerName, costPerSecond).catch(err => {
      logger.error('video', `Background video generation failed for scene ${scene.id}`, { error: err?.message });
    });
  }));

  // POST preview video prompt (generate prompt only, no video job)
  router.post('/:sceneId/video/preview-prompt', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT id, enriched_prompt FROM scenes WHERE id = ?').get(req.params.sceneId) as any;
    if (!scene) throw new NotFoundError('scene', req.params.sceneId);
    const { videoStyle, videoPrompt } = req.body;
    const style = videoStyle || 'cinematic';
    const userPrompt = videoPrompt || null;
    const videoPromptResult = await buildVideoPromptFromUserInput(db, scene, style, userPrompt);
    res.json({ videoPrompt: videoPromptResult });
  }));

  // GET video status
  router.get('/:sceneId/video/status', asyncHandler(async (req, res) => {
    const scene = db.prepare('SELECT id, video_status, video_path, video_style, video_duration, video_prompt_generated FROM scenes WHERE id = ?')
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
      video_prompt_generated: scene.video_prompt_generated ?? undefined,
      job: job || null,
    });
  }));

  return router;
}

/** Build user input for video prompt enricher (style + user text + material + scene context). */
function buildVideoPromptUserInput(scene: any, sceneMaterials: any[], style: string, userPrompt: string | null): string {
  const materialContext = sceneMaterials.length > 0
    ? buildSceneMaterialContext(sceneMaterials)
    : '';
  const stylePrompt = VIDEO_STYLE_PROMPTS[style] || VIDEO_STYLE_PROMPTS.cinematic;
  const materialFidelityInstruction = materialContext
    ? `\n\nMATERIAL FIDELITY REQUIREMENT:\nMaintain ALL material properties from the source image throughout the video:\n${materialContext}\n\nIMPORTANT: Do NOT alter materials, labels, colors, or proportions during camera movement or lighting changes.`
    : '';
  const sceneContext = scene.enriched_prompt?.trim()
    ? `\n\nSCENE CONTEXT (what the image shows – use only to align camera/mood):\n${scene.enriched_prompt.slice(0, 1200)}`
    : '';
  const parts = [stylePrompt, userPrompt, materialFidelityInstruction, sceneContext].filter(Boolean);
  return parts.join(' ');
}

/** Call enricher to produce optimized video prompt from short user input. */
async function buildVideoPromptFromUserInput(
  db: Database.Database,
  scene: any,
  style: string,
  userPrompt: string | null
): Promise<string> {
  const sceneMaterials = db.prepare(`
    SELECT m.* FROM materials m
    JOIN scene_materials sm ON sm.material_id = m.id
    WHERE sm.scene_id = ?
  `).all(scene.id) as any[];
  const userInput = buildVideoPromptUserInput(scene, sceneMaterials, style, userPrompt);
  const enricher = getPromptEnricherForDb(db);
  const optimized = await enricher.enrichPrompt(VIDEO_PROMPT_SYSTEM_PROMPT, userInput);
  return optimized?.trim() || userInput.trim();
}

async function generateVideo(
  db: Database.Database, scene: any, jobId: string,
  style: string, userPrompt: string | null, durationSeconds: number,
  providerName: string, costPerSecond: number
) {
  try {
    const geminiApiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value
      || process.env.GEMINI_API_KEY;
    const replicateApiKey = (db.prepare("SELECT value FROM settings WHERE key = 'replicate_api_key'").get() as any)?.value
      || process.env.REPLICATE_API_TOKEN;
    const provider = getVideoProvider(providerName, {
      geminiApiKey,
      replicateApiKey,
    }) as any;

    // Read source image (strip leading slash so path.join does not ignore path segments)
    const imagePathRel = (scene.image_path || '').replace(/^\//, '');
    const imagePath = path.join(process.cwd(), '..', 'public', imagePathRel);
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');

    // Optimize prompt via enricher (strong system prompt + scene context)
    const optimizedPrompt = await buildVideoPromptFromUserInput(db, scene, style, userPrompt);

    // Persist generated prompt for transparency / support
    db.prepare('UPDATE scenes SET video_prompt_generated = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(optimizedPrompt, scene.id);

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
      .run(durationSeconds * costPerSecond, jobId);

    logger.info('video', `Video generated successfully for scene ${scene.id}`);
  } catch (error: any) {
    logger.error('video', `Video generation failed for scene ${scene.id}`, { error: error?.message });
    db.prepare("UPDATE scenes SET video_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(scene.id);
    db.prepare("UPDATE render_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(error?.message || 'Unknown error', jobId);
  }
}
