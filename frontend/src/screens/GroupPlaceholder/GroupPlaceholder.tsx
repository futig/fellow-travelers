import { useNavigate, useParams } from 'react-router';
import { useEvent, useMyApplication } from '../../api/hooks';
import { formatDateRange } from '../../lib/datetime';
import { useBack } from '../../lib/useBack';
import { Button } from '../../ui/Button/Button';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { EventErrorScreen } from '../ErrorScreen/EventErrorScreen';
import styles from './GroupPlaceholder.module.css';

/** Временный экран «Моя поездка» (`/events/:id`) до инкремента 5. */
export function GroupPlaceholder() {
  const eventId = useParams().id ?? '';
  useBack('/');
  const navigate = useNavigate();
  const { data: event, error, isPending, refetch } = useEvent(eventId);
  // 404 — заявки нет; пока не ясно, есть ли она, кнопку не показываем.
  const application = useMyApplication(eventId);

  if (isPending) {
    return (
      <Screen>
        <div aria-busy="true">
          <Skeleton height={80} />
        </div>
      </Screen>
    );
  }

  if (error) {
    return <EventErrorScreen error={error} eventId={eventId} onRetry={() => void refetch()} />;
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Ваша поездка"
        title={event.title}
        subtitle={formatDateRange(event.starts_on, event.ends_on)}
      />
      <p className={styles.card}>Экран группы появится в следующей версии</p>
      {event.is_participant && !application.isPending && (
        <div className={styles.footer}>
          {application.data ? (
            <Button arrow="→" onClick={() => void navigate(`/events/${eventId}/apply?step=review`)}>
              Изменить заявку
            </Button>
          ) : (
            <Button arrow="→" onClick={() => void navigate(`/events/${eventId}/apply`)}>
              Заполнить заявку
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}
