import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { Event, Invite, InvitePreview } from './types';

/** Код и ссылка приглашения (админ). */
export async function fetchEventInvite(eventId: string): Promise<Invite> {
  ensureInitData();
  return unwrap(
    await api.GET('/events/{event_id}/invite', { params: { path: { event_id: eventId } } }),
  );
}

export async function fetchInvitePreview(code: string): Promise<InvitePreview> {
  ensureInitData();
  return unwrap(await api.GET('/invites/{code}', { params: { path: { code } } }));
}

/** Вступить в группу; повторное вступление тоже успешно (200). */
export async function joinByInvite(code: string): Promise<Event> {
  ensureInitData();
  return unwrap(await api.POST('/invites/{code}/join', { params: { path: { code } } }));
}
