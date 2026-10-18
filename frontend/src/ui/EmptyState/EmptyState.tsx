import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  title: string;
  text?: ReactNode;
  icon?: string;
}

/** Белая карточка «пусто / не получилось»: 👀, заголовок акцентным цветом, текст. */
export function EmptyState({ title, text, icon = '👀' }: Props) {
  return (
    <section className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.title}>{title}</h2>
      {text && <p className={styles.text}>{text}</p>}
    </section>
  );
}
