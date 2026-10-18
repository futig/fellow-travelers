import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { fetchAdminParticipants, fetchAdminTransfers, type ParticipantsFilters } from './admin';
import {
  cancelMyApplication,
  fetchMyApplication,
  goSolo,
  resumeSearch,
  setMyMarks,
  upsertMyApplication,
} from './applications';
import { createEvent, fetchEvent, fetchMyEvents, updateEvent } from './events';
import { fetchEventInvite, fetchInvitePreview, joinByInvite } from './invites';
import { queryKeys } from './keys';
import { searchLocations } from './locations';
import { fetchMe } from './me';
import { fetchMyTrip } from './myTrip';
import { createTrip, deleteTrip, fetchEventTrips, updateTrip } from './trips';
import type {
  Application,
  ApplicationInput,
  Event,
  EventCreate,
  EventUpdate,
  MarksInput,
  TripInput,
  TripUpdate,
} from './types';

/** Минимальная длина строки поиска точек (контракт: от 2 символов). */
export const LOCATIONS_MIN_QUERY = 2;

// ---------- Запросы ----------

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchMe });
}

export function useMyEvents() {
  return useQuery({ queryKey: queryKeys.myEvents, queryFn: fetchMyEvents });
}

export function useEvent(eventId: string) {
  return useQuery({ queryKey: queryKeys.event(eventId), queryFn: () => fetchEvent(eventId) });
}

/** Код и ссылка приглашения (админ). */
export function useInvite(eventId: string) {
  return useQuery({
    queryKey: queryKeys.invite(eventId),
    queryFn: () => fetchEventInvite(eventId),
  });
}

export function useInvitePreview(code: string) {
  return useQuery({
    queryKey: queryKeys.invitePreview(code),
    queryFn: () => fetchInvitePreview(code),
  });
}

/** Поиск аэропортов; запрос уходит от 2 символов, пока печатают — показываем прошлый результат. */
export function useLocations(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: queryKeys.locations(query),
    queryFn: () => searchLocations(query),
    enabled: query.length >= LOCATIONS_MIN_QUERY,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useTrips(eventId: string) {
  return useQuery({ queryKey: queryKeys.trips(eventId), queryFn: () => fetchEventTrips(eventId) });
}

export function useMyApplication(eventId: string) {
  return useQuery({
    queryKey: queryKeys.myApplication(eventId),
    queryFn: () => fetchMyApplication(eventId),
  });
}

export function useMyTrip(eventId: string) {
  return useQuery({ queryKey: queryKeys.myTrip(eventId), queryFn: () => fetchMyTrip(eventId) });
}

export function useAdminParticipants(eventId: string, filters: ParticipantsFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminParticipants(eventId, filters),
    queryFn: () => fetchAdminParticipants(eventId, filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTransfers(eventId: string) {
  return useQuery({
    queryKey: queryKeys.adminTransfers(eventId),
    queryFn: () => fetchAdminTransfers(eventId),
  });
}

// ---------- Инвалидация ----------

function invalidate(client: QueryClient, keys: readonly (readonly unknown[])[]) {
  return Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/** После изменения группы: сама группа, список групп, «Моя поездка» (в ней `event`). */
function afterEventChange(client: QueryClient, event: Event) {
  client.setQueryData(queryKeys.event(event.id), event);
  return invalidate(client, [queryKeys.myEvents, queryKeys.myTrip(event.id)]);
}

/** После изменения заявки: моя заявка и поездка, список групп (статус), админские списки. */
function afterApplicationChange(client: QueryClient, eventId: string, app: Application) {
  client.setQueryData(queryKeys.myApplication(eventId), app);
  return invalidate(client, [
    queryKeys.myApplication(eventId),
    queryKeys.myTrip(eventId),
    queryKeys.myEvents,
    queryKeys.admin(eventId),
  ]);
}

/** После изменения рейсов: рейсы группы и всё, где рейс встроен (заявка, поездка, админка). */
function afterTripsChange(client: QueryClient, eventId: string) {
  return invalidate(client, [
    queryKeys.trips(eventId),
    queryKeys.myApplication(eventId),
    queryKeys.myTrip(eventId),
    queryKeys.admin(eventId),
  ]);
}

// ---------- Мутации ----------

export function useCreateEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EventCreate) => createEvent(body),
    onSuccess: (event) => afterEventChange(client, event),
  });
}

export function useUpdateEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EventUpdate) => updateEvent(eventId, body),
    onSuccess: (event) => afterEventChange(client, event),
  });
}

export function useJoin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => joinByInvite(code),
    onSuccess: (event, code) => {
      client.setQueryData(queryKeys.event(event.id), event);
      return invalidate(client, [
        queryKeys.myEvents,
        queryKeys.invitePreview(code),
        queryKeys.myTrip(event.id),
        queryKeys.admin(event.id),
      ]);
    },
  });
}

export function useCreateTrip(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TripInput) => createTrip(eventId, body),
    onSuccess: () => afterTripsChange(client, eventId),
  });
}

export function useUpdateTrip(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, body }: { tripId: string; body: TripUpdate }) =>
      updateTrip(tripId, body),
    onSuccess: () => afterTripsChange(client, eventId),
  });
}

export function useDeleteTrip(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => deleteTrip(tripId),
    onSuccess: () => afterTripsChange(client, eventId),
  });
}

function useApplicationMutation<V>(
  eventId: string,
  mutationFn: (variables: V) => Promise<Application>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (app) => afterApplicationChange(client, eventId, app),
  });
}

export function useUpsertApplication(eventId: string) {
  return useApplicationMutation(eventId, (body: ApplicationInput) =>
    upsertMyApplication(eventId, body),
  );
}

export function useGoSolo(eventId: string) {
  return useApplicationMutation(eventId, () => goSolo(eventId));
}

export function useResumeSearch(eventId: string) {
  return useApplicationMutation(eventId, () => resumeSearch(eventId));
}

export function useCancelApplication(eventId: string) {
  return useApplicationMutation(eventId, () => cancelMyApplication(eventId));
}

export function useSetMarks(eventId: string) {
  return useApplicationMutation(eventId, (body: MarksInput) => setMyMarks(eventId, body));
}
