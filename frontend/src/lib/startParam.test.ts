import { describe, expect, it } from 'vitest';
import { parseStartParam } from './startParam';

const UUID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

describe('parseStartParam', () => {
  it('join_<CODE>', () => {
    expect(parseStartParam('join_AB12CD')).toEqual({ kind: 'join', code: 'AB12CD' });
  });

  it('код приглашения без учёта регистра приводится к верхнему', () => {
    expect(parseStartParam('join_ab12cd')).toEqual({ kind: 'join', code: 'AB12CD' });
  });

  it('event_<uuid>', () => {
    expect(parseStartParam(`event_${UUID}`)).toEqual({ kind: 'event', eventId: UUID });
  });

  it('admin_<uuid>', () => {
    expect(parseStartParam(`admin_${UUID}`)).toEqual({ kind: 'admin', eventId: UUID });
  });

  it('admin', () => {
    expect(parseStartParam('admin')).toEqual({ kind: 'adminList' });
  });

  it('отсутствует', () => {
    expect(parseStartParam(undefined)).toEqual({ kind: 'none' });
    expect(parseStartParam('')).toEqual({ kind: 'none' });
  });

  it.each([
    'join_',
    'join_ABC',
    'join_ABCDEFG',
    'join_AB-2CD',
    'event_123',
    `event_${UUID}x`,
    `admin_${UUID.slice(1)}`,
    `unknown_${UUID}`,
    'Admin',
    'join',
    'join_AB12CD_',
    '_AB12CD',
    'мусор',
  ])('мусор %s → none', (raw) => {
    expect(parseStartParam(raw)).toEqual({ kind: 'none' });
  });
});
