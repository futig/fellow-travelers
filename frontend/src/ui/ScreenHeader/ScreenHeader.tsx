import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './ScreenHeader.module.css';

interface Props {
  title: string;
  subtitle?: string;
  /** Номер шага и общее число шагов; без них прогресс не показывается. */
  step?: { current: number; total: number };
  /** Подзаголовок над заголовком без прогресса («Ваша поездка», «Администратор»). */
  eyebrow?: string;
}

export function ScreenHeader({ title, subtitle, step, eyebrow }: Props) {
  const label = step ? `Шаг ${step.current} из ${step.total}` : eyebrow;
  return (
    <header className={styles.header}>
      {step && <ProgressBar total={step.total} current={step.current} />}
      <div className={styles.text}>
        {label && <p className={styles.step}>{label}</p>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
