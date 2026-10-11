import { useId } from 'react';
import styles from './Field.module.css';

interface Props {
  label: string;
  value: string;
  /** Приглушённое значение (например «нет»). */
  muted?: boolean;
  /** Пояснение под полем. */
  hint?: string;
}

/** Поле только для чтения с подписью и необязательной подсказкой. */
export function Field({ label, value, muted = false, hint }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`${styles.input} ${muted ? styles.muted : ''}`}
        value={value}
        readOnly
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Заглушка той же геометрии на время загрузки. */
export function FieldSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.field} aria-hidden="true">
      <span className={styles.label}>{label}</span>
      <span className={`${styles.input} ${styles.skeleton}`} />
    </div>
  );
}
