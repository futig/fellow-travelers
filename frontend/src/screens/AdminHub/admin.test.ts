import { describe, expect, it } from 'vitest';
import type { AdminParticipant } from '../../api/types';
import { makeContact, makeTrip } from '../../test/fixtures';
import { makeApplication, makeMember, makeTransfer } from '../../test/myTrip';
import {
  adminMemberCaption,
  readFilters,
  readTab,
  setTab,
  setTrip,
  sortParticipants,
  sortTransfers,
  toggleStatus,
  transferNumbers,
  transferState,
} from './admin';

function participant(name: string, arrival: string | null): AdminParticipant {
  return {
    contact: makeContact({ first_name: name }),
    application: arrival
      ? makeApplication({ trip: makeTrip({ effective_arrival: arrival }) })
      : null,
  };
}

describe('вкладки и фильтры', () => {
  it('вкладка: по умолчанию участники', () => {
    expect(readTab(new URLSearchParams())).toBe('participants');
    expect(readTab(new URLSearchParams('tab=transfers'))).toBe('transfers');
    expect(readTab(new URLSearchParams('tab=x'))).toBe('participants');
  });

  it('фильтры: статусы в порядке чипов, неизвестные отброшены, рейс', () => {
    expect(readFilters(new URLSearchParams())).toEqual({});
    expect(
      readFilters(new URLSearchParams('status=solo&status=bogus&status=searching&trip=t1')),
    ).toEqual({ status: ['searching', 'solo'], trip_id: 't1' });
  });

  it('переключение статуса и рейса сохраняет остальные параметры', () => {
    let p = new URLSearchParams('tab=transfers');
    p = toggleStatus(p, 'solo');
    p = toggleStatus(p, 'searching');
    expect(p.toString()).toBe('tab=transfers&status=searching&status=solo');
    p = toggleStatus(p, 'solo');
    expect(p.getAll('status')).toEqual(['searching']);
    p = setTrip(p, 't1');
    expect(p.get('trip')).toBe('t1');
    expect(setTrip(p, '').has('trip')).toBe(false);
    expect(setTab(p, 'participants').has('tab')).toBe(false);
    expect(setTab(new URLSearchParams(), 'transfers').get('tab')).toBe('transfers');
  });
});

describe('sortParticipants', () => {
  it('с заявкой по прилёту, без заявки — в конце', () => {
    const sorted = sortParticipants([
      participant('Без', null),
      participant('Поздний', '2026-08-22T15:00:00+03:00'),
      participant('Ранний', '2026-08-22T09:00:00+03:00'),
    ]);
    expect(sorted.map((p) => p.contact.first_name)).toEqual(['Ранний', 'Поздний', 'Без']);
  });
});

describe('трансферы', () => {
  const a = makeTransfer({ id: 'a', created_at: '2026-08-12T10:00:00+00:00' });
  const b = makeTransfer({ id: 'b', created_at: '2026-08-10T10:00:00+00:00' });
  const c = makeTransfer({ id: 'c', created_at: '2026-08-11T10:00:00+00:00' });

  it('номера по времени создания, от 1', () => {
    const numbers = transferNumbers([a, b, c]);
    expect([numbers.get('b'), numbers.get('c'), numbers.get('a')]).toEqual([1, 2, 3]);
    expect(sortTransfers([a, b, c]).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('статус: уехали / все на месте / собираются', () => {
    const here = makeMember({ at_meeting_point: true });
    const away = makeMember({ application_id: 'x' });
    expect(transferState(makeTransfer({ status: 'departed', members: [here] }))).toBe('departed');
    expect(transferState(makeTransfer({ members: [here] }))).toBe('ready');
    expect(transferState(makeTransfer({ members: [here, away] }))).toBe('gathering');
    expect(transferState(makeTransfer({ members: [] }))).toBe('gathering');
  });
});

describe('adminMemberCaption', () => {
  it('рейс и время в смещении аэропорта прилёта', () => {
    const member = makeMember({
      trip_number: 'SU1108',
      effective_arrival: '2026-08-22T12:40:00+05:00',
    });
    expect(adminMemberCaption(member)).toEqual({ text: 'SU 1108 • 12:40', mark: null });
  });

  it('отметки и «Это вы»', () => {
    expect(adminMemberCaption(makeMember({ at_meeting_point: true })).mark).toEqual({
      text: 'На месте',
      tone: 'success',
    });
    expect(
      adminMemberCaption(makeMember({ at_meeting_point: true, departed_at: '2026-08-22T13:00Z' }))
        .mark,
    ).toEqual({ text: 'Уехал', tone: 'soft' });
    expect(adminMemberCaption(makeMember({ is_me: true })).text).toBe('Это вы');
  });
});
