import {
  init,
  miniApp,
  openTelegramLink,
  requestContact,
  retrieveLaunchParams,
  retrieveRawInitData,
  viewport,
} from '@telegram-apps/sdk-react';

const PAGE_COLOR = '#eef2f9';

export const BOT_USERNAME: string = import.meta.env.VITE_BOT_USERNAME ?? '';

/** Инициализация SDK и оформление окна Telegram. Вне Telegram ничего не делает и не падает. */
export function initTelegram(): void {
  try {
    init();
  } catch (e) {
    console.warn('Telegram SDK не инициализирован', e);
    return;
  }
  void setupWindow();
}

async function setupWindow(): Promise<void> {
  try {
    if (miniApp.mount.isAvailable()) await miniApp.mount();
    if (miniApp.setHeaderColor.isAvailable()) miniApp.setHeaderColor(PAGE_COLOR);
    if (miniApp.setBackgroundColor.isAvailable()) miniApp.setBackgroundColor(PAGE_COLOR);
    if (miniApp.ready.isAvailable()) miniApp.ready();
  } catch (e) {
    console.warn('Не удалось настроить miniApp', e);
  }
  try {
    if (viewport.mount.isAvailable()) await viewport.mount();
    if (viewport.expand.isAvailable()) viewport.expand();
  } catch (e) {
    console.warn('Не удалось настроить viewport', e);
  }
}

/** Сырая строка `Telegram.WebApp.initData`; `undefined` вне Telegram. */
export function getInitDataRaw(): string | undefined {
  try {
    return retrieveRawInitData() || undefined;
  } catch {
    return undefined;
  }
}

export function getStartParamRaw(): string | undefined {
  try {
    return retrieveLaunchParams().tgWebAppStartParam || undefined;
  } catch {
    return undefined;
  }
}

/** `photo_url` пользователя из initData (запасной вариант аватара). */
export function getInitDataPhotoUrl(): string | undefined {
  try {
    return retrieveLaunchParams().tgWebAppData?.user?.photo_url || undefined;
  } catch {
    return undefined;
  }
}

export function canRequestContact(): boolean {
  try {
    return requestContact.isAvailable();
  } catch {
    return false;
  }
}

/** Просит контакт; ошибка (в т.ч. отказ пользователя) не пробрасывается. */
export async function askForContact(): Promise<void> {
  try {
    await requestContact();
  } catch {
    // пользователь закрыл попап или отказал — всё равно перезапросим /me
  }
}

export function openBot(): void {
  const url = `https://t.me/${BOT_USERNAME}`;
  try {
    if (openTelegramLink.isAvailable()) {
      openTelegramLink(url);
      return;
    }
  } catch {
    // падаем на обычное открытие ссылки
  }
  window.open(url, '_blank', 'noopener');
}
