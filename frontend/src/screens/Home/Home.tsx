import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useBackButton } from '../../lib/useBackButton';
import { Screen } from '../../ui/Screen/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader/ScreenHeader';

/** Заглушка «Мои группы». */
export function Home() {
  const navigate = useNavigate();
  const goBack = useCallback(() => void navigate(-1), [navigate]);
  useBackButton(goBack);

  return (
    <Screen>
      <ScreenHeader title="Мои группы" subtitle="Скоро здесь появятся ваши группы" />
    </Screen>
  );
}
