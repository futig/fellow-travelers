import { isUnauthorized } from '../../api/errors';
import { useCreateEvent } from '../../api/hooks';
import { useBack, useReplace } from '../../lib/useBack';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { OpenInTelegramScreen } from '../ErrorScreen/ErrorScreen';
import { EventForm } from '../EventForm/EventForm';
import { EMPTY_EVENT_FORM, formToCreate } from '../EventForm/eventForm';

/** Создание группы `/events/new` → управление группой (с заменой: «Назад» — на «Мои группы»). */
export function CreateEvent() {
  useBack('/');
  const replace = useReplace();
  const create = useCreateEvent();

  if (create.error && isUnauthorized(create.error)) return <OpenInTelegramScreen />;

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Новая группа"
        title="Создать группу"
        subtitle="Вы станете организатором. Участники присоединятся по приглашению"
      />
      <EventForm
        initial={EMPTY_EVENT_FORM}
        submitLabel="Создать группу"
        pending={create.isPending}
        error={create.error}
        onSubmit={(values) =>
          create.mutate(formToCreate(values), {
            onSuccess: (event) => replace(`/events/${event.id}/admin`),
          })
        }
      />
    </Screen>
  );
}
