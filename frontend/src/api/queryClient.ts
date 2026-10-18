import { QueryClient } from '@tanstack/react-query';
import { shouldRetry } from './errors';

/** Клиент с общими настройками: 4xx не повторяем, при возврате фокуса окна — перезапрос. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
