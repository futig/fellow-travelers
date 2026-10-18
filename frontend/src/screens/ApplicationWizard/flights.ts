import type { Trip } from '../../api/types';
import { isoDateInZone } from '../../lib/datetime';

const collator = new Intl.Collator('ru');

function byDeparture(a: Trip, b: Trip): number {
  return Date.parse(a.scheduled_departure) - Date.parse(b.scheduled_departure);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(collator.compare);
}

/** Номер рейса как в контракте: без пробелов, верхний регистр (`su 1405` → `SU1405`). */
export function normalizeFlightNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Города вылета по алфавиту, без повторов. */
export function departureCities(trips: Trip[]): string[] {
  return uniqueSorted(trips.map((t) => t.departure_location.city));
}

/** Города прилёта по алфавиту, без повторов. */
export function arrivalCities(trips: Trip[]): string[] {
  return uniqueSorted(trips.map((t) => t.arrival_location.city));
}

/** Рейсы из города по времени вылета. */
export function tripsFromCity(trips: Trip[], city: string): Trip[] {
  return trips.filter((t) => t.departure_location.city === city).sort(byDeparture);
}

/**
 * Рейсы по номеру и дате вылета (`YYYY-MM-DD`). Дата сравнивается в поясе аэропорта вылета:
 * рейс в 00:30 по Москве ищется по московской дате, а не по дате UTC.
 */
export function findTrips(trips: Trip[], number: string, date: string): Trip[] {
  const wanted = normalizeFlightNumber(number);
  return trips
    .filter(
      (t) =>
        normalizeFlightNumber(t.number) === wanted &&
        isoDateInZone(t.scheduled_departure, t.departure_location.timezone) === date,
    )
    .sort(byDeparture);
}
