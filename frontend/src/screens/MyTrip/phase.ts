import type { Application, MyTrip, Transfer, TransferMember } from '../../api/types';
import { formatCountdown, formatTime } from '../../lib/datetime';
import { formatFlightNumber } from '../../lib/format';

/** Отметки «Я на месте» / «Уехал» и такси — за час до прилёта. */
export const MARKS_BEFORE_ARRIVAL_MS = 60 * 60_000;

/** Заголовок экрана по фазе поездки. Без заявки — название группы. */
export function tripTitle(myTrip: MyTrip, now: Date): string {
  const app = myTrip.application;
  if (!app) return myTrip.event.title;
  if (app.departed_at) return 'Хорошей дороги!';
  const { trip } = app;
  const countdown = formatCountdown(trip.scheduled_departure, now);
  if (countdown) return `До вылета ${countdown}`;
  if (now.getTime() < Date.parse(trip.effective_arrival)) {
    return `В пути, прилёт в ${formatTime(trip.effective_arrival, trip.arrival_location.timezone)}`;
  }
  return `Добро пожаловать в ${trip.arrival_location.city}`;
}

/** Пора ли показывать отметки и такси: не отменено, не уехал, до прилёта меньше часа. */
export function arrivalActionsAvailable(app: Application, now: Date): boolean {
  if (app.status === 'cancelled' || app.departed_at) return false;
  return now.getTime() >= Date.parse(app.trip.effective_arrival) - MARKS_BEFORE_ARRIVAL_MS;
}

/** Все попутчики (кроме уехавших) уже на месте сбора. */
export function everyoneAtMeetingPoint(transfer: Transfer | null): boolean {
  if (!transfer || transfer.members.length === 0) return false;
  return transfer.members.every((m) => m.at_meeting_point || m.departed_at !== null);
}

export interface MemberCaption {
  text: string;
  tone: 'soft' | 'success';
}

/** Подпись попутчика в списке трансфера; время прилёта — в поясе моего аэропорта прилёта. */
export function memberCaption(member: TransferMember, me: Application): MemberCaption {
  if (member.is_me) return { text: 'Это вы', tone: 'soft' };
  if (member.departed_at) return { text: 'Уехал', tone: 'soft' };
  if (member.at_meeting_point) return { text: 'На месте', tone: 'success' };
  if (member.trip_number === me.trip.number) return { text: 'Летит тем же рейсом', tone: 'soft' };
  const time = formatTime(member.effective_arrival, me.trip.arrival_location.timezone);
  return { text: `${formatFlightNumber(member.trip_number)} • ${time}`, tone: 'soft' };
}
