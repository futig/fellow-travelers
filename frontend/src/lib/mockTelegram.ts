import { mockTelegramEnv } from '@telegram-apps/sdk-react';

/** Имитация окружения Telegram для разработки в обычном браузере (VITE_MOCK_TELEGRAM=true). */
export function setupMockTelegram(): void {
  const user = { id: 99281932, first_name: 'Иван', last_name: 'Петров', username: 'ivan_petrov' };
  const initData = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'mock-query',
    hash: 'mock-hash',
    signature: 'mock-signature', // SDK v3 считает поле обязательным
  });
  mockTelegramEnv({
    launchParams: {
      tgWebAppData: initData,
      tgWebAppVersion: '8.0',
      tgWebAppPlatform: 'tdesktop',
      tgWebAppThemeParams: {},
    },
  });
}
