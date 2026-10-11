import styles from './ProgressBar.module.css';

interface Props {
  total: number;
  current: number;
}

export function ProgressBar({ total, current }: Props) {
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < current ? styles.active : styles.segment} />
      ))}
    </div>
  );
}
