import { describe, expect, it } from 'vitest';
import type { MiddlewareCallbackParams } from 'openapi-fetch';
import { createAuthMiddleware } from './client';
import { isUnauthorized, NoInitDataError, toApiError } from './errors';

function run(raw: string | undefined) {
  const request = new Request('http://localhost/api/v1/me');
  const mw = createAuthMiddleware(() => raw);
  return mw.onRequest!({ request } as MiddlewareCallbackParams);
}

describe('auth middleware', () => {
  it('ставит Authorization: tma <raw> без изменений', async () => {
    const raw = 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc';
    const result = (await run(raw)) as Request;
    expect(result.headers.get('Authorization')).toBe(`tma ${raw}`);
  });

  it('без initData заголовок не ставится', async () => {
    const result = (await run(undefined)) as Request;
    expect(result.headers.has('Authorization')).toBe(false);
  });
});

describe('errors', () => {
  it('разбирает формат ошибки контракта', () => {
    const err = toApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Нет доступа', details: null },
    });
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Нет доступа');
    expect(isUnauthorized(err)).toBe(true);
  });

  it('тело не по формату → запасное сообщение', () => {
    const err = toApiError(500, undefined);
    expect(err.code).toBe('UNKNOWN');
    expect(isUnauthorized(err)).toBe(false);
  });

  it('отсутствие initData — тоже «откройте из Telegram»', () => {
    expect(isUnauthorized(new NoInitDataError())).toBe(true);
  });
});
