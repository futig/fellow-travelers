import type { components } from '../api/schema';

type Trip = components['schemas']['Trip'];
type Contact = components['schemas']['Contact'];

export const SVO: components['schemas']['Location'] = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'airport',
  code: 'SVO',
  name: 'Шереметьево',
  city: 'Москва',
  country: 'RU',
  timezone: 'Europe/Moscow',
};

export const GDZ: components['schemas']['Location'] = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'airport',
  code: 'GDZ',
  name: 'Геленджик',
  city: 'Геленджик',
  country: 'RU',
  timezone: 'Europe/Moscow',
};

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    event_id: '44444444-4444-4444-8444-444444444444',
    mode: 'flight',
    number: 'SU1148',
    departure_location: SVO,
    arrival_location: GDZ,
    scheduled_departure: '2026-08-22T08:40:00+03:00',
    scheduled_arrival: '2026-08-22T12:25:00+03:00',
    estimated_arrival: null,
    effective_arrival: '2026-08-22T12:25:00+03:00',
    status: 'scheduled',
    source: 'manual',
    updated_at: '2026-08-01T10:00:00+00:00',
    ...overrides,
  };
}

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    user_id: '55555555-5555-4555-8555-555555555555',
    first_name: 'Луна',
    last_name: 'Сокол',
    username: 'luna_sokol',
    phone: '+79122042912',
    photo_url: null,
    ...overrides,
  };
}
