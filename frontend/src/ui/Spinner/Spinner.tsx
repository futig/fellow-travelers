import styles from './Spinner.module.css';

/** Индикатор загрузки по центру. */
export function Spinner({ label = 'Загрузка' }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
