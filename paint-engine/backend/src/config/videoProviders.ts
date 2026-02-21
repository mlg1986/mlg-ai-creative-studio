export interface VideoProviderOption {
  id: string;
  label: string;
  costPerSecond: number;
}

export const AVAILABLE_VIDEO_PROVIDERS: VideoProviderOption[] = [
  { id: 'veo', label: 'Veo 3.1 (Google)', costPerSecond: 0.75 },
  { id: 'replicate', label: 'Replicate (Veo/Wan)', costPerSecond: 0.5 },
  { id: 'grok', label: 'Grok Imagine Video (via Replicate)', costPerSecond: 0.6 },
];

export const VIDEO_PROVIDER_IDS = AVAILABLE_VIDEO_PROVIDERS.map((p) => p.id);

export function getVideoProviderOption(id: string): VideoProviderOption | undefined {
  return AVAILABLE_VIDEO_PROVIDERS.find((p) => p.id === id);
}
