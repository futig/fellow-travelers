import type { Location, Trip, TripInput, TripUpdate } from '../../api/types';
import { isoToLocalInput, localInputToApi } from '../../lib/datetime';
import { formatFlightNumber } from '../../lib/format';

/** Значения формы рейса; время — как в `<input type="datetime-local">`, в поясе своего аэропорта. */
export interface TripFormValues {
  number: string;
  departure: Location | null;
  arrival: Location | null;
  departure_at: string;
  arrival_at: string;
  /** Расчётный прилёт (только при правке); пусто — по расписанию. */
  estimated_at: string;
}

export type TripFormField = keyof TripFormValues;
export type TripFormErrors = Partial<Record<TripFormField, string>>;

/** Формат номера из контракта. */
export const TRIP_NUMBER_RE = /^[A-Za-z0-9]{2,3}\s?\d{1,5}$/;
export const TRIP_NUMBER_MAX = 9;

export const EMPTY_TRIP_FORM: TripFormValues = {
  number: '',
  departure: null,
  arrival: null,
  departure_at: '',
  arrival_at: '',
  estimated_at: '',
};

/** Как бэкенд: без пробелов, верхний регистр (`su 1148` → `SU1148`). */
export function normalizeTripNumber(number: string): string {
  return number.replace(/\s/g, '').toUpperCase();
}

export function tripToForm(trip: Trip): TripFormValues {
  const arrTz = trip.arrival_location.timezone;
  return {
    number: formatFlightNumber(trip.number),
    departure: trip.departure_location,
    arrival: trip.arrival_location,
    departure_at: isoToLocalInput(trip.scheduled_departure, trip.departure_location.timezone),
    arrival_at: isoToLocalInput(trip.scheduled_arrival, arrTz),
    estimated_at: trip.estimated_arrival ? isoToLocalInput(trip.estimated_arrival, arrTz) : '',
  };
}

export function validateTripForm(v: TripFormValues): TripFormErrors {
  const errors: TripFormErrors = {};
  const number = v.number.trim();
  if (!number) errors.number = 'Укажите номер рейса';
  else if (!TRIP_NUMBER_RE.test(number)) errors.number = 'Номер рейса — например, SU 1148';
  if (!v.departure) errors.departure = 'Выберите аэропорт вылета';
  if (!v.arrival) errors.arrival = 'Выберите аэропорт прилёта';
  else if (v.departure && v.departure.id === v.arrival.id) {
    errors.arrival = 'Аэропорт прилёта совпадает с аэропортом вылета';
  }
  if (!localInputToApi(v.departure_at)) errors.departure_at = 'Укажите время вылета';
  if (!localInputToApi(v.arrival_at)) errors.arrival_at = 'Укажите время прилёта';
  if (v.estimated_at && !localInputToApi(v.estimated_at)) {
    errors.estimated_at = 'Укажите время полностью или очистите поле';
  }
  return errors;
}

/** Тело POST; вызывать только для прошедших проверку значений. */
export function formToTripInput(v: TripFormValues): TripInput {
  return {
    mode: 'flight',
    number: v.number.trim().toUpperCase(),
    departure_location_id: v.departure?.id ?? '',
    arrival_location_id: v.arrival?.id ?? '',
    scheduled_departure: localInputToApi(v.departure_at) ?? '',
    scheduled_arrival: localInputToApi(v.arrival_at) ?? '',
  };
}

/**
 * Только изменённые поля для PATCH. Время без смещения бэкенд трактует в поясе аэропорта, а
 * непереданное время не трогает — поэтому при смене аэропорта отправляем и его время: введённое
 * «08:40» должно остаться 08:40 по новому аэропорту.
 */
export function formToTripUpdate(v: TripFormValues, trip: Trip): TripUpdate {
  const initial = tripToForm(trip);
  const body: TripUpdate = {};
  const number = v.number.trim().toUpperCase();
  if (normalizeTripNumber(number) !== trip.number) body.number = number;

  const departureChanged = v.departure?.id !== trip.departure_location.id;
  const arrivalChanged = v.arrival?.id !== trip.arrival_location.id;
  if (departureChanged && v.departure) body.departure_location_id = v.departure.id;
  if (arrivalChanged && v.arrival) body.arrival_location_id = v.arrival.id;

  if (departureChanged || v.departure_at !== initial.departure_at) {
    body.scheduled_departure = localInputToApi(v.departure_at) ?? '';
  }
  if (arrivalChanged || v.arrival_at !== initial.arrival_at) {
    body.scheduled_arrival = localInputToApi(v.arrival_at) ?? '';
  }
  if (v.estimated_at !== initial.estimated_at || (arrivalChanged && v.estimated_at)) {
    body.estimated_arrival = v.estimated_at ? localInputToApi(v.estimated_at) : null;
  }
  return body;
}

const API_FIELD_TO_FORM: Record<string, TripFormField> = {
  number: 'number',
  departure_location_id: 'departure',
  arrival_location_id: 'arrival',
  scheduled_departure: 'departure_at',
  scheduled_arrival: 'arrival_at',
  estimated_arrival: 'estimated_at',
};

/** `details.fields` из 422 → ошибки полей формы рейса. */
export function apiFieldsToTripForm(fields: Record<string, string> | undefined): TripFormErrors {
  const errors: TripFormErrors = {};
  for (const [key, message] of Object.entries(fields ?? {})) {
    const field = API_FIELD_TO_FORM[key.split('.')[0] ?? ''];
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}
