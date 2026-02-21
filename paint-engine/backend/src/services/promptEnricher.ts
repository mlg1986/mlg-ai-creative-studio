import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { GoogleProvider } from './providers/google.js';
import { logger } from './logger.js';

export type PromptEnricherKeys = {
  geminiApiKey?: string;
  openaiApiKey?: string;
};

export function getPromptEnricherKeys(db: Database.Database): PromptEnricherKeys {
  const geminiApiKey = (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as { value?: string } | undefined)?.value
    || process.env.GEMINI_API_KEY
    || '';
  const openaiApiKey = (db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as { value?: string } | undefined)?.value
    || process.env.OPENAI_API_KEY
    || '';
  return { geminiApiKey, openaiApiKey };
}

/** Enricher aus DB-Konfiguration (für Video-Route etc.). */
export function getPromptEnricherForDb(db: Database.Database) {
  return getPromptEnricher(getPromptEnricherKeys(db));
}

const GEMINI_PLACEHOLDER = 'your-api-key-here';

async function enrichWithOpenAI(client: OpenAI, systemPrompt: string, userPrompt: string): Promise<string> {
  logger.info('openai', 'Enriching prompt via ChatGPT (Scene Intelligence)');
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2048,
  });
  const text = response.choices?.[0]?.message?.content?.trim() ?? '';
  logger.info('openai', `Enriched prompt generated (${text.length} chars)`);
  return text;
}

/** Returns a prompt enricher: prefers Gemini, falls back to ChatGPT when Gemini fails and OpenAI key is set. */
export function getPromptEnricher(keys: PromptEnricherKeys): {
  enrichPrompt(systemPrompt: string, userPrompt: string): Promise<string>;
  source: 'gemini' | 'openai';
} {
  const geminiKey = (keys.geminiApiKey || '').trim();
  const openaiKey = (keys.openaiApiKey || '').trim();
  const useGemini = geminiKey.length > 0 && geminiKey !== GEMINI_PLACEHOLDER;
  const useOpenai = openaiKey.length > 0 && openaiKey !== GEMINI_PLACEHOLDER;

  if (useGemini && useOpenai) {
    const provider = new GoogleProvider(geminiKey);
    const openaiClient = new OpenAI({ apiKey: openaiKey });
    return {
      source: 'gemini',
      async enrichPrompt(systemPrompt: string, userPrompt: string) {
        try {
          return await provider.enrichPrompt(systemPrompt, userPrompt);
        } catch (err: any) {
          logger.warn('promptEnricher', 'Gemini failed, falling back to ChatGPT', { error: err?.message });
          return enrichWithOpenAI(openaiClient, systemPrompt, userPrompt);
        }
      },
    };
  }

  if (useGemini) {
    const provider = new GoogleProvider(geminiKey);
    return {
      source: 'gemini',
      async enrichPrompt(systemPrompt: string, userPrompt: string) {
        return provider.enrichPrompt(systemPrompt, userPrompt);
      },
    };
  }

  if (useOpenai) {
    const client = new OpenAI({ apiKey: openaiKey });
    return {
      source: 'openai',
      async enrichPrompt(systemPrompt: string, userPrompt: string) {
        try {
          return await enrichWithOpenAI(client, systemPrompt, userPrompt);
        } catch (error: any) {
          logger.error('openai', 'Scene Intelligence failed', { error: error?.message });
          throw error;
        }
      },
    };
  }

  throw new Error(
    'Für die Prompt-Generierung (Scene Intelligence) wird ein API-Key benötigt. ' +
    'Bitte in den Einstellungen entweder einen Gemini- oder einen OpenAI-API-Key eintragen.'
  );
}
