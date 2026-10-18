import { useId } from 'react';
import styles from './Checkbox.module.css';

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Чекбокс в белой карточке; вся карточка — подпись, нажимается целиком. */
export function Checkbox({ label, checked, onChange, disabled }: Props) {
  const id = useId();
  return (
    <label className={styles.box} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.label}>{label}</span>
    </label>
  );
}
