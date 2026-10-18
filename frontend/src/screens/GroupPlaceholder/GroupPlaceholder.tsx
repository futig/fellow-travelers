import { useNavigate, useParams } from 'react-router';
import { isApiErrorCode, isUnauthorized } from '../../api/errors';
import { useEvent } from '../../api/hooks';
import { formatDateRange } from '../../lib/datetime';
import { useBack } from '../../lib/useBack';
import { Button } from '../../ui/Button/Button';
import { EmptyState } from '../../ui/EmptyState/EmptyState';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { ErrorScreen, OpenInTelegramScreen } from '../ErrorScreen/ErrorScreen';
import styles from './GroupPlaceholder.module.css';

interface Props {
  /** Открыто как управление группой (`/events/:id/admin`). */
  admin?: boolean;
}

/** Временный экран группы до «Моей поездки» и «Управления» (инкременты 5 и 6). */
export function GroupPlaceholder({ admin = false }: Props) {
  const eventId = useParams().id ?? '';
  const navigate = useNavigate();
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
    if (isUnauthorized(error)) return <OpenInTelegramScreen />;
    if (isApiErrorCode(error, 'NOT_FOUND') || isApiErrorCode(error, 'VALIDATION_ERROR')) {
      return (
        <Screen center>
          <EmptyState title="Группа не найдена" />
          <div className={styles.footer}>
            <Button onClick={() => void navigate('/')}>Мои группы</Button>
          </div>
        </Screen>
      );
    }
    return <ErrorScreen text={error.message} onRetry={() => void refetch()} />;
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={admin ? 'Администратор' : 'Ваша поездка'}
        title={event.title}
        subtitle={formatDateRange(event.starts_on, event.ends_on)}
      />
      <p className={styles.card}>Экран группы появится в следующей версии</p>
    </Screen>
  );
}
