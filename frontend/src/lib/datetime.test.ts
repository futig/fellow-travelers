import { describe, expect, it } from 'vitest';
import {
  arrivalDayShift,
  formatCountdown,
  formatDateRange,
  formatDayMonth,
  formatTime,
  isoToLocalInput,
  localInputToApi,
  plural,
} from './datetime';

const DAY = ['день', 'дня', 'дней'] as const;

describe('plural', () => {
  it.each([
    [1, 'день'],
    [2, 'дня'],
    [4, 'дня'],
    [5, 'дней'],
    [11, 'дней'],
    [12, 'дней'],
    [14, 'дней'],
    [21, 'день'],
    [22, 'дня'],
    [25, 'дней'],
    [101, 'день'],
    [111, 'дней'],
    [0, 'дней'],
  ])('%i → %s', (n, form) => {
    expect(plural(n, DAY)).toBe(form);
  });
});

describe('formatTime / formatDayMonth', () => {
  it('время в поясе точки, а не устройства', () => {
    const iso = '2026-08-22T08:40:00+03:00';
    expect(formatTime(iso, 'Europe/Moscow')).toBe('08:40');
    expect(formatTime(iso, 'Asia/Yekaterinburg')).toBe('10:40');
    expect(formatTime(iso, 'UTC')).toBe('05:40');
  });

  it('полночь — 00:00', () => {
    expect(formatTime('2026-08-22T00:05:00+03:00', 'Europe/Moscow')).toBe('00:05');
  });

  it('«22 августа» в поясе точки', () => {
    expect(formatDayMonth('2026-08-22T08:40:00+03:00', 'Europe/Moscow')).toBe('22 августа');
    expect(formatDayMonth('2026-08-22T01:00:00+03:00', 'UTC')).toBe('21 августа');
  });
});

describe('arrivalDayShift', () => {
  it('в те же сутки', () => {
    expect(
      arrivalDayShift(
        '2026-08-22T08:40:00+03:00',
        'Europe/Moscow',
        '2026-08-22T12:25:00+03:00',
        'Europe/Moscow',
      ),
    ).toBe(0);
  });

  it('через полночь → 1', () => {
    expect(
      arrivalDayShift(
        '2026-08-22T22:40:00+03:00',
        'Europe/Moscow',
        '2026-08-23T03:10:00+05:00',
        'Asia/Yekaterinburg',
      ),
    ).toBe(1);
  });

  it('сравниваются местные даты, а не UTC', () => {
    // Вылет 23:30 по Москве (20:30 UTC), прилёт 01:30 по Екатеринбургу (20:30 UTC + 1 ч полёта)
    expect(
      arrivalDayShift(
        '2026-08-22T23:30:00+03:00',
        'Europe/Moscow',
        '2026-08-23T02:30:00+05:00',
        'Asia/Yekaterinburg',
      ),
    ).toBe(1);
    // На запад: вылет 00:30 по Екатеринбургу, прилёт 23:50 предыдущих суток по Москве
    expect(
      arrivalDayShift(
        '2026-08-23T00:30:00+05:00',
        'Asia/Yekaterinburg',
        '2026-08-22T23:50:00+03:00',
        'Europe/Moscow',
      ),
    ).toBe(-1);
  });
});

describe('formatCountdown', () => {
  const now = new Date('2026-08-20T10:00:00Z');

  it.each([
    ['2026-08-22T10:00:00Z', '2 дня'],
    ['2026-08-21T10:00:00Z', '1 день'],
    ['2026-08-26T11:00:00Z', '6 дней'],
    ['2026-08-21T09:00:00Z', '23 часа'],
    ['2026-08-20T15:30:00Z', '5 часов'],
    ['2026-08-20T11:00:00Z', '1 час'],
    ['2026-08-20T10:15:00Z', '15 минут'],
    ['2026-08-20T10:01:00Z', '1 минута'],
    ['2026-08-20T10:00:20Z', '1 минута'],
    ['2026-08-20T10:22:00Z', '22 минуты'],
  ])('%s → %s', (target, expected) => {
    expect(formatCountdown(target, now)).toBe(expected);
  });

  it('прошедший момент → null', () => {
    expect(formatCountdown('2026-08-20T10:00:00Z', now)).toBeNull();
    expect(formatCountdown('2026-08-19T10:00:00Z', now)).toBeNull();
  });
});

