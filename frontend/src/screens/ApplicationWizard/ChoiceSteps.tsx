import { useState } from 'react';
import type { WaitMinutes } from '../../api/types';
import { formatWait } from '../../lib/format';
import { Button } from '../../ui/Button/Button';
import { NumberInput } from '../../ui/NumberInput/NumberInput';
import { Option } from '../../ui/Option/Option';
import { Screen } from '../../ui/Screen/Screen';
import styles from './ApplicationWizard.module.css';
import { MAX_BAGGAGE, type CompanionChoice } from './draft';
import { WizardHeader } from './WizardHeader';

const COMPANION_OPTIONS: {
  choice: CompanionChoice;
  emoji: string;
  title: string;
  subtitle?: string;
}[] = [
  { choice: 'alone', emoji: '👤', title: 'Нет, лечу один' },
  { choice: 'plusOne', emoji: '👥', title: 'Да, со мной +1' },
  {
    choice: 'noSeek',
    emoji: '🙅',
    title: 'Не искать попутчиков',
    subtitle: 'Если вместе с вами летит больше 2 человек',
  },
];

/** Шаг 3 «Летите с кем-то?». */
export function CompanionStep({ onChoose }: { onChoose: (choice: CompanionChoice) => void }) {
  return (
    <Screen>
      <WizardHeader
        step={3}
        title="Летите с кем-то?"
        subtitle="Учтём при подборе попутчиков, чтобы все влезли в такси"
      />
      <ul className={styles.options}>
        {COMPANION_OPTIONS.map(({ choice, emoji, title, subtitle }) => (
          <li key={choice}>
            <Option
              leading={emoji}
              title={title}
              subtitle={subtitle}
              onClick={() => onChoose(choice)}
            />
          </li>
        ))}
      </ul>
    </Screen>
  );
}

const BAGGAGE_SUBTITLE = 'Учтём при подборе попутчиков, чтобы всё влезло в такси';

/** Шаг 4 «Багаж»: ручная кладь или с багажом (дальше — счётчик). */
export function BaggageStep({
  onHandLuggage,
  onWithBaggage,
}: {
  onHandLuggage: () => void;
  onWithBaggage: () => void;
}) {
  return (
    <Screen>
      <WizardHeader step={4} title="Багаж" subtitle={BAGGAGE_SUBTITLE} />
      <ul className={styles.options}>
        <li>
          <Option
            leading="🎒"
            title="Только ручная кладь"
            subtitle="Сразу выйду из зоны прилёта"
            onClick={onHandLuggage}
          />
        </li>
        <li>
          <Option
            leading="🧳"
            title="Лечу с багажом"
            subtitle="Буду ждать выдачу багажа"
            onClick={onWithBaggage}
          />
        </li>
      </ul>
    </Screen>
  );
}

interface BaggageCountProps {
  initial: number;
  /** Летит со спутником: багаж считается на двоих. */
  withCompanion: boolean;
  /** Показывать подсказку «Не искать попутчиков» (если попутчиков и так не ищем — не нужна). */
  seeking: boolean;
  onNext: (count: number) => void;
  /** Больше двух чемоданов: не искать попутчиков и сохранить выбранное число. */
  onNoSeek: (count: number) => void;
  onBack: () => void;
}

/** Шаг 4, счётчик «Сколько чемоданов берёте?» (1..2). */
export function BaggageCountStep({
  initial,
  withCompanion,
  seeking,
  onNext,
  onNoSeek,
  onBack,
}: BaggageCountProps) {
  const [count, setCount] = useState(Math.min(Math.max(initial, 1), MAX_BAGGAGE));
  return (
    <Screen>
      <WizardHeader step={4} title="Багаж" subtitle={BAGGAGE_SUBTITLE} />
      <div className={styles.content}>
        <NumberInput
          label="Сколько чемоданов берёте?"
          value={count}
          onChange={setCount}
          min={1}
          max={MAX_BAGGAGE}
          hint={withCompanion ? 'Багаж считается на вас обоих' : undefined}
        />
        {seeking && (
          <>
            <p className={styles.hint}>
              В одно такси помещается не больше двух чемоданов. Если у вас больше — выберите «Не
              искать попутчиков»
            </p>
            <Button variant="secondary" icon="🙅" onClick={() => onNoSeek(count)}>
              Не искать попутчиков
            </Button>
          </>
        )}
      </div>
      <div className={styles.footer}>
        <Button arrow="→" onClick={() => onNext(count)}>
          Далее
        </Button>
        <Button variant="secondary" icon="←" onClick={onBack}>
          Назад
        </Button>
      </div>
    </Screen>
  );
}

const WAIT_OPTIONS: WaitMinutes[] = [0, 15, 30];

/** Шаг 5 «Сколько минут готовы ждать попутчиков?» (контракт: 0 / 15 / 30). */
export function WaitStep({ onChoose }: { onChoose: (minutes: WaitMinutes) => void }) {
  return (
    <Screen>
      <WizardHeader
        step={5}
        title="Сколько минут готовы ждать попутчиков?"
        subtitle="Будем искать по времени прилёта по расписанию. В одно такси посадим не больше трёх пассажиров"
      />
      <ul className={styles.options}>
        {WAIT_OPTIONS.map((minutes) => (
          <li key={minutes}>
            <Option title={formatWait(minutes)} onClick={() => onChoose(minutes)} />
          </li>
        ))}
      </ul>
    </Screen>
  );
}
