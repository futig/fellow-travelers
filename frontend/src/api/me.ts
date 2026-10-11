import { getInitDataRaw } from '../lib/telegram';
import { api } from './client';
import { NoInitDataError, toApiError } from './errors';
import { mockFetchMe } from './mock';
import type { components } from './schema';

export type Me = components['schemas']['Me'];

export const meQueryKey = ['me'] as const;

export async function fetchMe(): Promise<Me> {
  if (import.meta.env.VITE_MOCK_API === 'true') {
    return mockFetchMe(import.meta.env.VITE_MOCK_NO_PHONE === 'true');
  }
  if (!getInitDataRaw()) throw new NoInitDataError();

  const { data, error, response } = await api.GET('/me');
  if (data) return data;
  throw toApiError(response.status, error);
}
