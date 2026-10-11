import createClient, { type Middleware } from 'openapi-fetch';
import { getInitDataRaw } from '../lib/telegram';
import type { paths } from './schema';

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** Добавляет `Authorization: tma <initData>`; initData передаём как есть, без разбора. */
export function createAuthMiddleware(getRaw: () => string | undefined): Middleware {
  return {
    onRequest({ request }) {
      const raw = getRaw();
      if (raw) request.headers.set('Authorization', `tma ${raw}`);
      return request;
    },
  };
}

export const api = createClient<paths>({ baseUrl: API_BASE });
api.use(createAuthMiddleware(getInitDataRaw));
