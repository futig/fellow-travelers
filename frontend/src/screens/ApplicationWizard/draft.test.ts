import { describe, expect, it } from 'vitest';
import type { Application } from '../../api/types';
import { makeTrip } from '../../test/fixtures';
import { applyCompanionChoice, companionChoice, draftFromApplication, draftToInput } from './draft';

const trip = makeTrip();

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app',
    event_id: trip.event_id,
    trip,
    with_companion: true,
    passengers: 2,
    baggage_count: 2,
    max_wait_minutes: 30,
    status: 'solo',
    at_meeting_point: false,
    departed_at: null,
    transfer_id: null,
    created_at: '2026-08-01T10:00:00+00:00',
    updated_at: '2026-08-01T10:00:00+00:00',
    ...overrides,
  };
}

describe('draft', () => {
  it('выбор попутчиков ↔ поля черновика', () => {
    expect(applyCompanionChoice({}, 'alone')).toEqual({ withCompanion: false, seek: true });
    expect(applyCompanionChoice({}, 'plusOne')).toEqual({ withCompanion: true, seek: true });
    expect(applyCompanionChoice({}, 'noSeek')).toEqual({ withCompanion: false, seek: false });
    expect(companionChoice({})).toBeUndefined();
    expect(companionChoice({ withCompanion: true, seek: false })).toBe('noSeek');
    expect(companionChoice({ withCompanion: true, seek: true })).toBe('plusOne');
  });

  it('из заявки: все поля, seek=true', () => {
    expect(draftFromApplication(makeApplication())).toEqual({
      trip,
      withCompanion: true,
      seek: true,
      baggageCount: 2,
      maxWait: 30,
    });
    expect(draftFromApplication(undefined)).toEqual({});
  });

  it('тело PUT только из полного черновика, seek_companions — явно', () => {
    expect(draftToInput({ trip, withCompanion: false, seek: true, baggageCount: 0 })).toBeNull();
    expect(
      draftToInput({ trip, withCompanion: false, seek: false, baggageCount: 0, maxWait: 0 }),
    ).toEqual({
      trip_id: trip.id,
      with_companion: false,
      baggage_count: 0,
      max_wait_minutes: 0,
      seek_companions: false,
    });
  });
});