describe('formatDateRange', () => {
  it.each([
    ['2026-11-12', '2026-11-14', '12–14 ноября 2026'],
    ['2026-10-30', '2026-11-02', '30 октября – 2 ноября 2026'],
    ['2026-11-12', '2026-11-12', '12 ноября 2026'],
    ['2026-12-30', '2027-01-02', '30 декабря 2026 – 2 января 2027'],
  ])('%s..%s → %s', (s, e, expected) => {
    expect(formatDateRange(s, e)).toBe(expected);
  });
});

describe('datetime-local ↔ API', () => {
  it('значение инпута → строка без смещения', () => {
    expect(localInputToApi('2026-08-22T08:40')).toBe('2026-08-22T08:40:00');
    expect(localInputToApi('2026-08-22T08:40:15')).toBe('2026-08-22T08:40:15');
    expect(localInputToApi('')).toBeNull();
    expect(localInputToApi('мусор')).toBeNull();
  });

  it.each([
    '2026-08-22T08:40junk',
    '2026-13-40T25:99',
    '2026-02-30T10:00',
    '2026-08-22T24:00',
    '2026-08-22T08:60',
    '2026-08-22T08:40:60',
    '2026-00-10T08:40',
    'x2026-08-22T08:40',
  ])('неверное значение %s → null', (value) => {
    expect(localInputToApi(value)).toBeNull();
  });

  it('29 февраля високосного года допустимо', () => {
    expect(localInputToApi('2028-02-29T08:40')).toBe('2028-02-29T08:40:00');
  });

  it('ISO со смещением → местное время аэропорта', () => {
    expect(isoToLocalInput('2026-08-22T07:30:00+05:00', 'Asia/Yekaterinburg')).toBe(
      '2026-08-22T07:30',
    );
    expect(isoToLocalInput('2026-08-22T02:30:00+00:00', 'Asia/Yekaterinburg')).toBe(
      '2026-08-22T07:30',
    );
  });
});

describe('переход на летнее/зимнее время', () => {
  it('formatTime: Берлин, 25.10.2026 — 02:30 дважды (CEST и CET)', () => {
    expect(formatTime('2026-10-25T00:30:00Z', 'Europe/Berlin')).toBe('02:30');
    expect(formatTime('2026-10-25T01:30:00Z', 'Europe/Berlin')).toBe('02:30');
    expect(formatTime('2026-10-25T02:30:00Z', 'Europe/Berlin')).toBe('03:30');
  });

  it('isoToLocalInput: Берлин, 29.03.2026 — после перевода стрелок', () => {
    expect(isoToLocalInput('2026-03-29T00:30:00Z', 'Europe/Berlin')).toBe('2026-03-29T01:30');
    expect(isoToLocalInput('2026-03-29T01:30:00Z', 'Europe/Berlin')).toBe('2026-03-29T03:30');
  });

  it('arrivalDayShift: Нью-Йорк → Берлин через ночь перевода часов (08.03.2026)', () => {
    expect(
      arrivalDayShift(
        '2026-03-07T23:00:00-05:00',
        'America/New_York',
        '2026-03-08T13:00:00+01:00',
        'Europe/Berlin',
      ),
    ).toBe(1);
    // Вылет 23:30 EDT в день перехода, прилёт на следующие местные сутки
    expect(
      arrivalDayShift(
        '2026-03-08T23:30:00-04:00',
        'America/New_York',
        '2026-03-09T13:30:00+01:00',
        'Europe/Berlin',
      ),
    ).toBe(1);
    expect(
      arrivalDayShift(
        '2026-03-08T03:30:00-04:00',
        'America/New_York',
        '2026-03-08T19:30:00+01:00',
        'Europe/Berlin',
      ),
    ).toBe(0);
  });
});
