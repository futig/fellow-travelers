import { describe, expect, it } from 'vitest';
import { GDZ, SVO, makeTrip } from '../../test/fixtures';
import {
  arrivalCities,
  departureCities,
  findTrips,
  normalizeFlightNumber,
  tripsFromCity,
} from './flights';

const SVX = {
  ...SVO,
  id: 'svx',
  code: 'SVX',
  city: 'Екатеринбург',
  timezone: 'Asia/Yekaterinburg',
};
const AER = { ...GDZ, id: 'aer', code: 'AER', city: 'Сочи' };

describe('flights', () => {
  it('normalizeFlightNumber: без пробелов, капсом', () => {
    expect(normalizeFlightNumber(' su 1405 ')).toBe('SU1405');
  });

  it('города вылета и прилёта: уникальные, по алфавиту', () => {
    const trips = [
      makeTrip({ id: 'a' }),
      makeTrip({ id: 'b', departure_location: SVX }),
      makeTrip({ id: 'c', arrival_location: AER }),
    ];
    expect(departureCities(trips)).toEqual(['Екатеринбург', 'Москва']);
    expect(arrivalCities(trips)).toEqual(['Геленджик', 'Сочи']);
  });

  it('рейсы из города — по времени вылета', () => {
    const late = makeTrip({ id: 'late', scheduled_departure: '2026-08-22T13:00:00+03:00' });
    const early = makeTrip({ id: 'early', scheduled_departure: '2026-08-22T06:00:00+03:00' });
    const other = makeTrip({ id: 'other', departure_location: SVX });
    expect(tripsFromCity([late, other, early], 'Москва').map((t) => t.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('поиск по номеру и дате в поясе аэропорта вылета', () => {
    // 00:30 по Екатеринбургу 22 августа = 19:30 UTC 21 августа.
    const night = makeTrip({
      id: 'night',
      number: 'U6115',
      departure_location: SVX,
      scheduled_departure: '2026-08-21T19:30:00Z',
    });
    const otherDay = makeTrip({
      id: 'other',
      number: 'U6115',
      departure_location: SVX,
      scheduled_departure: '2026-08-23T08:00:00+05:00',
    });
    const trips = [night, otherDay, makeTrip()];
    expect(findTrips(trips, 'u6 115', '2026-08-22').map((t) => t.id)).toEqual(['night']);
    expect(findTrips(trips, 'U6115', '2026-08-21')).toEqual([]);
    expect(findTrips(trips, 'SU1148', '2026-08-22').map((t) => t.number)).toEqual(['SU1148']);
  });
});
