import { Button } from '../Button/Button';
import { Screen } from '../Screen/Screen';
import styles from './ConfirmScreen.module.css';

interface Props {
  title: string;
  text?: string;
  /** Текст действия (danger), например «Да, поеду один». */
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  /** Действие выполняется: кнопки заблокированы. */
  pending?: boolean;
  /** Ошибка выполнения действия. */
  error?: string | null;
}

/** Экран подтверждения по центру: заголовок, текст, «вернуться» (primary) и действие (danger). */
export function ConfirmScreen({
  title,
  text,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Нет, вернуться обратно',
  onCancel,
  pending = false,
  error,
}: Props) {
  return (
    <Screen center>
      <section className={styles.box} aria-busy={pending || undefined}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {text && <p className={styles.description}>{text}</p>}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </Screen>
  );
}
