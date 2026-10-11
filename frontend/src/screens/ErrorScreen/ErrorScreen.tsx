import { Button } from '../../ui/Button/Button';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';
import styles from './ErrorScreen.module.css';

interface Props {
  title: string;
  text: string;
  onRetry?: () => void;
}

export function ErrorScreen({ title, text, onRetry }: Props) {
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={text} />
      {onRetry && (
        <div className={styles.footer}>
          <Button onClick={onRetry}>Повторить</Button>
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
