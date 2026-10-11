import type { components } from './schema';

export type ErrorBody = components['schemas']['Error'];

/** Ошибка API в формате контракта (`{"error": {code, message, details}}`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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

export function toApiError(status: number, body: unknown): ApiError {
  const err = (body as Partial<ErrorBody> | undefined)?.error;
  return new ApiError(
    status,
    err?.code ?? 'UNKNOWN',
    err?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.',
  );
}
