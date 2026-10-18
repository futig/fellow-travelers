import { useState } from 'react';
import styles from './Avatar.module.css';

interface Props {
  src?: string | null;
  loading?: boolean;
  /** Диаметр в px; по умолчанию 128 (экран профиля), в списках — 32. */
  size?: number;
}

export function Avatar({ src, loading = false, size = 128 }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && src !== failedSrc;

  return (
    <div
      className={`${styles.avatar} ${loading ? styles.loading : ''}`}
      style={size === 128 ? undefined : { width: size, height: size }}
    >
      {showImage ? (
        <img className={styles.image} src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : (
        !loading && (
          <span
            className={styles.placeholder}
            style={size === 128 ? undefined : { fontSize: size / 2 }}
            role="img"
            aria-label="Нет фото"
          >
            🤷🏻
          </span>
        )
      )}
    </div>
  );
}
