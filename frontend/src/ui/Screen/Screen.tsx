import type { ReactNode } from 'react';
import styles from './Screen.module.css';

export function Screen({ children }: { children: ReactNode }) {
  return <main className={styles.screen}>{children}</main>;
}
