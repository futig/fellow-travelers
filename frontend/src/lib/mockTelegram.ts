import { mockTelegramEnv } from '@telegram-apps/sdk-react';
import { getDevUsers, getSelectedDevUser } from './devUsers';

const LAUNCH_PARAMS = {
  tgWebAppVersion: '8.0',
  tgWebAppPlatform: 'tdesktop',
  tgWebAppThemeParams: {},
} as const;

/**
 * Имитация окружения Telegram для разработки в обычном браузере (VITE_MOCK_TELEGRAM=true).
 *
 * С `VITE_DEV_USERS` — настоящая подписанная initData выбранного тестового пользователя
 * (бэкенд её примет), иначе — фейковые user и hash (только для VITE_MOCK_API).
 */
export function setupMockTelegram(): void {
  const devUser = getSelectedDevUser(getDevUsers());
  if (devUser) {
    // SDK v3 при разборе требует поле signature; без него mockTelegramEnv бросит исключение.
    if (!new URLSearchParams(devUser.initData).has('signature')) {
      console.warn(`Dev-пользователь «${devUser.label}»: в initData нет поля signature`);
    }
    try {
      mockTelegramEnv({
        launchParams: {
          ...LAUNCH_PARAMS,
          // Строкой, а не URLSearchParams: SDK сохранит её без перекодирования,
          // и retrieveRawInitData() вернёт ровно её (подпись считается по этой строке).
          tgWebAppData: devUser.initData,
        },
      });
    } catch {
      // Ошибка SDK содержит launch params целиком — наружу отдаём без них.
      throw new Error(`SDK отверг initData dev-пользователя «${devUser.label}»`);
    }
    return;
  }

  const user = { id: 99281932, first_name: 'Иван', last_name: 'Петров', username: 'ivan_petrov' };
  const initData = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'mock-query',
    hash: 'mock-hash',
    signature: 'mock-signature', // SDK v3 считает поле обязательным
  });
  mockTelegramEnv({ launchParams: { ...LAUNCH_PARAMS, tgWebAppData: initData } });
}
