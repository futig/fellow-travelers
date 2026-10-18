import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { AdminParticipants, ApplicationStatus, Transfer } from './types';

export interface ParticipantsFilters {
  status?: ApplicationStatus[];
  trip_id?: string;
}

export async function fetchAdminParticipants(
  eventId: string,
  filters: ParticipantsFilters = {},
): Promise<AdminParticipants> {
  ensureInitData();
  const query: ParticipantsFilters = {};
  if (filters.status?.length) query.status = filters.status;
  if (filters.trip_id) query.trip_id = filters.trip_id;
  return unwrap(
    await api.GET('/events/{event_id}/admin/participants', {
      params: { path: { event_id: eventId }, query },
    }),
  );
}

export async function fetchAdminTransfers(eventId: string): Promise<Transfer[]> {
  ensureInitData();
  return unwrap(
    await api.GET('/events/{event_id}/admin/transfers', {
      params: { path: { event_id: eventId } },
    }),
  );
}
