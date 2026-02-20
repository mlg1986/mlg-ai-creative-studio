import Replicate from 'replicate';
import sharp from 'sharp';
import {
  AIProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
  VideoGenerationRequest,
} from '../../types/providers.js';
import { AIProviderError } from '../../types/errors.js';
import { logger } from '../logger.js';
import { GoogleProvider } from './google.js';

/** Max size for each reference image data URI to stay under Replicate/Cloudflare limits (~1MB per file recommended). */
const MAX_REF_IMAGE_BYTES = 800 * 1024;
const MAX_REF_IMAGE_DIMENSION = 1024;

/** FLUX 2 Pro: total input + output must be ≤ 9MP. With 8 refs and ~2MP output, refs must stay under ~7MP total → ~0.85 MP per ref. */
const FLUX2_REF_MAX_MP = 0.85;
const FLUX2_REF_MAX_DIMENSION = Math.floor(Math.sqrt(FLUX2_REF_MAX_MP * 1e6));

/** Map our aspect ratio strings to Replicate FLUX 1.1 format. */
const ASPECT_RATIO_MAP: Record<string, string> = {
  '1:1': '1:1',
  '3:4': '3:4',
  '4:3': '4:3',
  '9:16': '9:16',
  '16:9': '16:9',
  '2:3': '2:3',
  '3:2': '3:2',
  '21:9': '21:9',
  '9:21': '9:21',
};

/** FLUX 2 Pro only allows: match_input_image, custom, 1:1, 16:9, 3:2, 2:3, 4:5, 5:4, 9:16, 3:4, 4:3. Map unsupported to nearest. */
const FLUX2_ASPECT_RATIO_MAP: Record<string, string> = {
  '1:1': '1:1',
  '3:4': '3:4',
  '4:3': '4:3',
  '9:16': '9:16',
  '16:9': '16:9',
  '2:3': '2:3',
  '3:2': '3:2',
  '4:5': '4:5',
  '5:4': '5:4',
  '21:9': '16:9',
  '9:21': '9:16',
};

const FLUX2_MIN_DIM = 256;
const FLUX2_MAX_DIM = 1440;
const FLUX2_ALIGN = 32;

/** Max reference images to send to Grok when the Replicate schema supports image inputs. */
const GROK_MAX_REFERENCE_IMAGES = 10;

const GROK_MODEL = 'xai/grok-2-image';
/**
 * Timeout for Grok client.run(). Replicate often needs long: cold start (GPU spin-up), queue, slow inference.
 * Replicate allows Prefer: wait=x only between 1 and 60 seconds; we use 60. Client-side we still wait up to 6 min.
 */
const GROK_RUN_TIMEOUT_MS = 360_000;
/** Replicate API allows max 60 for Prefer: wait=x. */
const GROK_SERVER_WAIT_SEC = 60;

/** Round to multiple of 32 and clamp to [256, 1440] for FLUX 2 Pro custom dimensions. */
function toFlux2Dimension(n: number): number {
  const clamped = Math.max(FLUX2_MIN_DIM, Math.min(FLUX2_MAX_DIM, n));
  return Math.round(clamped / FLUX2_ALIGN) * FLUX2_ALIGN;
}

export class ReplicateProvider implements AIProvider {
  name = 'replicate';
  private client: Replicate;
  private geminiProvider: GoogleProvider;

  constructor(replicateApiKey?: string, geminiApiKey?: string) {
    const token = replicateApiKey || process.env.REPLICATE_API_TOKEN || '';
    if (!token) {
      logger.warn('replicate', 'No Replicate API token; image generation will fail.');
    }
    this.client = new Replicate({ auth: token });
    this.geminiProvider = new GoogleProvider(geminiApiKey);
  }

