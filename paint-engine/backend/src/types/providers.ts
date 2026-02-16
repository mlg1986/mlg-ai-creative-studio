export type ImageProvider = 'gemini' | 'kling' | 'higgsfield';
export type VideoProvider = 'veo' | 'kling' | 'higgsfield';

export interface ImageGenerationRequest {
  prompt: string;
  referenceImages: { base64: string; mimeType: string }[];
  aspectRatio: string;
  imageSize?: string;
  sourceImage?: { base64: string; mimeType: string };
}

export interface ImageGenerationResult {
  imageBase64: string;
  mimeType: string;
  provider: ImageProvider;
  cost?: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  sourceImage: { base64: string; mimeType: string };
  aspectRatio: string;
  durationSeconds: number;
  style?: string;
  negativePrompt?: string;
}

export interface VideoGenerationResult {
  videoPath: string;
  provider: VideoProvider;
  durationSeconds: number;
  cost?: number;
}

export interface AIProvider {
  name: string;
  generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult>;
  generateVideoFromImage(req: VideoGenerationRequest): Promise<string>;
  getVideoStatus(jobId: string): Promise<{ done: boolean; videoPath?: string; error?: string }>;
  enrichPrompt(systemPrompt: string, userPrompt: string): Promise<string>;
  analyzeImageConsistency(req: { image: { base64: string, mimeType: string }, materialContext: string, sceneDescription?: string }): Promise<string>;
}
