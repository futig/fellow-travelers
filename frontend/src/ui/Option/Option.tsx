import type { ReactNode } from 'react';
import styles from './Option.module.css';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Слева: эмодзи (строка, 32px) или элемент (например `<Avatar size={32} />`). */
  leading?: ReactNode;
  /** Справа: «→» (выбор), «✏️» (правка) или ничего. */
  trailing?: 'arrow' | 'edit' | 'none';
  /** С обработчиком карточка — кнопка, без него — просто блок. */
  onClick?: () => void;
  disabled?: boolean;
  /** Имя кнопки для скринридера, если текста карточки недостаточно (например «Изменить рейс»). */
  'aria-label'?: string;
}

const TRAILING = { arrow: '→', edit: '✏️', none: null } as const;

/** Белая карточка-выбор 68px. */
export function Option({
  title,
  subtitle,
  leading,
  trailing = 'arrow',
  onClick,
  disabled = false,
  'aria-label': ariaLabel,
}: Props) {
  const content = (
    <>
      {leading !== undefined &&
        (typeof leading === 'string' ? (
          <span className={styles.emoji} aria-hidden="true">
            {leading}
          </span>
        ) : (
          <span className={styles.leading}>{leading}</span>
        ))}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {TRAILING[trailing] && (
        <span className={styles.trailing} aria-hidden="true">
          {TRAILING[trailing]}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.option} ${styles.clickable}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className={`${styles.option} ${disabled ? styles.disabled : ''}`}
      aria-disabled={disabled || undefined}
    >
      {content}
    </div>
  );
}