  async enrichPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.geminiProvider.enrichPrompt(systemPrompt, userPrompt);
  }

  async analyzeImageConsistency(req: {
    image: { base64: string; mimeType: string };
    materialContext: string;
    sceneDescription?: string;
  }): Promise<string> {
    return this.geminiProvider.analyzeImageConsistency(req);
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    try {
      const aspectRatio = ASPECT_RATIO_MAP[req.aspectRatio] || '3:2';
      const disableSafety = req.disableSafetyChecker !== false;
      const useFlux2Pro = req.replicateFluxVersion === '2pro';
      const useGrok = req.replicateFluxVersion === 'grok';

      // #region agent log
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:generateImage',message:'branch check',data:{replicateFluxVersion:req.replicateFluxVersion,useFlux2Pro,useGrok},hypothesisId:'A',timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (useFlux2Pro) {
        return this.generateImageFlux2Pro(req, aspectRatio, disableSafety);
      }
      if (useGrok) {
        return this.generateImageGrok(req, aspectRatio);
      }

      let prompt = req.prompt;
      if (req.loraTriggerWord && !prompt.includes(req.loraTriggerWord)) {
        prompt = `${req.loraTriggerWord} ${prompt}`;
      }

      const useLora = !!req.loraUrl?.trim();
      const model = useLora
        ? 'black-forest-labs/flux-schnell-lora:3989603b9238a2265a81319fd064818cac63c53620f37674c32959a04cfb6f5e'
        : 'black-forest-labs/flux-1.1-pro:f421a3325339ea944e320ef532d251dda16edd5bcf3207bf3385d81fdb6a635d';

      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: 'png',
        safety_tolerance: disableSafety ? 6 : 2,
      };

      if (useLora) {
        input.lora_weights = req.loraUrl;
        input.lora_scale = req.loraScale ?? 1.0;
      }

      logger.info('replicate', `Generating image with ${model.split('/')[1]} (LoRA: ${useLora}), aspect=${aspectRatio}`);
      const output = await this.client.run(model as `${string}/${string}:${string}`, { input });

      const url = this.getOutputUrl(output);
      if (!url) {
        throw new AIProviderError('replicate', 'generateImage', {
          message: 'Replicate returned no image URL',
          status: 422,
        });
      }

      const imageBase64 = await this.fetchAsBase64(url);
      logger.info('replicate', 'Image generated successfully');
      return {
        imageBase64,
        mimeType: 'image/png',
        provider: 'replicate',
        cost: 0.04,
      };
    } catch (error: unknown) {
      if (error instanceof AIProviderError) throw error;
      const err = error as Record<string, unknown>;
      const msg = err?.message ?? err?.detail ?? (typeof err?.toString === 'function' ? err.toString() : String(error));
      logger.error('replicate', 'Image generation failed', {
        error: msg,
        detail: err?.detail,
        status: err?.status,
        cause: err?.cause != null ? String((err.cause as Error)?.message ?? err.cause) : undefined,
      });
      throw new AIProviderError('replicate', 'generateImage', error);
    }
  }

  /**
   * Compress a reference image to stay under Replicate payload limits (data URIs < 1MB recommended).
   * Resizes to max 1024px and re-encodes as JPEG so the request body does not trigger 413.
   */
  private async compressReferenceImage(img: { base64: string; mimeType: string }): Promise<string> {
    try {
      const buf = Buffer.from(img.base64, 'base64');
      if (buf.length <= MAX_REF_IMAGE_BYTES) {
        const resized = await sharp(buf)
          .resize(MAX_REF_IMAGE_DIMENSION, MAX_REF_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        if (resized.length <= MAX_REF_IMAGE_BYTES) {
          return `data:image/jpeg;base64,${resized.toString('base64')}`;
        }
      }
      let out = await sharp(buf)
        .resize(MAX_REF_IMAGE_DIMENSION, MAX_REF_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      for (let q = 78; q >= 60 && out.length > MAX_REF_IMAGE_BYTES; q -= 8) {
        out = await sharp(buf)
          .resize(MAX_REF_IMAGE_DIMENSION, MAX_REF_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: q })
          .toBuffer();
      }
      return `data:image/jpeg;base64,${out.toString('base64')}`;
    } catch (e) {
      logger.warn('replicate', 'Reference image compress failed, using original', { error: (e as Error).message });
      return `data:${img.mimeType};base64,${img.base64}`;
    }
  }

  /**
   * Compress reference image for FLUX 2 Pro so total ref megapixels stay under 9MP limit (output + refs).
   * Resizes to max FLUX2_REF_MAX_DIMENSION per side (~922px → ~0.85 MP per image) so 8 refs ≈ 6.8 MP.
   */
  private async compressReferenceImageForFlux2Pro(img: { base64: string; mimeType: string }): Promise<string> {
    try {
      const buf = Buffer.from(img.base64, 'base64');
      let out = await sharp(buf)
        .resize(FLUX2_REF_MAX_DIMENSION, FLUX2_REF_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      if (out.length > MAX_REF_IMAGE_BYTES) {
        out = await sharp(buf)
          .resize(FLUX2_REF_MAX_DIMENSION, FLUX2_REF_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
      }
      return `data:image/jpeg;base64,${out.toString('base64')}`;
    } catch (e) {
      logger.warn('replicate', 'FLUX2 ref compress failed, using standard compress', { error: (e as Error).message });
      return this.compressReferenceImage(img);
    }
  }

  private async generateImageFlux2Pro(
    req: ImageGenerationRequest,
    aspectRatio: string,
    disableSafety: boolean
  ): Promise<ImageGenerationResult> {
    const flux2ProModel = 'black-forest-labs/flux-2-pro:2aea458694efeca3600b4d5775dedce6ee5a971c7b80ccd5ca3bd0b3b93beb00';
    // Backend already sends at most 8 refs in priority order (Blueprint → ExtraRefs → Motifs → Materials); use as-is
    const refs = (req.referenceImages ?? []).slice(0, 8);
    const inputImages: string[] = [];
    for (const img of refs) {
      inputImages.push(await this.compressReferenceImageForFlux2Pro(img));
    }

    let flux2Aspect: string;
    let customWidth: number | undefined;
    let customHeight: number | undefined;

    if (req.targetWidth != null && req.targetHeight != null && req.targetWidth > 0 && req.targetHeight > 0) {
      let w = req.targetWidth;
      let h = req.targetHeight;
      if (w > FLUX2_MAX_DIM || h > FLUX2_MAX_DIM) {
        const scale = Math.min(FLUX2_MAX_DIM / w, FLUX2_MAX_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      customWidth = toFlux2Dimension(w);
      customHeight = toFlux2Dimension(h);
      flux2Aspect = 'custom';
    } else if (req.useMatchInputImageAspect && refs.length > 0) {
      flux2Aspect = 'match_input_image';
    } else {
      flux2Aspect = FLUX2_ASPECT_RATIO_MAP[aspectRatio] ?? '3:2';
    }

    const input: Record<string, unknown> = {
      prompt: req.prompt,
      aspect_ratio: flux2Aspect,
      output_format: 'png',
      safety_tolerance: disableSafety ? 5 : 2,
      input_images: inputImages,
    };
    if (flux2Aspect === 'custom' && customWidth != null && customHeight != null) {
      input.width = customWidth;
      input.height = customHeight;
    }

    logger.info('replicate', `Generating image with flux-2-pro, refImages=${inputImages.length}, aspect=${flux2Aspect}${customWidth != null ? `, ${customWidth}x${customHeight}` : ''}`);
    const output = await this.client.run(flux2ProModel as `${string}/${string}:${string}`, { input });

    const url = this.getOutputUrl(output);
    if (!url) {
      throw new AIProviderError('replicate', 'generateImage', {
        message: 'Replicate FLUX 2 Pro returned no image URL',
        status: 422,
      });
    }

    const imageBase64 = await this.fetchAsBase64(url);
    logger.info('replicate', 'FLUX 2 Pro image generated successfully');
    return {
      imageBase64,
      mimeType: 'image/png',
      provider: 'replicate',
      cost: 0.08,
    };
  }

  /** Human-readable aspect ratio hint for prompt (e.g. "16:9 (landscape)"). */
  private static grokAspectRatioHint(aspectRatio: string): string {
    const hints: Record<string, string> = {
      '1:1': '1:1 (square)',
      '16:9': '16:9 (landscape, widescreen)',
      '9:16': '9:16 (portrait, stories)',
      '4:3': '4:3 (landscape)',
      '3:4': '3:4 (portrait)',
      '3:2': '3:2 (landscape)',
      '2:3': '2:3 (portrait)',
      '21:9': '21:9 (ultra-wide landscape)',
      '9:21': '9:21 (ultra-wide portrait)',
    };
    return hints[aspectRatio] || `${aspectRatio}`;
  }

  /**
   * Generate image via xAI Grok 2 Image on Replicate.
   * Replicate schema only accepts `prompt`; size/format is passed as text in the prompt so the model outputs the right aspect ratio.
   */
  private async generateImageGrok(req: ImageGenerationRequest, aspectRatio: string): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:generateImageGrok',message:'entry',data:{promptLen:req.prompt?.length},hypothesisId:'A',timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const sizeHint = ReplicateProvider.grokAspectRatioHint(aspectRatio);
    const promptWithSize = `${req.prompt.trim()}\n\nOutput image format: aspect ratio ${sizeHint}. Generate the image in this exact format and proportions.`;
    const input: Record<string, unknown> = {
      prompt: promptWithSize,
    };
    logger.info('replicate', 'GROK_IMAGE_START', { aspectRatio, startedAt: new Date().toISOString() });

    let output: unknown;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:beforeRun',message:'before client.run',data:{model:GROK_MODEL},hypothesisId:'B',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const runPromise = this.client.run(GROK_MODEL as `${string}/${string}:${string}`, {
        input,
        wait: { mode: 'block', timeout: GROK_SERVER_WAIT_SEC },
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Grok image generation timed out after ${GROK_RUN_TIMEOUT_MS / 1000} seconds. Replicate or the model may be overloaded; try again or use FLUX.`)), GROK_RUN_TIMEOUT_MS);
      });
      output = await Promise.race([runPromise, timeoutPromise]);
      // #region agent log
      const outType = output === null ? 'null' : Array.isArray(output) ? 'array' : typeof output;
      const outLen = Array.isArray(output) ? (output as unknown[]).length : 0;
      const firstType = Array.isArray(output) && (output as unknown[]).length > 0 ? typeof (output as unknown[])[0] : 'n/a';
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:afterRun',message:'after client.run',data:{outType,outLen,firstType},hypothesisId:'C',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (runErr: unknown) {
      const runErrMsg = runErr instanceof Error ? runErr.message : String(runErr);
      // #region agent log
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:runCatch',message:'client.run threw',data:{error:runErrMsg},hypothesisId:'B',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      logger.error('replicate', 'GROK_IMAGE_RUN_ERROR', { error: runErrMsg, detail: (runErr as Record<string, unknown>)?.detail });
      throw runErr;
    }

    const runDurationMs = Date.now() - startTime;
    logger.info('replicate', 'GROK_IMAGE_RUN_DONE', { durationMs: runDurationMs, durationSec: Math.round(runDurationMs / 1000) });

    const url = this.getOutputUrl(output);
    // #region agent log
    fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:getOutputUrl',message:'getOutputUrl result',data:{hasUrl:!!url,urlPrefix:url?url.slice(0,50):null},hypothesisId:'D',timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!url) {
      const outputType = output === null ? 'null' : Array.isArray(output) ? `array[${(output as unknown[]).length}]` : typeof output;
      const sample = this.safeOutputSample(output);
      logger.error('replicate', 'GROK_IMAGE_NO_URL', { outputType, sample });
      throw new AIProviderError('replicate', 'generateImage', {
        message: `Replicate Grok 2 Image returned no image URL (output type: ${outputType}). Check logs for GROK_IMAGE_NO_URL.`,
        status: 422,
      });
    }

    try {
      // #region agent log
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:beforeFetch',message:'before fetchAsBase64',data:{urlLen:url?.length},hypothesisId:'E',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const imageBase64 = await this.fetchAsBase64(url);
      const totalDurationMs = Date.now() - startTime;
      logger.info('replicate', 'Grok 2 Image generated successfully', { totalDurationMs, totalDurationSec: Math.round(totalDurationMs / 1000) });
      return {
        imageBase64,
        mimeType: 'image/png',
        provider: 'replicate',
        cost: 0.07,
      };
    } catch (fetchErr: unknown) {
      // #region agent log
      const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      fetch('http://127.0.0.1:7441/ingest/66a1401c-9e23-49e6-9e34-d291391eeab3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'206657'},body:JSON.stringify({sessionId:'206657',location:'replicate.ts:fetchCatch',message:'fetchAsBase64 threw',data:{error:fetchErrMsg},hypothesisId:'E',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw fetchErr;
    }
  }

  /** Safe sample of output for logging (avoid huge strings). */
  private safeOutputSample(output: unknown): string {
    if (output == null) return 'null';
    if (Array.isArray(output)) {
      const first = output[0];
      if (first != null && typeof (first as { url?: unknown }).url === 'function') {
        try {
          return `[FileOutput.url()=>${String((first as { url(): string }).url()).slice(0, 80)}...]`;
        } catch {
          return `[array length=${output.length}]`;
        }
      }
      return `[array length=${output.length}, first=${typeof first}]`;
    }
    const o = output as Record<string, unknown>;
    if (typeof o.url === 'function') {
      try { return `url()=>${String((o.url as () => string)()).slice(0, 80)}...`; } catch { return 'url() throws'; }
    }
    return `{${Object.keys(o).slice(0, 5).join(',')}}`;
  }

  private getOutputUrl(output: unknown): string | null {
    if (typeof output === 'string' && (output.startsWith('http://') || output.startsWith('https://'))) {
      return output;
    }
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (typeof first === 'string' && (first.startsWith('http://') || first.startsWith('https://'))) return first;
      if (first && typeof (first as { url?: string }).url === 'function') {
        const u = (first as { url(): string }).url();
        return typeof u === 'string' ? u : null;
      }
      if (first && typeof (first as { url?: string }).url === 'string') {
        return (first as { url: string }).url;
      }
    }
    if (output && typeof (output as { url?: string }).url === 'function') {
      const u = (output as { url(): string }).url();
      return typeof u === 'string' ? u : null;
    }
    if (output && typeof (output as { url?: string }).url === 'string') {
      return (output as { url: string }).url;
    }
    const o = output as Record<string, unknown> | null;
    if (o?.output && typeof o.output === 'string' && (o.output.startsWith('http://') || o.output.startsWith('https://'))) {
      return o.output as string;
    }
    if (Array.isArray(o?.output) && (o!.output as unknown[]).length > 0) {
      const first = (o!.output as unknown[])[0];
      if (typeof first === 'string') return first;
    }
    return null;
  }

  private async fetchAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new AIProviderError('replicate', 'generateImage', {
        message: `Failed to download image: ${res.status} ${res.statusText}`,
        status: res.status,
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('base64');
  }

  async generateVideoFromImage(_req: VideoGenerationRequest): Promise<string> {
    throw new AIProviderError('replicate', 'video', {
      message: 'Video wird ueber Replicate nicht unterstuetzt. Bitte Veo oder Kling verwenden.',
      status: 501,
    });
  }

  async getVideoStatus(_jobId: string): Promise<{ done: boolean; videoPath?: string; error?: string }> {
    throw new AIProviderError('replicate', 'video', {
      message: 'Video wird ueber Replicate nicht unterstuetzt.',
      status: 501,
    });
  }
}
