import type { FormEvent, ReactNode } from 'react';
import styles from './Form.module.css';

interface FormProps {
  children: ReactNode;
  onSubmit: () => void;
  'aria-busy'?: boolean;
}

/** Форма экрана: поля колонкой (gap 12, padding-top 20). Нативную валидацию отключаем — своя. */
export function Form({ children, onSubmit, 'aria-busy': busy }: FormProps) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy || undefined}>
      {children}
    </form>
  );
}

/** Колонка полей без `<form>` (gap 12, padding-top 20). */
export function FormFields({ children }: { children: ReactNode }) {
  return <div className={styles.fields}>{children}</div>;
}

/** Кнопки под формой (padding-top 24, gap 12). */
export function FormFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}
