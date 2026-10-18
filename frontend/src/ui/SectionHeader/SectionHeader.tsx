import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

interface Props {
  title: string;
  description?: ReactNode;
}

/** Заголовок секции (Header L2): H3 20/28 + описание 16/22. */
export function SectionHeader({ title, description }: Props) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
