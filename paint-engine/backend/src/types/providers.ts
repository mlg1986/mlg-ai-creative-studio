export type ImageProvider = 'gemini' | 'replicate' | 'kling' | 'higgsfield';
export type VideoProvider = 'veo' | 'kling' | 'higgsfield';

export interface ImageGenerationRequest {
  prompt: string;
  referenceImages: { base64: string; mimeType: string }[];
  aspectRatio: string;
  imageSize?: string;
  sourceImage?: { base64: string; mimeType: string };
  /** 'relaxed' = less strict safety filters (only SAFETY; OTHER/RECITATION unchanged). */
  safetyLevel?: 'default' | 'relaxed';
  /** Replicate/FLUX: optional LoRA weights URL (e.g. from Fast Flux Trainer). */
  loraUrl?: string;
  /** Trigger word to activate the LoRA in the prompt. */
  loraTriggerWord?: string;
  /** LoRA strength (0–2, default 1). */
  loraScale?: number;
  /** Replicate: set to true to disable safety checker. */
  disableSafetyChecker?: boolean;
  /** Replicate: '1' = FLUX 1.1 / LoRA, '2pro' = FLUX 2 Pro with reference images, 'grok' = xAI Grok 2 Image. */
  replicateFluxVersion?: '1' | '2pro' | 'grok';
  /** Optional target pixel dimensions (e.g. from export preset). FLUX 2 Pro uses these with aspect_ratio "custom" when set. */
  targetWidth?: number;
  targetHeight?: number;
  /** Number of reference images that are motifs (last N in referenceImages). FLUX 2 Pro uses this to reserve slots for all motifs. */
  motifRefCount?: number;
  /** FLUX 2 Pro: use aspect_ratio 'match_input_image' (first input image). When true, output format matches blueprint. */
  useMatchInputImageAspect?: boolean;
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
