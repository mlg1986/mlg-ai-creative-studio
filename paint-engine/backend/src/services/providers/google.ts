import { GoogleGenAI } from '@google/genai';
import { AIProvider, ImageGenerationRequest, ImageGenerationResult, VideoGenerationRequest } from '../../types/providers.js';
import { AIProviderError } from '../../types/errors.js';
import { logger } from '../logger.js';

export class GoogleProvider implements AIProvider {
  name = 'google';
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async enrichPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      logger.info('gemini', 'Enriching prompt via Scene Intelligence');
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      });
      const text = response.text || '';
      logger.info('gemini', `Enriched prompt generated (${text.length} chars)`);
      return text;
    } catch (error: any) {
      logger.error('gemini', 'Scene Intelligence failed', { error: error?.message });
      throw new AIProviderError('gemini', 'enrichPrompt', error);
    }
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    try {
      logger.info('gemini', `Generating image with ${req.referenceImages.length} reference images, aspect=${req.aspectRatio}`);

      const imageParts = req.referenceImages.slice(0, 14).map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
      }));

      const parts: any[] = [];

      if (req.sourceImage) {
        logger.info('gemini', 'Including source image for Image-to-Image refinement');
        parts.push({ text: "SOURCE IMAGE (This is the existing image that MUST be modified/refined as requested):" });
        parts.push({
          inlineData: { mimeType: req.sourceImage.mimeType, data: req.sourceImage.base64 },
        });
        parts.push({ text: "\n---" });
      }

      if (imageParts.length > 0) {
        parts.push({ text: "REFERENCE IMAGES (Use these as examples for material appearance, textures, and style. DO NOT copy their composition - ONLY their physical properties):" });
        parts.push(...imageParts);
        parts.push({ text: "\n---" });
      }

      parts.push({ text: "FINAL GENERATION INSTRUCTIONS AND PROMPT:" });
      parts.push({ text: req.prompt + "\n\nCRITICAL: Your response must be a single image. Do not reply with text only. Output the generated or edited image." });

      logger.info('gemini', `Calling generateContent with ${parts.length} parts. SourceImage: ${!!req.sourceImage}, RefImages: ${imageParts.length}`);
      parts.forEach((p, idx) => {
        if (p.text) logger.debug('gemini', `Part ${idx} (text): ${p.text.slice(0, 50)}...`);
        if (p.inlineData) logger.debug('gemini', `Part ${idx} (image): ${p.inlineData.mimeType}, size: ${p.inlineData.data.length}`);
      });

      const config = {
        responseModalities: ['image', 'text'] as any,
        imageConfig: {
          aspectRatio: req.aspectRatio as any,
          imageSize: (req.imageSize || '2K') as any,
        },
      } as any;

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts,
        }],
        config,
      });

      const candidates = (response as any).candidates;
      if (!candidates?.length) {
        throw new AIProviderError('gemini', 'image-generation', {
          message: 'No candidates in response (possibly safety block)',
          status: 422,
        });
      }

      const candidate = candidates[0];
      if (candidate.finishReason === 'SAFETY') {
        throw new AIProviderError('gemini', 'image-generation', {
          message: `Safety block: ${JSON.stringify(candidate.safetyRatings)}`,
          status: 451,
        });
      }

      const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
      if (!imagePart) {
        throw new AIProviderError('gemini', 'image-extraction', {
          message: 'Response contains no image (text only)',
          status: 422,
        });
      }

      logger.info('gemini', 'Image generated successfully');
      return {
        imageBase64: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType || 'image/png',
        provider: 'gemini',
        cost: 0.04,
      };
    } catch (error: any) {
      if (error instanceof AIProviderError) throw error;
      logger.error('gemini', 'Image generation failed', { error: error?.message });
      throw new AIProviderError('gemini', 'generateImage', error);
    }
  }

  async generateVideoFromImage(req: VideoGenerationRequest): Promise<string> {
    try {
      logger.info('gemini', `Generating video: ${req.durationSeconds}s, style=${req.style}`);

      const operation = await this.ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: req.prompt,
        image: {
          imageBytes: req.sourceImage.base64,
          mimeType: req.sourceImage.mimeType as any,
        },
        config: {
          aspectRatio: req.aspectRatio as any,
          durationSeconds: String(req.durationSeconds) as any,
          resolution: req.durationSeconds === 8 ? '1080p' as any : undefined,
          negativePrompt: req.negativePrompt || 'blurry, low quality, text artifacts, watermark, unrealistic proportions',
          personGeneration: 'allow_adult' as any,
        },
      } as any);

      const opName = (operation as any).name || (operation as any).operationName || JSON.stringify(operation).slice(0, 100);
      logger.info('gemini', `Video job started: ${opName}`);
      return opName;
    } catch (error: any) {
      logger.error('gemini', 'Video generation failed', { error: error?.message });
      throw new AIProviderError('gemini', 'generateVideoFromImage', error);
    }
  }

  async getVideoStatus(jobId: string): Promise<{ done: boolean; videoPath?: string; error?: string }> {
    try {
      const operation = await (this.ai as any).operations.getVideosOperation({ name: jobId });
      if (operation.done) {
        const video = operation.response?.generatedVideos?.[0]?.video;
        if (video) {
          return { done: true, videoPath: video.uri || video.name };
        }
        return { done: true, error: 'No video in response' };
      }
      return { done: false };
    } catch (error: any) {
      logger.warn('veo', `Video status check failed for ${jobId}`, { error: error?.message });
      return { done: false, error: error?.message };
    }
  }

  async downloadVideo(operation: any, downloadPath: string): Promise<void> {
    try {
      const video = operation.response?.generatedVideos?.[0]?.video;
      if (video) {
        await (this.ai as any).files.download({ file: video, downloadPath });
        logger.info('veo', `Video downloaded to ${downloadPath}`);
      }
    } catch (error: any) {
      logger.error('veo', 'Video download failed', { error: error?.message });
      throw new AIProviderError('veo', 'downloadVideo', error);
    }
  }

  async pollVideoUntilDone(operationInput: any, timeoutMs = 300000): Promise<any> {
    const startTime = Date.now();
    let pollCount = 0;
    let operation = operationInput;

    while (!operation.done) {
      if (Date.now() - startTime > timeoutMs) {
        throw new AIProviderError('veo', 'video-polling', {
          message: `Video generation timed out after ${timeoutMs / 1000}s (${pollCount} polls)`,
          status: 408,
        });
      }

      pollCount++;
      const delay = Math.min(10000, 5000 + pollCount * 1000);
      logger.debug('veo', `Polling attempt ${pollCount}, next in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));

      try {
        operation = await (this.ai as any).operations.getVideosOperation({ operation });
      } catch (error: any) {
        logger.warn('veo', `Polling error (attempt ${pollCount})`, { error: error?.message });
      }
    }

    logger.info('veo', `Video ready after ${pollCount} polls (${(Date.now() - startTime) / 1000}s)`);
    return operation;
  }

  async analyzeImageConsistency(req: { image: { base64: string, mimeType: string }, materialContext: string, sceneDescription?: string }): Promise<string> {
    try {
      logger.info('gemini', 'Analyzing image consistency via Vision Correction');
      const systemPrompt = `You are a "Vision Correction Specialist" for a paint-by-numbers brand called "malango".
Your task is to analyze a generated product photo and compare it EXTREMELY CRITICALLY against the provided material specifications and scene description.

Look for these specific errors:
1. PAINT POT LABELS (TIEGEL): Every paint pot MUST have a white round label on the lid with a clearly printed black number (e.g., "1", "2", "15"). Report if they are missing, blurry, or show wrong characters.
2. CANVAS (LEINWAND): Ensure the canvas is not painted on the back. The front has the white surface. Ensure the motif is on the front.
3. PROPORTIONS: Small items (pots ~2cm) must look small relative to large canvases (40x50cm).
4. PHYSICAL INCONSISTENCIES: Report unrealistic reflections, floating objects, impossible shadows, or merged textures. Everything must look photorealistic and physically correct.
5. MATERIAL FIDELITY: Ensure plastic looks like plastic, wood like wood, and bristles like bristles.
6. COMPOSITION: Check if objects are cut off unnaturally.

Output ONLY a concise list (bullet points) of errors found in English. If the image is perfect, output "No errors found."
Be very strict. Your feedback will be used to automatically fix the image.`;

      const userPrompt = `Material Context:
${req.materialContext}

Scene Description:
${req.sceneDescription || 'No description provided.'}

Please analyze the attached image for consistency errors with these materials.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` },
            { inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } }
          ]
        }],
      });

      const text = response.text || 'No errors found.';
      logger.info('gemini', `Vision analysis completed (${text.length} chars)`);
      return text;
    } catch (error: any) {
      logger.error('gemini', 'Vision analysis failed', { error: error?.message });
      throw new AIProviderError('gemini', 'analyzeImageConsistency', error);
    }
  }
}
