/**
 * Тестовые пользователи для разработки в браузере с настоящим бэкендом.
 *
 * `VITE_DEV_USERS` пишет `python -m app.dev.users` (backend): base64url без паддинга от JSON
 * `[{"label": "...", "init_data": "<initData, подписанная BOT_TOKEN>"}]`.
 * initData не логируем; в sessionStorage храним только label выбранного пользователя.
 */

export interface DevUser {
  label: string;
  initData: string;
}

export const DEV_USER_STORAGE_KEY = 'dev:user';

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Разбор `VITE_DEV_USERS`. Пусто или ошибка формата — пустой список (с предупреждением). */
export function parseDevUsers(encoded: string | undefined): DevUser[] {
  const value = encoded?.trim();
  if (!value) return [];
  let data: unknown;
  try {
    data = JSON.parse(decodeBase64Url(value));
  } catch {
    // Само исключение не логируем: в его тексте может оказаться кусок initData.
    console.warn('VITE_DEV_USERS: не base64url-JSON, тестовые пользователи отключены');
    return [];
  }
  if (!Array.isArray(data)) {
    console.warn('VITE_DEV_USERS: ожидается массив, тестовые пользователи отключены');
    return [];
  }
  const users: DevUser[] = [];
  for (const item of data) {
    if (
      !isRecord(item) ||
      typeof item.label !== 'string' ||
      !item.label ||
      typeof item.init_data !== 'string' ||
      !item.init_data
    ) {
      console.warn('VITE_DEV_USERS: элемент без label/init_data, тестовые пользователи отключены');
      return [];
    }
    users.push({ label: item.label, initData: item.init_data });
  }
  return users;
}

/** Пользователи из env; вне dev — всегда пусто. */
export function getDevUsers(): DevUser[] {
  if (!import.meta.env.DEV) return [];
  return parseDevUsers(import.meta.env.VITE_DEV_USERS);
}

function readStoredLabel(): string | null {
  try {
    return sessionStorage.getItem(DEV_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Выбранный в этой вкладке пользователь; если не выбран или пропал из списка — первый. */
export function getSelectedDevUser(users: DevUser[]): DevUser | undefined {
  const label = readStoredLabel();
  return users.find((u) => u.label === label) ?? users[0];
}

/** Запоминает выбор в sessionStorage (своя вкладка — свой пользователь). */
export function selectDevUser(label: string): void {
  try {
    sessionStorage.setItem(DEV_USER_STORAGE_KEY, label);
  } catch {
    // storage недоступен — останется пользователь по умолчанию
  }
}
