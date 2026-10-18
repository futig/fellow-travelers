import type { ParticipantsFilters } from './admin';
import { meQueryKey } from './me';

/** Ключи запросов TanStack Query — только отсюда. Всё про группу — под префиксом `['events', id]`. */
export const queryKeys = {
  me: meQueryKey,
  myEvents: ['my-events'] as const,
  event: (eventId: string) => ['events', eventId] as const,
  invite: (eventId: string) => ['events', eventId, 'invite'] as const,
  trips: (eventId: string) => ['events', eventId, 'trips'] as const,
  myApplication: (eventId: string) => ['events', eventId, 'my-application'] as const,
  myTrip: (eventId: string) => ['events', eventId, 'my-trip'] as const,
  /** Префикс всех админских запросов группы. */
  admin: (eventId: string) => ['events', eventId, 'admin'] as const,
  adminParticipants: (eventId: string, filters: ParticipantsFilters = {}) =>
    ['events', eventId, 'admin', 'participants', filters] as const,
  adminTransfers: (eventId: string) => ['events', eventId, 'admin', 'transfers'] as const,
  invitePreview: (code: string) => ['invites', code.toUpperCase()] as const,
  locations: (q: string) => ['locations', q] as const,
};
