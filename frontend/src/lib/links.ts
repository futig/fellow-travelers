import { openLink, openTelegramLink } from '@telegram-apps/sdk-react';

const USERNAME_RE = /^[A-Za-z0-9_]{4,32}$/;
const PHONE_RE = /^\+?\d{5,15}$/;

/** Ссылка на профиль Telegram; `null`, если username невалиден. */
export function telegramUserUrl(username: string | null | undefined): string | null {
  if (!username) return null;
  const name = username.replace(/^@/, '');
  return USERNAME_RE.test(name) ? `https://t.me/${name}` : null;
}

/** `tel:`-ссылка; `null`, если номер невалиден. Пробелы, скобки и дефисы отбрасываем. */
export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[\s()-]/g, '');
  return PHONE_RE.test(clean) ? `tel:${clean}` : null;
}

/** Внешнюю ссылку открываем только со схемой `https:`. */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isTelegramWebLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 't.me';
  } catch {
    return false;
  }
}

// Схема `ChatUrl` контракта: целиком строка, без query и фрагмента.
const CHAT_URL_RE =
  /^https:\/\/t\.me\/(?:\+[A-Za-z0-9_-]+|joinchat\/[A-Za-z0-9_-]+|([A-Za-z][A-Za-z0-9_]{4,31}))$/;
const CHAT_URL_MAX_LENGTH = 200;

/** Служебные пути t.me, которые подходят под шаблон username, но не являются чатами. */
const RESERVED_TME_PATHS = new Set([
  'proxy',
  'socks',
  'share',
  'addstickers',
  'addemoji',
  'addtheme',
  'addlist',
  'setlanguage',
  'login',
  'confirmphone',
  'invoice',
  'boost',
  'iv',
]);

/**
 * Ссылка на чат или канал Telegram (схема `ChatUrl`): `https://t.me/<username>`, `https://t.me/+<hash>`
 * или `https://t.me/joinchat/<hash>`. Служебные ссылки (прокси, share, `?start=` и т.п.) не проходят.
 */
export function isTelegramChatUrl(url: string): boolean {
  if (url.length > CHAT_URL_MAX_LENGTH) return false;
  const m = CHAT_URL_RE.exec(url);
  if (!m) return false;
  const username = m[1];
  return username === undefined || !RESERVED_TME_PATHS.has(username.toLowerCase());
}

/**
 * Открывает внешнюю ссылку: t.me — через `openTelegramLink`, прочее — через `openLink`,
 * вне Telegram — `window.open`. Небезопасные ссылки не открывает (возвращает false).
 */
export function openExternal(url: string): boolean {
  if (!isSafeExternalUrl(url)) return false;
  try {
    if (isTelegramWebLink(url) && openTelegramLink.isAvailable()) {
      openTelegramLink(url);
      return true;
    }
    if (openLink.isAvailable()) {
      openLink(url);
      return true;
    }
  } catch {
    // падаем на обычное открытие ссылки
  }
  window.open(url, '_blank', 'noopener');
  return true;
}

/** Ссылка «Поделиться» Telegram. */
export function shareUrl(link: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

/** Копирует текст в буфер обмена; false, если не получилось. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // пробуем запасной способ
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
