import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'dark';
  /** Иконка слева от текста (эмодзи), например «✏️». */
  icon?: ReactNode;
  /** Стрелка справа от текста (например «→»). */
  arrow?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  icon,
  arrow,
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]}`} {...rest}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {arrow && <span aria-hidden="true">{arrow}</span>}
    </button>
  );
}

/** Две (или больше) кнопки в ряд. */
export function ButtonGroup({ children }: { children: ReactNode }) {
  return <div className={styles.group}>{children}</div>;
}
