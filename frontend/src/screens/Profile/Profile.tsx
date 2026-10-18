import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { isUnauthorized } from '../../api/errors';
import { fetchMe, meQueryKey } from '../../api/me';
import { formatName, formatPhone } from '../../lib/format';
import { getInitDataPhotoUrl } from '../../lib/telegram';
import { useBack } from '../../lib/useBack';
import { Avatar } from '../../ui/Avatar/Avatar';
import { Button } from '../../ui/Button/Button';
import { Field, FieldSkeleton } from '../../ui/Field/Field';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import { ErrorScreen, OpenInTelegramScreen } from '../ErrorScreen/ErrorScreen';
import styles from './Profile.module.css';
import { useShareContact } from './useShareContact';

const HEADER = {
  title: 'Ваши данные',
  subtitle: 'Что увидят ваши попутчики',
  step: { current: 1, total: 5 },
};

const NO_PHONE_HINT =
  'Телефон нужен, чтобы попутчики могли с вами связаться. Без него нельзя отправить заявку.';

export function Profile() {
  const navigate = useNavigate();
  useBack('/');
  const {
    data: me,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    retry: false,
  });
  const { sharing, share } = useShareContact(async () => {
    const result = await refetch();
    return result.data?.has_phone ?? false;
  });

  if (isPending) {
    return (
      <Screen>
        <ScreenHeader {...HEADER} />
        <div className={styles.form} aria-busy="true">
          <Avatar loading />
          <FieldSkeleton label="Имя" />
          <FieldSkeleton label="Телеграм" />
          <FieldSkeleton label="Номер телефона" />
        </div>
        <div className={styles.footer}>
          <Button disabled arrow="→">
            Далее
          </Button>
        </div>
      </Screen>
    );
  }

  if (error) {
    if (isUnauthorized(error)) return <OpenInTelegramScreen />;
    return <ErrorScreen text={error.message} onRetry={() => void refetch()} />;
  }

  return (
    <Screen>
      <ScreenHeader {...HEADER} />
      <div className={styles.form}>
        <Avatar src={me.photo_url ?? getInitDataPhotoUrl()} />
        <Field label="Имя" value={formatName(me.first_name, me.last_name)} />
        <Field
          label="Телеграм"
          value={me.username ? `@${me.username}` : 'нет'}
          muted={!me.username}
        />
        <Field
          label="Номер телефона"
          value={me.phone ? formatPhone(me.phone) : ''}
          hint={me.has_phone ? undefined : NO_PHONE_HINT}
        />
        {!me.has_phone && (
          <Button variant="secondary" onClick={() => void share()} disabled={sharing}>
            Поделиться номером
          </Button>
        )}
      </div>
      <div className={styles.footer}>
        <Button disabled={!me.has_phone} arrow="→" onClick={() => void navigate('/')}>
          Далее
        </Button>
      </div>
    </Screen>
  );
}
