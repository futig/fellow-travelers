import { retrieveLaunchParams, retrieveRawInitData } from '@telegram-apps/sdk-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeDevUsers } from '../test/encodeDevUsers';
import { selectDevUser } from './devUsers';
import { setupMockTelegram } from './mockTelegram';

// Как отдаёт urllib.parse.urlencode: «~» не кодируется, пробел — «+» (URLSearchParams перекодировал бы иначе).
const IVAN_INIT_DATA =
  'user=%7B%22id%22%3A1001%2C%22first_name%22%3A%22%D0%98%D0%B2%D0%B0%D0%BD+~%22%7D' +
  '&auth_date=1700000000&signature=sig&hash=aaa';
const MARIA_INIT_DATA =
  'user=%7B%22id%22%3A1002%2C%22first_name%22%3A%22Maria%22%7D' +
  '&auth_date=1700000000&signature=sig&hash=bbb';
const USERS = [
  { label: 'Иван', init_data: IVAN_INIT_DATA },
  { label: 'Мария', init_data: MARIA_INIT_DATA },
];

describe('setupMockTelegram', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('с dev-пользователями отдаёт initData первого как есть', () => {
    vi.stubEnv('VITE_DEV_USERS', encodeDevUsers(USERS));
    setupMockTelegram();
    expect(retrieveRawInitData()).toBe(IVAN_INIT_DATA);
    expect(retrieveLaunchParams().tgWebAppData?.user?.id).toBe(1001);
  });

  it('отдаёт initData выбранного пользователя', () => {
    vi.stubEnv('VITE_DEV_USERS', encodeDevUsers(USERS));
    selectDevUser('Мария');
    setupMockTelegram();
    expect(retrieveRawInitData()).toBe(MARIA_INIT_DATA);
  });

  it('без dev-пользователей — фейковые данные', () => {
    vi.stubEnv('VITE_DEV_USERS', '');
    setupMockTelegram();
    const raw = new URLSearchParams(retrieveRawInitData());
    expect(raw.get('hash')).toBe('mock-hash');
    expect(JSON.parse(raw.get('user')!)).toMatchObject({ id: 99281932 });
  });

  it('предупреждает об отсутствии signature, ошибка SDK — без initData', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(
      'VITE_DEV_USERS',
      encodeDevUsers([{ label: 'Без подписи', init_data: 'auth_date=1&hash=secret-hash' }]),
    );
    let error: unknown;
    try {
      setupMockTelegram();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('secret-hash');
    expect((error as Error).cause).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-hash');
  });
});
