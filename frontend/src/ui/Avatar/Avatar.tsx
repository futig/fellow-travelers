import { useState } from 'react';
import styles from './Avatar.module.css';

interface Props {
  src?: string | null;
  loading?: boolean;
}

export function Avatar({ src, loading = false }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && src !== failedSrc;

  return (
    <div className={`${styles.avatar} ${loading ? styles.loading : ''}`}>
      {showImage ? (
        <img className={styles.image} src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : (
        !loading && (
          <span className={styles.placeholder} role="img" aria-label="Нет фото">
            🤷🏻
          </span>
        )
      )}
    </div>
  );
}
