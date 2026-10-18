import { describe, expect, it } from 'vitest';
import { makeTrip } from '../../test/fixtures';
import { makeApplication, makeMember, makeMyTrip, makeTransfer } from '../../test/myTrip';
import { arrivalActionsAvailable, everyoneAtMeetingPoint, memberCaption, tripTitle } from './phase';

// Рейс: вылет 22.08 08:40 МСК, прилёт 12:25 МСК.
const at = (iso: string) => new Date(iso);

describe('tripTitle', () => {
  it('до вылета — обратный отсчёт', () => {
    expect(tripTitle(makeMyTrip(), at('2026-08-20T08:00:00+03:00'))).toBe('До вылета 2 дня');
    expect(tripTitle(makeMyTrip(), at('2026-08-22T06:30:00+03:00'))).toBe('До вылета 2 часа');
  });

  it('в пути — время прилёта в поясе прилёта', () => {
    const trip = makeTrip({
      arrival_location: { ...makeTrip().arrival_location, timezone: 'Asia/Yekaterinburg' },
    });
    const myTrip = makeMyTrip({ application: makeApplication({ trip }) });
    expect(tripTitle(myTrip, at('2026-08-22T10:00:00+03:00'))).toBe('В пути, прилёт в 14:25');
  });

  it('после прилёта, после отъезда, без заявки', () => {
    expect(tripTitle(makeMyTrip(), at('2026-08-22T12:30:00+03:00'))).toBe(
      'Добро пожаловать в Геленджик',
    );
    const departed = makeMyTrip({
      application: makeApplication({ departed_at: '2026-08-22T13:00:00+03:00' }),
    });
    expect(tripTitle(departed, at('2026-08-22T13:30:00+03:00'))).toBe('Хорошей дороги!');
    expect(tripTitle(makeMyTrip({ application: null }), at('2026-08-20T08:00:00+03:00'))).toBe(
      'Слёт в Геленджике',
    );
  });
});

describe('arrivalActionsAvailable', () => {
  it('с часа до прилёта, не для cancelled и уехавших', () => {
    const app = makeApplication();
    expect(arrivalActionsAvailable(app, at('2026-08-22T11:24:00+03:00'))).toBe(false);
    expect(arrivalActionsAvailable(app, at('2026-08-22T11:25:00+03:00'))).toBe(true);
    expect(
      arrivalActionsAvailable(
        makeApplication({ status: 'cancelled' }),
        at('2026-08-22T12:00:00+03:00'),
      ),
    ).toBe(false);
    expect(
      arrivalActionsAvailable(
        makeApplication({ departed_at: '2026-08-22T12:50:00+03:00' }),
        at('2026-08-22T13:00:00+03:00'),
      ),
    ).toBe(false);
  });
});

describe('memberCaption', () => {
  const me = makeApplication();

  it('по приоритету: я, уехал, на месте, тот же рейс, номер и время', () => {
    expect(memberCaption(makeMember({ is_me: true, at_meeting_point: true }), me).text).toBe(
      'Это вы',
    );
    expect(
      memberCaption(
        makeMember({ departed_at: '2026-08-22T13:00:00+03:00', at_meeting_point: true }),
        me,
      ).text,
    ).toBe('Уехал');
    expect(memberCaption(makeMember({ at_meeting_point: true }), me)).toEqual({
      text: 'На месте',
      tone: 'success',
    });
    expect(memberCaption(makeMember(), me).text).toBe('Летит тем же рейсом');
    // Время — в поясе моего аэропорта прилёта (Москва), а не в поясе из строки.
    expect(
      memberCaption(
        makeMember({ trip_number: 'SU1108', effective_arrival: '2026-08-22T09:40:00Z' }),
        me,
      ).text,
    ).toBe('SU 1108 • 12:40');
  });
});

describe('everyoneAtMeetingPoint', () => {
  it('все на месте или уехали', () => {
    expect(everyoneAtMeetingPoint(null)).toBe(false);
    const all = makeTransfer({
      members: [
        makeMember({ at_meeting_point: true }),
        makeMember({ departed_at: '2026-08-22T13:00:00+03:00' }),
      ],
    });
    expect(everyoneAtMeetingPoint(all)).toBe(true);
    expect(everyoneAtMeetingPoint(makeTransfer({ members: [makeMember()] }))).toBe(false);
  });
});
