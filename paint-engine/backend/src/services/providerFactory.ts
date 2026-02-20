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

export function getVideoProvider(name: string, apiKey?: string): AIProvider {
  switch (name) {
    case 'veo': return new GoogleProvider(apiKey);
    default: return new GoogleProvider(apiKey);
  }
}
