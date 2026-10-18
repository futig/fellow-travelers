import { useId } from 'react';
import styles from './NumberInput.module.css';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Пояснение под счётчиком (например, почему больше нельзя). */
  hint?: string;
}

/** Счётчик [−] значение [+] с границами. */
export function NumberInput({ label, value, onChange, min, max, hint }: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div
        className={styles.row}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
      >
        <button
          type="button"
          className={styles.step}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="Меньше"
        >
          −
        </button>
        <output className={styles.value} aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className={styles.step}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="Больше"
        >
          +
        </button>
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
