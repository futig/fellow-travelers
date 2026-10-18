import type { components } from './schema';

export type ErrorBody = components['schemas']['Error'];
export type ErrorCode = ErrorBody['error']['code'];

/** Ошибка API в формате контракта (`{"error": {code, message, details}}`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Ошибки по полям из `details.fields` (422 VALIDATION_ERROR). */
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Нет initData: приложение открыто не из Telegram. */
export class NoInitDataError extends Error {
  constructor() {
    super('Откройте приложение из Telegram');
    this.name = 'NoInitDataError';
  }
}

/** Нужно показать экран «Откройте приложение из Telegram». */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof NoInitDataError || (error instanceof ApiError && error.status === 401);
}

/** Ошибка API с данным кодом (`isApiErrorCode(e, 'APPLICATION_LOCKED')`). */
export function isApiErrorCode(error: unknown, code: ErrorCode): error is ApiError {
  return error instanceof ApiError && error.code === code;
}

/** Повторять запрос только при сетевых ошибках и 5xx, не больше 2 раз. 4xx не повторяем. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NoInitDataError) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

function parseFields(details: unknown): Record<string, string> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const fields = (details as { fields?: unknown }).fields;
  if (!fields || typeof fields !== 'object') return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function toApiError(status: number, body: unknown): ApiError {
  const err = (body as Partial<ErrorBody> | undefined)?.error;
  return new ApiError(
    status,
    err?.code ?? 'UNKNOWN',
    err?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.',
    parseFields(err?.details),
  );
}
