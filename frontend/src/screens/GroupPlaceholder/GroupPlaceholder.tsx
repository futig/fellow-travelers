import { useParams } from 'react-router';
import { useEvent } from '../../api/hooks';
import { formatDateRange } from '../../lib/datetime';
import { useBack } from '../../lib/useBack';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { EventErrorScreen } from '../ErrorScreen/EventErrorScreen';
import styles from './GroupPlaceholder.module.css';

/** Временный экран «Моя поездка» (`/events/:id`) до инкремента 5. */
export function GroupPlaceholder() {
  const eventId = useParams().id ?? '';
  useBack('/');
  const { data: event, error, isPending, refetch } = useEvent(eventId);

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
    </Screen>
  );
}
