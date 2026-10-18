import { isApiErrorCode, isUnauthorized } from '../../api/errors';
import { ErrorCard } from '../ErrorScreen/ErrorScreen';

/** Ошибка загрузки вкладки — карточкой внутри хаба, чтобы остальной экран работал. */
export function TabError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (isUnauthorized(error)) {
    return (
      <ErrorCard
        title="Откройте приложение из Telegram"
        text="Это мини-приложение работает только внутри Telegram. Откройте его через нашего бота."
      />
    );
  }
  if (isApiErrorCode(error, 'FORBIDDEN')) {
    return <ErrorCard title="Управлять группой может только организатор" text={error.message} />;
  }
  if (isApiErrorCode(error, 'NOT_FOUND')) {
    return <ErrorCard title="Группа не найдена" text={error.message} />;
  }
  return <ErrorCard text={error.message} onRetry={onRetry} />;
}
