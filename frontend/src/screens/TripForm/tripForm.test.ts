import { describe, expect, it } from 'vitest';
import type { Location } from '../../api/types';
import { GDZ, makeTrip, SVO } from '../../test/fixtures';
import {
  apiFieldsToTripForm,
  EMPTY_TRIP_FORM,
  formToTripInput,
  formToTripUpdate,
  tripToForm,
  validateTripForm,
} from './tripForm';

const KZN: Location = {
  ...SVO,
  id: '99999999-9999-4999-8999-999999999999',
  code: 'KZN',
  name: 'Казань',
  city: 'Казань',
};
const SVX: Location = {
  ...KZN,
  id: '88888888-8888-4888-8888-888888888888',
  code: 'SVX',
  city: 'Екатеринбург',
  timezone: 'Asia/Yekaterinburg',
};

const filled = {
  ...EMPTY_TRIP_FORM,
  number: 'su 1148',
  departure: SVO,
  arrival: GDZ,
  departure_at: '2026-08-22T08:40',
  arrival_at: '2026-08-22T12:25',
};

describe('validateTripForm', () => {
  it('номер по шаблону контракта', () => {
    for (const ok of ['SU 1148', 'SU1148', 'S71024', 'ABC 12345']) {
      expect(validateTripForm({ ...filled, number: ok }).number).toBeUndefined();
    }
    for (const bad of ['SU-1148', 'S', 'SU 123456', 'SU  1148']) {
      expect(validateTripForm({ ...filled, number: bad }).number).toBe(
        'Номер рейса — например, SU 1148',
      );
    }
  });

  it('обязательные поля и одинаковые аэропорты', () => {
    expect(Object.keys(validateTripForm(EMPTY_TRIP_FORM)).sort()).toEqual(
      ['arrival', 'arrival_at', 'departure', 'departure_at', 'number'].sort(),
    );
    expect(validateTripForm({ ...filled, arrival: SVO }).arrival).toBe(
      'Аэропорт прилёта совпадает с аэропортом вылета',
    );
    expect(validateTripForm(filled)).toEqual({});
  });
});

describe('formToTripInput', () => {
  it('время — без смещения, номер — в верхнем регистре', () => {
    expect(formToTripInput(filled)).toEqual({
      mode: 'flight',
      number: 'SU 1148',
      departure_location_id: SVO.id,
      arrival_location_id: GDZ.id,
      scheduled_departure: '2026-08-22T08:40:00',
      scheduled_arrival: '2026-08-22T12:25:00',
    });
  });
});

describe('formToTripUpdate', () => {
  const trip = makeTrip();

  it('предзаполнение в поясе аэропортов; без изменений — пустое тело', () => {
    const v = tripToForm(trip);
    expect(v).toMatchObject({
      number: 'SU 1148',
      departure_at: '2026-08-22T08:40',
      arrival_at: '2026-08-22T12:25',
      estimated_at: '',
    });
    expect(formToTripUpdate(v, trip)).toEqual({});
  });

  it('только изменённые поля; номер сравнивается без пробелов', () => {
    const v = { ...tripToForm(trip), number: 'su1148', arrival_at: '2026-08-22T12:50' };
    expect(formToTripUpdate(v, trip)).toEqual({ scheduled_arrival: '2026-08-22T12:50:00' });
  });

  it('расчётное время: задали → значение, очистили → null', () => {
    const v = { ...tripToForm(trip), estimated_at: '2026-08-22T13:10' };
    expect(formToTripUpdate(v, trip)).toEqual({ estimated_arrival: '2026-08-22T13:10:00' });

    const delayed = makeTrip({ estimated_arrival: '2026-08-22T13:10:00+03:00' });
    const cleared = { ...tripToForm(delayed), estimated_at: '' };
    expect(tripToForm(delayed).estimated_at).toBe('2026-08-22T13:10');
    expect(formToTripUpdate(cleared, delayed)).toEqual({ estimated_arrival: null });
  });

  it('сменили аэропорт — отправляем и его время (местное время нового аэропорта)', () => {
    const v = { ...tripToForm(trip), departure: KZN };
    expect(formToTripUpdate(v, trip)).toEqual({
      departure_location_id: KZN.id,
      scheduled_departure: '2026-08-22T08:40:00',
    });
    const a = { ...tripToForm(trip), arrival: SVX };
    expect(formToTripUpdate(a, trip)).toEqual({
      arrival_location_id: SVX.id,
      scheduled_arrival: '2026-08-22T12:25:00',
    });
  });
});

describe('apiFieldsToTripForm', () => {
  it('ключи бэкенда → поля формы', () => {
    expect(
      apiFieldsToTripForm({
        number: 'Такой рейс уже добавлен',
        arrival_location_id: 'Аэропорты совпадают',
        scheduled_arrival: 'Прилёт должен быть позже вылета',
      }),
    ).toEqual({
      number: 'Такой рейс уже добавлен',
      arrival: 'Аэропорты совпадают',
      arrival_at: 'Прилёт должен быть позже вылета',
    });
  });
});
