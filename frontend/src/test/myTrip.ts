import type { Application, MyTrip, Transfer, TransferMember } from '../api/types';
import { EVENT_ID, makeEvent } from './events';
import { makeContact, makeTrip } from './fixtures';

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    event_id: EVENT_ID,
    trip: makeTrip(),
    with_companion: false,
    passengers: 1,
    baggage_count: 2,
    max_wait_minutes: 15,
    status: 'searching',
    at_meeting_point: false,
    departed_at: null,
    transfer_id: null,
    created_at: '2026-08-01T10:00:00+00:00',
    updated_at: '2026-08-01T10:00:00+00:00',
    ...overrides,
  };
}

export function makeMember(overrides: Partial<TransferMember> = {}): TransferMember {
  return {
    application_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    is_me: false,
    contact: makeContact(),
    passengers: 1,
    baggage_count: 1,
    trip_number: 'SU1148',
    effective_arrival: '2026-08-22T12:25:00+03:00',
    at_meeting_point: false,
    departed_at: null,
    ...overrides,
  };
}

export function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    event_id: EVENT_ID,
    status: 'active',
    passengers_total: 2,
    baggage_total: 2,
    members: [],
    created_at: '2026-08-10T10:00:00+00:00',
    ...overrides,
  };
}

/** Поездка участника; по умолчанию заявка `searching` без трансфера. */
export function makeMyTrip(overrides: Partial<MyTrip> = {}): MyTrip {
  const event = makeEvent({ is_admin: false, is_participant: true });
  return {
    event,
    application: makeApplication(),
    transfer: null,
    taxi: { from: event.pickup_point, to: event.destination, yandex_go_url: null },
    ...overrides,
  };
}
