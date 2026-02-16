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

export class AIProviderError extends AppError {
  constructor(provider: string, operation: string, originalError: any) {
    const message = `${provider} ${operation} failed: ${originalError?.message || 'Unknown error'}`;
    const statusCode = originalError?.status === 429 ? 429 : 502;
    const code = originalError?.status === 429 ? 'AI_RATE_LIMIT'
      : originalError?.message?.includes('safety') ? 'AI_SAFETY_BLOCK'
      : originalError?.message?.includes('timeout') ? 'AI_TIMEOUT'
      : 'AI_PROVIDER_ERROR';
    super(statusCode, code, message, {
      provider,
      operation,
      originalMessage: originalError?.message,
      originalStatus: originalError?.status,
    });
  }
}

export class FileError extends AppError {
  constructor(operation: string, filePath: string, originalError: any) {
    super(500, 'FILE_ERROR', `File ${operation} failed for ${filePath}: ${originalError?.message}`);
  }
}
