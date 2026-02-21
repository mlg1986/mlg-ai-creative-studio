import { Router } from 'express';
import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { logger } from '../services/logger.js';
import { getPromptEnricherKeys } from '../services/promptEnricher.js';
import { GoogleProvider } from '../services/providers/google.js';
import { AVAILABLE_VIDEO_PROVIDERS, VIDEO_PROVIDER_IDS } from '../config/videoProviders.js';

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

  router.get('/replicate-api-key', asyncHandler(async (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'replicate_api_key'").get() as any;
    const envKey = process.env.REPLICATE_API_TOKEN;
    res.json({
      hasApiKey: !!(row?.value || envKey),
      source: row?.value ? 'database' : envKey ? 'environment' : 'none',
    });
  }));

  router.put('/replicate-api-key', asyncHandler(async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      db.prepare("DELETE FROM settings WHERE key = 'replicate_api_key'").run();
      logger.info('settings', 'Replicate API key removed');
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('replicate_api_key', ?)").run(apiKey.trim());
      logger.info('settings', 'Replicate API key updated');
    }
    res.json({ success: true });
  }));

  router.get('/openai-api-key', asyncHandler(async (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any;
    const envKey = process.env.OPENAI_API_KEY;
    res.json({
      hasApiKey: !!(row?.value || (envKey && envKey !== 'your-api-key-here')),
      source: row?.value ? 'database' : envKey ? 'environment' : 'none',
    });
  }));

  router.get('/xai-api-key', asyncHandler(async (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'xai_api_key'").get() as any;
    const envKey = process.env.XAI_API_KEY;
    res.json({
      hasApiKey: !!(row?.value || envKey),
      source: row?.value ? 'database' : envKey ? 'environment' : 'none',
    });
  }));

  router.put('/xai-api-key', asyncHandler(async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      db.prepare("DELETE FROM settings WHERE key = 'xai_api_key'").run();
      logger.info('settings', 'xAI API key removed');
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('xai_api_key', ?)").run(apiKey.trim());
      logger.info('settings', 'xAI API key updated');
    }
    res.json({ success: true });
  }));

  const GEMINI_PLACEHOLDER = 'your-api-key-here';
  const TEST_SYSTEM = 'You are a connectivity test. Reply with exactly: OK';
  const TEST_USER = 'test';

  /** Test that Prompt-API keys (Gemini / OpenAI) are valid and reachable. */
  router.post('/test-prompt-keys', asyncHandler(async (_req, res) => {
    const keys = getPromptEnricherKeys(db);
    const geminiKey = (keys.geminiApiKey || '').trim();
    const openaiKey = (keys.openaiApiKey || '').trim();
    const hasGemini = geminiKey.length > 0 && geminiKey !== GEMINI_PLACEHOLDER;
    const hasOpenai = openaiKey.length > 0 && openaiKey !== GEMINI_PLACEHOLDER;

    const result: { gemini?: { ok: boolean; error?: string }; openai?: { ok: boolean; error?: string } } = {};

    if (hasGemini) {
      try {
        const provider = new GoogleProvider(geminiKey);
        const text = await provider.enrichPrompt(TEST_SYSTEM, TEST_USER);
        result.gemini = { ok: !!text?.trim() };
      } catch (err: any) {
        const msg = err?.message ?? err?.error?.message ?? String(err);
        result.gemini = { ok: false, error: msg.slice(0, 200) };
      }
    }

    if (hasOpenai) {
      try {
        const client = new OpenAI({ apiKey: openaiKey });
        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: TEST_SYSTEM },
            { role: 'user', content: TEST_USER },
          ],
          max_tokens: 64,
        });
        const text = response.choices?.[0]?.message?.content?.trim();
        result.openai = { ok: !!text };
      } catch (err: any) {
        const msg = err?.message ?? err?.error?.message ?? String(err);
        result.openai = { ok: false, error: msg.slice(0, 200) };
      }
    }

    if (!hasGemini && !hasOpenai) {
      return res.status(400).json({
        error: 'No API key configured',
        hint: 'Add a Gemini or OpenAI API key in settings to test.',
      });
    }
    res.json(result);
  }));

  router.put('/openai-api-key', asyncHandler(async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      db.prepare("DELETE FROM settings WHERE key = 'openai_api_key'").run();
      logger.info('settings', 'OpenAI API key removed');
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('openai_api_key', ?)").run(apiKey.trim());
      logger.info('settings', 'OpenAI API key updated');
    }
    res.json({ success: true });
  }));

  router.get('/lora', asyncHandler(async (_req, res) => {
    const url = (db.prepare("SELECT value FROM settings WHERE key = 'replicate_lora_url'").get() as any)?.value ?? '';
    const trigger = (db.prepare("SELECT value FROM settings WHERE key = 'replicate_lora_trigger'").get() as any)?.value ?? '';
    const scale = (db.prepare("SELECT value FROM settings WHERE key = 'replicate_lora_scale'").get() as any)?.value ?? '1';
    res.json({
      loraUrl: url,
      loraTriggerWord: trigger,
      loraScale: scale !== '' ? parseFloat(String(scale)) : 1,
    });
  }));

  router.put('/lora', asyncHandler(async (req, res) => {
    const { loraUrl, loraTriggerWord, loraScale } = req.body;
    if (loraUrl !== undefined) {
      if (!loraUrl || typeof loraUrl !== 'string' || !loraUrl.trim()) {
        db.prepare("DELETE FROM settings WHERE key = 'replicate_lora_url'").run();
      } else {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('replicate_lora_url', ?)").run(loraUrl.trim());
      }
    }
    if (loraTriggerWord !== undefined) {
      const v = typeof loraTriggerWord === 'string' ? loraTriggerWord.trim() : '';
      if (!v) db.prepare("DELETE FROM settings WHERE key = 'replicate_lora_trigger'").run();
      else db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('replicate_lora_trigger', ?)").run(v);
    }
    if (loraScale !== undefined && loraScale !== null && loraScale !== '') {
      const num = typeof loraScale === 'number' ? loraScale : parseFloat(String(loraScale));
      if (!Number.isNaN(num)) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('replicate_lora_scale', ?)").run(String(num));
      }
    }
    logger.info('settings', 'LoRA config updated');
    res.json({ success: true });
  }));

  router.get('/providers', asyncHandler(async (_req, res) => {
    const imageProvider = (db.prepare("SELECT value FROM settings WHERE key = 'image_provider'").get() as any)?.value || 'replicate';
    const videoProvider = (db.prepare("SELECT value FROM settings WHERE key = 'video_provider'").get() as any)?.value || 'veo';
    const rawFlux = (db.prepare("SELECT value FROM settings WHERE key = 'replicate_flux_version'").get() as any)?.value;
    const replicateFluxVersion = (rawFlux === 'grok' || rawFlux === '2pro' || rawFlux === '1') ? rawFlux : '2pro';
    const availableVideoProviders = AVAILABLE_VIDEO_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      costPerSecond: p.costPerSecond,
    }));
    res.json({
      imageProvider,
      videoProvider,
      replicateFluxVersion,
      availableImageProviders: ['gemini', 'replicate'],
      availableVideoProviders,
    });
  }));

  router.put('/providers', asyncHandler(async (req, res) => {
    const { imageProvider, replicateFluxVersion, videoProvider: videoProviderBody } = req.body;
    const allowed = ['gemini', 'replicate'];
    if (imageProvider !== undefined) {
      const v = typeof imageProvider === 'string' ? imageProvider.trim() : '';
      if (!allowed.includes(v)) {
        return res.status(400).json({ error: `imageProvider must be one of: ${allowed.join(', ')}` });
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('image_provider', ?)").run(v);
      logger.info('settings', `image_provider set to ${v}`);
    }
    if (replicateFluxVersion !== undefined) {
      const fluxVal = typeof replicateFluxVersion === 'string' ? replicateFluxVersion.trim() : '';
      if (fluxVal !== '1' && fluxVal !== '2pro' && fluxVal !== 'grok') {
        return res.status(400).json({ error: 'replicateFluxVersion must be "1", "2pro", or "grok"' });
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('replicate_flux_version', ?)").run(fluxVal);
      logger.info('settings', `replicate_flux_version set to ${fluxVal}`);
    }
    if (videoProviderBody !== undefined) {
      const v = typeof videoProviderBody === 'string' ? videoProviderBody.trim() : '';
      if (!VIDEO_PROVIDER_IDS.includes(v)) {
        return res.status(400).json({ error: `videoProvider must be one of: ${VIDEO_PROVIDER_IDS.join(', ')}` });
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('video_provider', ?)").run(v);
      logger.info('settings', `video_provider set to ${v}`);
    }
    res.json({ success: true });
  }));

  router.get('/image-safety', asyncHandler(async (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_image_safety'").get() as { value?: string } | undefined;
    const fromDb = row?.value?.toLowerCase().trim();
    const fromEnv = process.env.GEMINI_IMAGE_SAFETY?.toLowerCase().trim();
    const value = fromDb ?? fromEnv ?? 'default';
    res.json({ imageSafety: value === 'relaxed' ? 'relaxed' : 'default' });
  }));

  router.put('/image-safety', asyncHandler(async (req, res) => {
    const { imageSafety } = req.body;
    const v = imageSafety?.toLowerCase().trim();
    if (v !== 'default' && v !== 'relaxed') {
      return res.status(400).json({ error: 'imageSafety must be "default" or "relaxed"' });
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_image_safety', ?)").run(v);
    logger.info('settings', `gemini_image_safety set to ${v}`);
    res.json({ imageSafety: v });
  }));

  return router;
}
