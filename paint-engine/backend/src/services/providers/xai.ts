import type {
  AIProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
  VideoGenerationRequest,
} from '../../types/providers.js';
import { AIProviderError } from '../../types/errors.js';
import { logger } from '../logger.js';
import fs from 'fs';

const XAI_VIDEO_API = 'https://api.x.ai/v1/videos';
const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 300000;

export class XaiVideoProvider implements AIProvider {
  name = 'xai';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.XAI_API_KEY || '';
  }

  async enrichPrompt(_systemPrompt: string, userPrompt: string): Promise<string> {
    return userPrompt;
  }

  async generateImage(_req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    throw new AIProviderError('xai', 'generateImage', {
      message: 'xAI video provider does not support image generation. Use Veo or Replicate for video.',
      status: 501,
    });
  }

  async analyzeImageConsistency(req: {
    image: { base64: string; mimeType: string };
    materialContext: string;
    sceneDescription?: string;
  }): Promise<string> {
    return `No errors found. (xAI video provider does not run consistency analysis.)`;
  }

  async generateVideoFromImage(req: VideoGenerationRequest): Promise<string> {
    try {
      logger.info('xai', `Generating video: ${req.durationSeconds}s`);
      const imageDataUri = `data:${req.sourceImage.mimeType};base64,${req.sourceImage.base64}`;
      const body: Record<string, unknown> = {
        model: 'grok-imagine-video',
        prompt: req.prompt,
        image_url: imageDataUri,
        duration: Math.min(15, Math.max(1, req.durationSeconds)),
        aspect_ratio: req.aspectRatio || '16:9',
        resolution: req.durationSeconds >= 8 ? '720p' : '480p',
      };
      const res = await fetch(`${XAI_VIDEO_API}/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`xAI API ${res.status}: ${errText.slice(0, 300)}`);
      }
      const data = (await res.json()) as { request_id?: string };
      const requestId = data.request_id;
      if (!requestId) {
        throw new Error('xAI API did not return request_id');
      }
      logger.info('xai', `Video job started: ${requestId}`);
      return requestId;
    } catch (error: unknown) {
      logger.error('xai', 'Video generation failed', { error: (error as Error)?.message });
      throw new AIProviderError('xai', 'generateVideoFromImage', error);
    }
  }

  async getVideoStatus(jobId: string): Promise<{ done: boolean; videoPath?: string; error?: string }> {
    try {
      const res = await fetch(`${XAI_VIDEO_API}/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return { done: false, error: `Status ${res.status}` };
      }
      const data = (await res.json()) as { status?: string; video?: { url?: string } };
      if (data.status === 'done' && data.video?.url) {
        return { done: true, videoPath: data.video.url };
      }
      if (data.status === 'expired') {
        return { done: true, error: 'Request expired' };
      }
      return { done: false };
    } catch (error: unknown) {
      logger.warn('xai', `Video status check failed for ${jobId}`, { error: (error as Error)?.message });
      return { done: false, error: (error as Error)?.message };
    }
  }

  async pollVideoUntilDone(
    operationInput: { name: string },
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<{ status: string; video?: { url: string } }> {
    const requestId = operationInput.name;
    const startTime = Date.now();
    let pollCount = 0;
    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const status = await this.getVideoStatus(requestId);
      if (status.done) {
        if (status.error) {
          throw new AIProviderError('xai', 'video-polling', {
            message: status.error,
            status: 408,
          });
        }
        const res = await fetch(`${XAI_VIDEO_API}/${requestId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        const data = (await res.json()) as { status: string; video?: { url: string } };
        logger.info('xai', `Video ready after ${pollCount} polls`);
        return data;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new AIProviderError('xai', 'video-polling', {
      message: `Video generation timed out after ${timeoutMs / 1000}s`,
      status: 408,
    });
  }

  async downloadVideo(operation: { video?: { url?: string } }, downloadPath: string): Promise<void> {
    const url = operation.video?.url;
    if (!url) {
      throw new AIProviderError('xai', 'downloadVideo', {
        message: 'No video URL in operation response',
        status: 422,
      });
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Download ${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(downloadPath, buf);
      logger.info('xai', `Video downloaded to ${downloadPath}`);
    } catch (error: unknown) {
      logger.error('xai', 'Video download failed', { error: (error as Error)?.message });
      throw new AIProviderError('xai', 'downloadVideo', error);
    }
  }
}
