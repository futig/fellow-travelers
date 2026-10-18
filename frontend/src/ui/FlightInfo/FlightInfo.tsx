import type { components } from '../../api/schema';
import { arrivalDayShift, formatDayMonth, formatTime } from '../../lib/datetime';
import { formatBaggage, formatFlightNumber } from '../../lib/format';
import styles from './FlightInfo.module.css';

type Trip = components['schemas']['Trip'];

interface Props {
  trip: Trip;
  /** Число чемоданов в строке даты; не передано — не показываем. */
  baggageCount?: number;
  /** Пометка «Расписание внесено организатором» для `source=manual`. */
  showSource?: boolean;
  /** Кнопка ✏️ рядом с номером. */
  onEdit?: () => void;
  editLabel?: string;
}

type Tone = 'success' | 'error' | 'accent';

/** Расчётное время прилёта отличается от планового. */
export function isTripDelayed(trip: Trip): boolean {
  if (trip.status === 'delayed') return true;
  if (!trip.estimated_arrival) return false;
  return new Date(trip.estimated_arrival).getTime() !== new Date(trip.scheduled_arrival).getTime();
}

function tripStatus(trip: Trip): { text: string; tone: Tone } | null {
  if (trip.status === 'cancelled') return { text: 'Отменён', tone: 'error' };
  if (isTripDelayed(trip)) return { text: 'Задержан', tone: 'error' };
  switch (trip.status) {
    case 'scheduled':
      return { text: 'По расписанию', tone: 'success' };
    case 'departed':
      return { text: 'Вылетел', tone: 'accent' };
    case 'landed':
      return { text: 'Прилетел', tone: 'success' };
    default:
      return null;
  }
}

/** Карточка рейса: номер, дата, время вылета и прилёта в поясах своих аэропортов, статус. */
export function FlightInfo({ trip, baggageCount, showSource = false, onEdit, editLabel }: Props) {
  const dep = trip.departure_location;
  const arr = trip.arrival_location;
  const delayed = isTripDelayed(trip);
  const shift = arrivalDayShift(
    trip.scheduled_departure,
    dep.timezone,
    trip.effective_arrival,
    arr.timezone,
  );
  const status = tripStatus(trip);
  const date = formatDayMonth(trip.scheduled_departure, dep.timezone);
  const number = formatFlightNumber(trip.number);

  return (
    <section className={styles.card} aria-label={`Рейс ${number}`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.number}>{number}</p>
          <p className={styles.meta}>
            {baggageCount === undefined ? date : `${date} · ${formatBaggage(baggageCount)}`}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            className={styles.edit}
            onClick={onEdit}
            aria-label={editLabel ?? 'Изменить рейс'}
          >
            ✏️
          </button>
        )}
      </div>

      <div className={styles.route}>
        <div className={styles.point}>
          <span className={styles.time}>
            <span className={styles.srOnly}>Вылет </span>
            {formatTime(trip.scheduled_departure, dep.timezone)}
          </span>
        </div>
        <div className={styles.line} aria-hidden="true">
          <span className={styles.rule} />
          <span>✈️</span>
          <span className={styles.rule} />
        </div>
        <div className={`${styles.point} ${styles.end}`}>
          <span className={`${styles.time} ${delayed ? styles.late : ''}`}>
            <span className={styles.srOnly}>Прилёт </span>
            {formatTime(trip.effective_arrival, arr.timezone)}
            {shift > 0 && <sup className={styles.shift}>+{shift}</sup>}
          </span>
          {delayed && (
            <s className={styles.planned}>
              <span className={styles.srOnly}>по расписанию </span>
              {formatTime(trip.scheduled_arrival, arr.timezone)}
            </s>
          )}
        </div>
      </div>

      <div className={styles.cities}>
        <span>
          {dep.city}, {dep.code}
        </span>
        <span>
          {arr.city}, {arr.code}
        </span>
      </div>

      {status && <p className={`${styles.status} ${styles[status.tone]}`}>● {status.text}</p>}
      {showSource && trip.source === 'manual' && (
        <p className={styles.source}>Расписание внесено организатором</p>
      )}
    </section>
  );
}
