import styles from './Skeleton.module.css';

interface Props {
  /** Высота в px; по умолчанию 68 (как Option). */
  height?: number;
  /** Сколько одинаковых блоков подряд. */
  count?: number;
}

/** Белые мигающие блоки на время загрузки (родитель ставит `aria-busy`). */
export function Skeleton({ height = 68, count = 1 }: Props) {
  return (
    <div className={styles.list} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.block} style={{ height }} />
      ))}
    </div>
  );
}
