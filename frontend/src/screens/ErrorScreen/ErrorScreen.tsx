import { Button } from '../../ui/Button/Button';
import { EmptyState } from '../../ui/EmptyState/EmptyState';
import { Screen } from '../../ui/Screen/Screen';
import styles from './ErrorScreen.module.css';

interface Props {
  title?: string;
  text: string;
  onRetry?: () => void;
}

/** Страница ошибки: карточка 👀 с заголовком и текстом, «Повторить попытку →». */
export function ErrorScreen({ title = 'Не удалось загрузить страницу', text, onRetry }: Props) {
  return (
    <Screen center>
      <div className={styles.box} role="alert">
        <EmptyState title={title} text={text} />
      </div>
      {onRetry && (
        <div className={styles.footer}>
          <Button onClick={onRetry} arrow="→">
            Повторить попытку
          </Button>
        </div>
      )}
    </Screen>
  );
}

export function OpenInTelegramScreen() {
  return (
    <ErrorScreen
      title="Откройте приложение из Telegram"
      text="Это мини-приложение работает только внутри Telegram. Откройте его через нашего бота."
    />
  );
}
