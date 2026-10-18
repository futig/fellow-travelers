import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_USER_STORAGE_KEY,
  getSelectedDevUser,
  parseDevUsers,
  selectDevUser,
  type DevUser,
} from './devUsers';
import { encodeDevUsers } from '../test/encodeDevUsers';

const IVAN = {
  label: 'Иван Петров · +7 999 000-00-01',
  init_data: 'user=%7B%7D&auth_date=1&hash=a',
};
const MARIA = { label: 'Мария · +7 999 000-00-02', init_data: 'user=%7B%7D&auth_date=2&hash=b' };

describe('parseDevUsers', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('валидный список (кириллица, без паддинга)', () => {
    expect(parseDevUsers(encodeDevUsers([IVAN, MARIA]))).toEqual([
      { label: IVAN.label, initData: IVAN.init_data },
      { label: MARIA.label, initData: MARIA.init_data },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('пустой или не задан — пустой список без предупреждения', () => {
    expect(parseDevUsers(undefined)).toEqual([]);
    expect(parseDevUsers('')).toEqual([]);
    expect(parseDevUsers('  ')).toEqual([]);
    expect(parseDevUsers(encodeDevUsers([]))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['не base64', '%%%'],
    ['не JSON', btoa('not json')],
    ['не массив', encodeDevUsers({ label: 'x', init_data: 'y' })],
    ['нет init_data', encodeDevUsers([{ label: 'x' }])],
    ['пустой label', encodeDevUsers([{ label: '', init_data: 'y' }])],
    ['init_data не строка', encodeDevUsers([IVAN, { label: 'x', init_data: 1 }])],
  ])('битый (%s) — пустой список и предупреждение', (_name, encoded) => {
    expect(parseDevUsers(encoded)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('initData не попадает в предупреждение', () => {
    parseDevUsers(encodeDevUsers([{ label: 'x', init_data: 'secret-init-data', extra: [] }, {}]));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-init-data');
  });
});

describe('выбор пользователя', () => {
  const users: DevUser[] = parseDevUsers(encodeDevUsers([IVAN, MARIA]));

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('по умолчанию — первый', () => {
    expect(getSelectedDevUser(users)?.label).toBe(IVAN.label);
  });

  it('запоминает выбор в sessionStorage', () => {
    selectDevUser(MARIA.label);
    expect(sessionStorage.getItem(DEV_USER_STORAGE_KEY)).toBe(MARIA.label);
    expect(getSelectedDevUser(users)?.label).toBe(MARIA.label);
  });

  it('выбранный пропал из списка — первый', () => {
    selectDevUser('Кто-то удалённый');
    expect(getSelectedDevUser(users)?.label).toBe(IVAN.label);
  });

  it('пустой список — undefined', () => {
    expect(getSelectedDevUser([])).toBeUndefined();
  });

  it('storage недоступен — не падает', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => selectDevUser(MARIA.label)).not.toThrow();
    expect(getSelectedDevUser(users)?.label).toBe(IVAN.label);
  });
});
