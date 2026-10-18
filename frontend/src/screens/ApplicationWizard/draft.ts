import type { Application, ApplicationInput, Trip, WaitMinutes } from '../../api/types';

/** Больше двух мест багажа в одно такси не поместится (контракт: вместимость 2 места). */
export const MAX_BAGGAGE = 2;

/** Черновик заявки в мастере: поля заполняются по шагам. */
export interface Draft {
  trip?: Trip;
  withCompanion?: boolean;
  /** Искать попутчиков; `false` — «Не искать попутчиков» (заявка сразу `solo`). */
  seek?: boolean;
  baggageCount?: number;
  maxWait?: WaitMinutes;
}

/** Выбор на шаге «Летите с кем-то?». */
export type CompanionChoice = 'alone' | 'plusOne' | 'noSeek';

export function companionChoice(draft: Draft): CompanionChoice | undefined {
  if (draft.seek === false) return 'noSeek';
  if (draft.withCompanion === undefined) return undefined;
  return draft.withCompanion ? 'plusOne' : 'alone';
}

export function applyCompanionChoice(draft: Draft, choice: CompanionChoice): Draft {
  switch (choice) {
    case 'alone':
      return { ...draft, withCompanion: false, seek: true };
    case 'plusOne':
      return { ...draft, withCompanion: true, seek: true };
    case 'noSeek':
      return { ...draft, withCompanion: false, seek: false };
  }
}

/**
 * Черновик из существующей заявки. `seek` — `true`: из мастера отправка снова запускает подбор
 * (в т.ч. после «Еду самостоятельно» ради правки, см. frontend-plan); «Не искать» выбирают явно.
 */
export function draftFromApplication(app: Application | undefined): Draft {
  if (!app) return {};
  return {
    trip: app.trip,
    withCompanion: app.with_companion,
    seek: true,
    baggageCount: Math.min(app.baggage_count, MAX_BAGGAGE),
    maxWait: app.max_wait_minutes,
  };
}

/** Тело PUT из полного черновика (`seek_companions` — всегда явно); `null`, если чего-то не хватает. */
export function draftToInput(draft: Draft): ApplicationInput | null {
  const { trip, withCompanion, seek, baggageCount, maxWait } = draft;
  if (
    !trip ||
    withCompanion === undefined ||
    seek === undefined ||
    baggageCount === undefined ||
    maxWait === undefined
  ) {
    return null;
  }
  return {
    trip_id: trip.id,
    with_companion: withCompanion,
    baggage_count: baggageCount,
    max_wait_minutes: maxWait,
    seek_companions: seek,
  };
}
