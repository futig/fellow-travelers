import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';

/** Шагов в мастере (сводка — последний шаг с полным прогрессом). */
export const WIZARD_STEPS = 5;

interface Props {
  step: number;
  title: string;
  subtitle?: string;
}

/** Шапка шага мастера: прогресс «Шаг N из 5», заголовок, описание. */
export function WizardHeader({ step, title, subtitle }: Props) {
  return (
    <ScreenHeader title={title} subtitle={subtitle} step={{ current: step, total: WIZARD_STEPS }} />
  );
}
