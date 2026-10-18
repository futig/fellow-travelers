import { api } from './client';
import { mockFetchMe } from './mock';
import { ensureInitData, unwrap } from './request';
import type { components } from './schema';

export type Me = components['schemas']['Me'];

export const meQueryKey = ['me'] as const;

export async function fetchMe(): Promise<Me> {
  if (import.meta.env.VITE_MOCK_API === 'true') {
    return mockFetchMe(import.meta.env.VITE_MOCK_NO_PHONE === 'true');
  }
  ensureInitData();
  return unwrap(await api.GET('/me'));
}
