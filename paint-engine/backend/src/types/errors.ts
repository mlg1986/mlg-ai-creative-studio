export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(404, `${entity.toUpperCase()}_NOT_FOUND`, `${entity} with id '${id}' not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/** Extract a readable message from unknown error (API/Replicate often use detail, error.message, or string). */
export function getErrorMessage(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  const e = err as Record<string, unknown>;
  if (typeof e?.message === 'string' && e.message) {
    const msg = e.message.trim();
    if (msg.startsWith('{') && msg.includes('"error"')) {
      try {
        const parsed = JSON.parse(msg) as { error?: { message?: string } };
        if (typeof parsed?.error?.message === 'string' && parsed.error.message) return parsed.error.message;
      } catch { /* ignore */ }
    }
    return msg;
  }
  if (typeof e?.detail === 'string' && e.detail) return e.detail;
  if (e?.cause != null) {
    const causeMsg = getErrorMessage(e.cause);
    if (causeMsg !== 'Unknown error') return causeMsg;
  }
  if (e?.error && typeof (e.error as Record<string, unknown>)?.message === 'string') return (e.error as { message: string }).message;
  if (e?.body && typeof (e.body as Record<string, unknown>)?.message === 'string') return (e.body as { message: string }).message;
  try { const s = String(err); if (s && s !== '[object Object]') return s; } catch { /* ignore */ }
  return 'Unknown error';
}

/** Get HTTP status/code from API-style errors (top-level or nested under .error, or JSON in .message). */
function getErrorStatus(err: any): number | undefined {
  if (err == null) return undefined;
  let n = err?.status ?? err?.code ?? err?.error?.code ?? err?.error?.status;
  if (typeof n === 'number') return n;
  if (typeof n === 'string' && /^\d+$/.test(n)) return parseInt(n, 10);
  const msg = err?.message;
  if (typeof msg === 'string' && msg.trim().startsWith('{') && msg.includes('"error"')) {
    try {
      const parsed = JSON.parse(msg) as { error?: { code?: number; status?: string } };
      n = parsed?.error?.code ?? parsed?.error?.status;
      if (typeof n === 'number') return n;
      if (n === 'UNAVAILABLE' || n === 'RESOURCE_EXHAUSTED') return 503;
    } catch { /* ignore */ }
  }
  return undefined;
}

export class AIProviderError extends AppError {
  constructor(provider: string, operation: string, originalError: any) {
    const originalMsg = getErrorMessage(originalError);
    const message = `${provider} ${operation} failed: ${originalMsg}`;
    const status = getErrorStatus(originalError);
    const statusCode = status === 429 ? 429 : status === 503 ? 503 : 502;
    const code = status === 429 ? 'AI_RATE_LIMIT'
      : status === 503 ? 'AI_SERVICE_UNAVAILABLE'
      : originalMsg.toLowerCase().includes('safety') ? 'AI_SAFETY_BLOCK'
      : originalMsg.toLowerCase().includes('timeout') ? 'AI_TIMEOUT'
      : 'AI_PROVIDER_ERROR';
    super(statusCode, code, message, {
      provider,
      operation,
      originalMessage: originalMsg,
      originalStatus: status ?? originalError?.status,
    });
  }
}

export function isGeminiPolicyBlockError(error: unknown): error is AIProviderError {
  if (!(error instanceof AIProviderError)) return false;

  const provider = String(error.details?.provider || '').toLowerCase();
  const operation = String(error.details?.operation || '').toLowerCase();
  const originalStatus = Number(error.details?.originalStatus || 0);
  const msg = `${error.message || ''} ${error.details?.originalMessage || ''}`.toUpperCase();

  if (provider !== 'gemini' || operation !== 'image-generation') return false;
  if (originalStatus === 451) return true;

  return (
    msg.includes('RECITATION')
    || msg.includes('COPYRIGHT')
    || msg.includes('BLOCKIERT')
    || msg.includes('SAFETY')
    || msg.includes('OTHER')
  );
}

export class FileError extends AppError {
  constructor(operation: string, filePath: string, originalError: any) {
    super(500, 'FILE_ERROR', `File ${operation} failed for ${filePath}: ${originalError?.message}`);
  }
}
