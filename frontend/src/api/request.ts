import { getInitDataRaw } from '../lib/telegram';
import { NoInitDataError, toApiError } from './errors';

/** Без initData запрос заведомо получит 401 — сразу показываем «Откройте из Telegram». */
export function ensureInitData(): void {
  if (!getInitDataRaw()) throw new NoInitDataError();
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Данные успешного ответа openapi-fetch или `ApiError` по телу ошибки. */
export function unwrap<T>({ data, error, response }: FetchResult<T>): T {
  if (response.ok) return data as T;
  throw toApiError(response.status, error);
}
