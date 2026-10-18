import { useState } from 'react';
import { useParams } from 'react-router';
import { isUnauthorized } from '../../api/errors';
import { useEvent, useUpdateEvent } from '../../api/hooks';
import { useBack } from '../../lib/useBack';
import { Button } from '../../ui/Button/Button';
import { ConfirmScreen } from '../../ui/ConfirmScreen/ConfirmScreen';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { SectionHeader } from '../../ui/SectionHeader/SectionHeader';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { EventErrorScreen, NotAdminScreen } from '../ErrorScreen/EventErrorScreen';
import { OpenInTelegramScreen } from '../ErrorScreen/ErrorScreen';
import { EventForm } from '../EventForm/EventForm';
import { eventToForm, formToUpdate } from '../EventForm/eventForm';
import styles from './EventSettings.module.css';

/** Настройки группы `/events/:id/admin/settings`: форма (PATCH изменённых полей) и вступление. */
export function EventSettings() {
  const eventId = useParams().id ?? '';
  const back = useBack(`/events/${eventId}/admin`);
  const { data: event, error, isPending, refetch } = useEvent(eventId);
  const save = useUpdateEvent(eventId);
  const toggle = useUpdateEvent(eventId);
  const [confirmClose, setConfirmClose] = useState(false);

  if (isPending) {
    return (
      <Screen>
        <div aria-busy="true">
          <Skeleton height={80} />
          <Skeleton height={54} count={6} />
        </div>
      </Screen>
    );
  }
  if (error) {
    return <EventErrorScreen error={error} eventId={eventId} onRetry={() => void refetch()} />;
  }
  if (!event.is_admin) return <NotAdminScreen eventId={eventId} />;
  if ([save.error, toggle.error].some((e) => e && isUnauthorized(e))) {
    return <OpenInTelegramScreen />;
  }

  if (confirmClose) {
    return (
      <ConfirmScreen
        title="Закрыть вступление?"
        text="Новые участники не смогут присоединиться, текущие сохранят доступ"
        confirmLabel="Закрыть вступление"
        pending={toggle.isPending}
        error={toggle.error?.message}
        onCancel={() => {
          toggle.reset();
          setConfirmClose(false);
        }}
        onConfirm={() =>
          toggle.mutate({ join_open: false }, { onSuccess: () => setConfirmClose(false) })
        }
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Администратор" title="Настройки группы" subtitle={event.title} />
      <EventForm
        initial={eventToForm(event)}
        submitLabel="Сохранить"
        pending={save.isPending}
        error={save.error}
        onSubmit={(values) => {
          const body = formToUpdate(values, event);
          if (Object.keys(body).length === 0) back();
          else save.mutate(body, { onSuccess: back });
        }}
      />
      <section className={styles.join}>
        <SectionHeader
          title="Вступление"
          description={
            event.join_open
              ? 'Открыто: по приглашению можно присоединиться'
              : 'Закрыто: по приглашению сейчас нельзя присоединиться'
          }
        />
        {event.join_open ? (
          <Button variant="danger" onClick={() => setConfirmClose(true)}>
            Закрыть вступление
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={toggle.isPending}
            aria-busy={toggle.isPending || undefined}
            onClick={() => toggle.mutate({ join_open: true })}
          >
            Открыть вступление
          </Button>
        )}
        {toggle.error && !confirmClose && (
          <p className={styles.error} role="alert">
            {toggle.error.message}
          </p>
        )}
      </section>
    </Screen>
  );
}
