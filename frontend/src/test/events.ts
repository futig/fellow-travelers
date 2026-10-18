import type { Event } from '../api/types';

export const EVENT_ID = '44444444-4444-4444-8444-444444444444';

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    title: 'Слёт в Геленджике',
    starts_on: '2026-08-22',
    ends_on: '2026-08-24',
    meeting_point: { address: 'Аэропорт Геленджик, выход № 3' },
    pickup_point: { address: 'Аэропорт Геленджик, выход № 3' },
    destination: { address: 'Геленджик, ул. Курортная, 1' },
    meeting_instruction: 'Ждём у стойки информации',
    chat_url: null,
    join_open: true,
    is_admin: true,
    is_participant: false,
    ...overrides,
  };
}
