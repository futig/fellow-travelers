import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';

/** Заглушка «Мои группы» — стартовый экран, поэтому без кнопки «Назад». */
export function Home() {
  return (
    <Screen>
      <ScreenHeader title="Мои группы" subtitle="Скоро здесь появятся ваши группы" />
    </Screen>
  );
}
