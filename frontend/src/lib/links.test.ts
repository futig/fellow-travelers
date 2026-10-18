import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const openTelegramLink = Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) });
  const openLink = Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) });
  return { openTelegramLink, openLink };
});
vi.mock('@telegram-apps/sdk-react', () => sdk);

import {
  copyToClipboard,
  isSafeExternalUrl,
  openExternal,
  shareUrl,
  telegramUserUrl,
  telUrl,
} from './links';

describe('telegramUserUrl / telUrl', () => {
  it('валидный username', () => {
    expect(telegramUserUrl('ivan_petrov')).toBe('https://t.me/ivan_petrov');
    expect(telegramUserUrl('@ivan_petrov')).toBe('https://t.me/ivan_petrov');
  });

  it('невалидный username → null', () => {
    expect(telegramUserUrl(null)).toBeNull();
    expect(telegramUserUrl('')).toBeNull();
    expect(telegramUserUrl('a/b?c')).toBeNull();
    expect(telegramUserUrl('abc')).toBeNull();
  });

  it('телефон', () => {
    expect(telUrl('+79122042912')).toBe('tel:+79122042912');
    expect(telUrl('+7 (912) 204-29-12')).toBe('tel:+79122042912');
    expect(telUrl(null)).toBeNull();
    expect(telUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('isSafeExternalUrl', () => {
  it.each([
    ['https://t.me/chat', true],
    ['tg://resolve?domain=x', true],
    ['http://example.com', false],
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['не ссылка', false],
    ['', false],
  ])('%s → %s', (url, ok) => {
    expect(isSafeExternalUrl(url)).toBe(ok);
  });
});

describe('openExternal', () => {
  const windowOpen = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('open', windowOpen);
    sdk.openTelegramLink.mockReset();
    sdk.openLink.mockReset();
    windowOpen.mockReset();
    sdk.openTelegramLink.isAvailable.mockReturnValue(true);
    sdk.openLink.isAvailable.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('t.me — через openTelegramLink', () => {
    expect(openExternal('https://t.me/chat')).toBe(true);
    expect(sdk.openTelegramLink).toHaveBeenCalledWith('https://t.me/chat');
    expect(sdk.openLink).not.toHaveBeenCalled();
  });

  it('прочие https — через openLink', () => {
    openExternal('https://example.com/x');
    expect(sdk.openLink).toHaveBeenCalledWith('https://example.com/x');
  });

  it('вне Telegram — window.open', () => {
    sdk.openTelegramLink.isAvailable.mockReturnValue(false);
    sdk.openLink.isAvailable.mockReturnValue(false);
    openExternal('https://t.me/chat');
    expect(windowOpen).toHaveBeenCalledWith('https://t.me/chat', '_blank', 'noopener');
  });

  it('небезопасная ссылка не открывается', () => {
    expect(openExternal('javascript:alert(1)')).toBe(false);
    expect(windowOpen).not.toHaveBeenCalled();
    expect(sdk.openLink).not.toHaveBeenCalled();
  });
});

describe('shareUrl / copyToClipboard', () => {
  it('ссылка «Поделиться» с экранированием', () => {
    expect(shareUrl('https://t.me/bot?startapp=join_K7Q2ZP', 'Вступайте & едем')).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fbot%3Fstartapp%3Djoin_K7Q2ZP&text=%D0%92%D1%81%D1%82%D1%83%D0%BF%D0%B0%D0%B9%D1%82%D0%B5%20%26%20%D0%B5%D0%B4%D0%B5%D0%BC',
    );
  });

  it('копирует через navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyToClipboard('K7Q2ZP')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('K7Q2ZP');
  });
});
