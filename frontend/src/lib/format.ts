import { plural } from './datetime';

const RU_PHONE_RE = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/;

/** `+79122042912` → `+7 912 204 29 12`; остальные номера возвращаем как есть. */
export function formatPhone(phone: string): string {
  const m = RU_PHONE_RE.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export function formatName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

const FLIGHT_NUMBER_RE = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/;

/** Нормализованный номер рейса `SU1148` → `SU 1148`; непохожие номера — как есть. */
export function formatFlightNumber(number: string): string {
  const m = FLIGHT_NUMBER_RE.exec(number);
  return m ? `${m[1]} ${m[2]}` : number;
}

/** 0 → «только ручная кладь», 1 → «1 чемодан», 2 → «2 чемодана». */
export function formatBaggage(count: number): string {
  if (count <= 0) return 'только ручная кладь';
  return `${count} ${plural(count, ['чемодан', 'чемодана', 'чемоданов'])}`;
}

/** 0 → «Не хочу ждать», 15 → «15 минут». */
export function formatWait(minutes: number): string {
  if (minutes <= 0) return 'Не хочу ждать';
  return `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`;
}
