import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { Event, EventCreate, EventSummary, EventUpdate } from './types';

export async function fetchMyEvents(): Promise<EventSummary[]> {
  ensureInitData();
  return unwrap(await api.GET('/me/events'));
}

export async function fetchEvent(eventId: string): Promise<Event> {
  ensureInitData();
  return unwrap(await api.GET('/events/{event_id}', { params: { path: { event_id: eventId } } }));
}

export async function createEvent(body: EventCreate): Promise<Event> {
  ensureInitData();
  return unwrap(await api.POST('/events', { body }));
}

export async function updateEvent(eventId: string, body: EventUpdate): Promise<Event> {
  ensureInitData();
  return unwrap(
    await api.PATCH('/events/{event_id}', { params: { path: { event_id: eventId } }, body }),
  );
}
