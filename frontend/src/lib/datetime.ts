// Время и даты. Моменты приходят ISO 8601 со смещением; показываем в поясе своей точки (IANA).

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Русская форма слова по числу: `plural(2, ['день', 'дня', 'дней'])` → «дня». */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Календарные части момента в заданном поясе. */
function partsInZone(iso: string, timeZone: string): Parts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) map[p.type] = p.value;
  return {
    year: map.year ?? '',
    month: map.month ?? '',
    day: map.day ?? '',
    hour: map.hour ?? '',
    minute: map.minute ?? '',
  };
}

/** `HH:MM` момента в поясе `timeZone`. */
export function formatTime(iso: string, timeZone: string): string {
  const p = partsInZone(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** «22 августа» — дата момента в поясе `timeZone`. */
export function formatDayMonth(iso: string, timeZone: string): string {
  const p = partsInZone(iso, timeZone);
  return `${Number(p.day)} ${MONTHS_GENITIVE[Number(p.month) - 1] ?? ''}`;
}

/** Дата момента в поясе `timeZone` как `YYYY-MM-DD` (значение `<input type="date">`). */
export function isoDateInZone(iso: string, timeZone: string): string {
  const p = partsInZone(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function calendarDayNumber(p: Parts): number {
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / DAY_MS;
}

/**
 * На сколько календарных суток дата прилёта (в поясе прилёта) позже даты вылета (в поясе вылета).
 * 1 → пометка «+1».
 */
export function arrivalDayShift(
  departureIso: string,
  departureTz: string,
  arrivalIso: string,
  arrivalTz: string,
): number {
  return (
    calendarDayNumber(partsInZone(arrivalIso, arrivalTz)) -
    calendarDayNumber(partsInZone(departureIso, departureTz))
  );
}

/**
 * Обратный отсчёт до момента: «2 дня», «5 часов», «15 минут» (крупнейшая единица, с округлением вниз;
 * меньше минуты — «1 минута»). `null`, если момент уже наступил.
 */
export function formatCountdown(target: string | Date, now: Date = new Date()): string | null {
  const diff = new Date(target).getTime() - now.getTime();
  if (diff <= 0) return null;
  if (diff >= DAY_MS) {
    const d = Math.floor(diff / DAY_MS);
    return `${d} ${plural(d, ['день', 'дня', 'дней'])}`;
  }
  if (diff >= HOUR_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h} ${plural(h, ['час', 'часа', 'часов'])}`;
  }
  const m = Math.max(1, Math.floor(diff / MINUTE_MS));
  return `${m} ${plural(m, ['минута', 'минуты', 'минут'])}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(date: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Неверная дата: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Диапазон дат мероприятия из `YYYY-MM-DD`:
 * «12 ноября 2026», «12–14 ноября 2026», «30 октября – 2 ноября 2026», «30 декабря 2026 – 2 января 2027».
 */
export function formatDateRange(startsOn: string, endsOn: string): string {
  const s = parseDate(startsOn);
  const e = parseDate(endsOn);
  const month = (m: number) => MONTHS_GENITIVE[m - 1] ?? '';
  if (s.year !== e.year) {
    return `${s.day} ${month(s.month)} ${s.year} – ${e.day} ${month(e.month)} ${e.year}`;
  }
  if (s.month !== e.month) {
    return `${s.day} ${month(s.month)} – ${e.day} ${month(e.month)} ${e.year}`;
  }
  if (s.day !== e.day) return `${s.day}–${e.day} ${month(e.month)} ${e.year}`;
  return `${s.day} ${month(s.month)} ${s.year}`;
}

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Значение `<input type="datetime-local">` (`2026-08-22T08:40`) → строка для API без смещения
 * (`2026-08-22T08:40:00`): бэкенд трактует её в поясе аэропорта. `null` для пустого/неверного значения.
 */
export function localInputToApi(value: string): string | null {
  const m = LOCAL_INPUT_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(sec) > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}`;
}

/** ISO со смещением → значение `<input type="datetime-local">` в поясе аэропорта (`2026-08-22T08:40`). */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const p = partsInZone(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
