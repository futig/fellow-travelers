import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './ScreenHeader.module.css';

interface Props {
  title: string;
  subtitle?: string;
  /** Номер шага и общее число шагов; без них прогресс не показывается. */
  step?: { current: number; total: number };
  /** Подзаголовок над заголовком без прогресса («Ваша поездка», «Администратор»). */
  eyebrow?: string;
  /** Подзаголовок — кнопка «назад» («‹ Все трансферы»). */
  onEyebrowClick?: () => void;
}

export function ScreenHeader({ title, subtitle, step, eyebrow, onEyebrowClick }: Props) {
  const label = step ? `Шаг ${step.current} из ${step.total}` : eyebrow;
  return (
    <header className={styles.header}>
      {step && <ProgressBar total={step.total} current={step.current} />}
      <div className={styles.text}>
        {label &&
          (onEyebrowClick && !step ? (
            <button type="button" className={styles.eyebrowButton} onClick={onEyebrowClick}>
              <span aria-hidden="true">‹ </span>
              {label}
            </button>
          ) : (
            <p className={styles.step}>{label}</p>
          ))}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
