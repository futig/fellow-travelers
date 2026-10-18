import type { ReactNode } from 'react';
import styles from './Screen.module.css';

interface Props {
  children: ReactNode;
  /** Содержимое по центру экрана по вертикали (подтверждения, ошибки). */
  center?: boolean;
}

export function Screen({ children, center = false }: Props) {
  return <main className={`${styles.screen} ${center ? styles.center : ''}`}>{children}</main>;
}
