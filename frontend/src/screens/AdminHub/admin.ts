import type { ParticipantsFilters } from '../../api/admin';
import type {
  AdminParticipant,
  ApplicationStatus,
  Transfer,
  TransferMember,
} from '../../api/types';
import { formatOffsetTime } from '../../lib/datetime';
import { formatFlightNumber } from '../../lib/format';
import { everyoneAtMeetingPoint } from '../MyTrip/phase';

// ---------- Вкладки и фильтры в query-параметрах хаба ----------

export type AdminTab = 'participants' | 'transfers';

/** Статусы заявки в порядке чипов фильтра (и в запросе — для стабильного ключа кэша). */
export const STATUS_FILTERS: readonly { id: ApplicationStatus; label: string }[] = [
  { id: 'searching', label: 'Ищут' },
  { id: 'assigned', label: 'В трансфере' },
  { id: 'solo', label: 'Едут сами' },
  { id: 'cancelled', label: 'Отменили' },
];

const STATUS_IDS = new Set<string>(STATUS_FILTERS.map((s) => s.id));

/** `?tab=transfers` → «Трансферы», остальное — «Участники». */
export function readTab(params: URLSearchParams): AdminTab {
  return params.get('tab') === 'transfers' ? 'transfers' : 'participants';
}

/** Фильтры участников из `?status=…&status=…&trip=…`; неизвестные статусы отбрасываем. */
export function readFilters(params: URLSearchParams): ParticipantsFilters {
  const selected = new Set(params.getAll('status').filter((s) => STATUS_IDS.has(s)));
  const status = STATUS_FILTERS.map((s) => s.id).filter((id) => selected.has(id));
  const tripId = params.get('trip');
  const filters: ParticipantsFilters = {};
  if (status.length) filters.status = status;
  if (tripId) filters.trip_id = tripId;
  return filters;
}

/** Новые параметры с переключённым статусом (остальные параметры сохраняются). */
export function toggleStatus(params: URLSearchParams, status: ApplicationStatus): URLSearchParams {
  const current = readFilters(params).status ?? [];
  const next = current.includes(status)
    ? current.filter((s) => s !== status)
    : [...current, status];
  const result = new URLSearchParams(params);
  result.delete('status');
  for (const s of STATUS_FILTERS) if (next.includes(s.id)) result.append('status', s.id);
  return result;
}

/** Новые параметры с выбранным рейсом; пустая строка — «Все рейсы». */
export function setTrip(params: URLSearchParams, tripId: string): URLSearchParams {
  const result = new URLSearchParams(params);
  if (tripId) result.set('trip', tripId);
  else result.delete('trip');
  return result;
}

export function setTab(params: URLSearchParams, tab: AdminTab): URLSearchParams {
  const result = new URLSearchParams(params);
  if (tab === 'transfers') result.set('tab', 'transfers');
  else result.delete('tab');
  return result;
}

// ---------- Участники ----------

/** Сначала с заявкой — по фактическому прилёту, затем без заявки (порядок сервера сохраняется). */
export function sortParticipants(participants: readonly AdminParticipant[]): AdminParticipant[] {
  const arrival = (p: AdminParticipant) =>
    p.application ? Date.parse(p.application.trip.effective_arrival) : Number.POSITIVE_INFINITY;
  return [...participants].sort((a, b) => arrival(a) - arrival(b));
}

// ---------- Трансферы ----------

/** Порядковые номера трансферов группы по времени создания, от 1. */
export function transferNumbers(transfers: readonly Transfer[]): Map<string, number> {
  const sorted = [...transfers].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

/** Трансферы в порядке номеров. */
export function sortTransfers(transfers: readonly Transfer[]): Transfer[] {
  const numbers = transferNumbers(transfers);
  return [...transfers].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
}

export type TransferState = 'departed' | 'ready' | 'gathering';

/** Уехали / все на месте сбора / собираются. */
export function transferState(transfer: Transfer): TransferState {
  if (transfer.status === 'departed') return 'departed';
  return everyoneAtMeetingPoint(transfer) ? 'ready' : 'gathering';
}

export interface AdminMemberCaption {
  /** «SU 1108 • 12:40» или «Это вы». */
  text: string;
  /** Отметка рядом: «На месте» (success) или «Уехал». */
  mark: { text: string; tone: 'soft' | 'success' } | null;
}

/**
 * Подпись участника трансфера для админа: рейс и прилёт (время — в смещении из `effective_arrival`,
 * то есть в поясе аэропорта прилёта) и отметка.
 */
export function adminMemberCaption(member: TransferMember): AdminMemberCaption {
  const text = member.is_me
    ? 'Это вы'
    : `${formatFlightNumber(member.trip_number)} • ${formatOffsetTime(member.effective_arrival)}`;
  if (member.departed_at) return { text, mark: { text: 'Уехал', tone: 'soft' } };
  if (member.at_meeting_point) return { text, mark: { text: 'На месте', tone: 'success' } };
  return { text, mark: null };
}
