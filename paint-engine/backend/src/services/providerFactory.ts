import { AIProvider } from '../types/providers.js';
import { GoogleProvider } from './providers/google.js';

export function getImageProvider(name: string, apiKey?: string): AIProvider {
  switch (name) {
    case 'gemini': return new GoogleProvider(apiKey);
    default: return new GoogleProvider(apiKey);
  }
}

export function getVideoProvider(name: string, apiKey?: string): AIProvider {
  switch (name) {
    case 'veo': return new GoogleProvider(apiKey);
    default: return new GoogleProvider(apiKey);
  }
}
