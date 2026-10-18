import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { Application, ApplicationInput, MarksInput } from './types';

const path = (eventId: string) => ({ params: { path: { event_id: eventId } } });

/** Моя заявка; `404 NOT_FOUND`, если заявки нет (или группа недоступна). */
export async function fetchMyApplication(eventId: string): Promise<Application> {
  ensureInitData();
  return unwrap(await api.GET('/events/{event_id}/my-application', path(eventId)));
}

export async function upsertMyApplication(
  eventId: string,
  body: ApplicationInput,
): Promise<Application> {
  ensureInitData();
  return unwrap(await api.PUT('/events/{event_id}/my-application', { ...path(eventId), body }));
}

export async function goSolo(eventId: string): Promise<Application> {
  ensureInitData();
  return unwrap(await api.POST('/events/{event_id}/my-application/go-solo', path(eventId)));
}

export async function resumeSearch(eventId: string): Promise<Application> {
  ensureInitData();
  return unwrap(await api.POST('/events/{event_id}/my-application/resume-search', path(eventId)));
}

export async function cancelMyApplication(eventId: string): Promise<Application> {
  ensureInitData();
  return unwrap(await api.POST('/events/{event_id}/my-application/cancel', path(eventId)));
}

export async function setMyMarks(eventId: string, body: MarksInput): Promise<Application> {
  ensureInitData();
  return unwrap(
    await api.PUT('/events/{event_id}/my-application/marks', { ...path(eventId), body }),
  );
}
