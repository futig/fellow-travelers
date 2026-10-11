import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'secondary';
  /** Стрелка справа от текста (например «→»). */
  arrow?: string;
  children: ReactNode;
}

export function Button({ variant = 'primary', arrow, children, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]}`} {...rest}>
      <span>{children}</span>
      {arrow && <span aria-hidden="true">{arrow}</span>}
    </button>
  );
}
