import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { MyTrip } from './types';

export async function fetchMyTrip(eventId: string): Promise<MyTrip> {
  ensureInitData();
  return unwrap(
    await api.GET('/events/{event_id}/my-trip', { params: { path: { event_id: eventId } } }),
  );
}
