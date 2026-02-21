import { AIProvider } from '../types/providers.js';
import { GoogleProvider } from './providers/google.js';
import { ReplicateProvider } from './providers/replicate.js';

export function getImageProvider(
  name: string,
  geminiApiKey?: string,
  replicateApiKey?: string
): AIProvider {
  switch (name) {
    case 'gemini':
      return new GoogleProvider(geminiApiKey);
    case 'replicate':
      return new ReplicateProvider(replicateApiKey, geminiApiKey);
    default:
      return new GoogleProvider(geminiApiKey);
  }
}

export interface VideoProviderKeys {
  geminiApiKey?: string;
  replicateApiKey?: string;
}

export function getVideoProvider(name: string, keys: VideoProviderKeys = {}): AIProvider {
  switch (name) {
    case 'veo':
      return new GoogleProvider(keys.geminiApiKey);
    case 'grok':
      // Grok video via Replicate (xai/grok-imagine-video) – kein separater xAI-Key nötig
      return new ReplicateProvider(keys.replicateApiKey, keys.geminiApiKey, 'grok');
    case 'replicate':
      return new ReplicateProvider(keys.replicateApiKey, keys.geminiApiKey, 'wan');
    default:
      return new GoogleProvider(keys.geminiApiKey);
  }
}
