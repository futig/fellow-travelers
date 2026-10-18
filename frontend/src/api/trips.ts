import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { Trip, TripInput, TripUpdate } from './types';

export async function fetchEventTrips(eventId: string): Promise<Trip[]> {
  ensureInitData();
  return unwrap(
    await api.GET('/events/{event_id}/trips', { params: { path: { event_id: eventId } } }),
  );
}

export async function createTrip(eventId: string, body: TripInput): Promise<Trip> {
  ensureInitData();
  return unwrap(
    await api.POST('/events/{event_id}/trips', { params: { path: { event_id: eventId } }, body }),
  );
}

export async function updateTrip(tripId: string, body: TripUpdate): Promise<Trip> {
  ensureInitData();
  return unwrap(
    await api.PATCH('/trips/{trip_id}', { params: { path: { trip_id: tripId } }, body }),
  );
}

/** Удалить рейс; `409 TRIP_IN_USE`, если на него ссылаются заявки. */
export async function deleteTrip(tripId: string): Promise<void> {
  ensureInitData();
  unwrap(await api.DELETE('/trips/{trip_id}', { params: { path: { trip_id: tripId } } }));
}
