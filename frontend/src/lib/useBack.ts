import { useCallback } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';
import { useBackButton } from './useBackButton';

/** Метка первого экрана в `location.state`: сохраняется при переходах с `replace`. */
interface FirstEntryState {
  firstEntry: true;
}

/**
 * Экран открыт первым — назад идти некуда. Memory router даёт ключ `'default'` только
 * начальной записи; `replace` выдаёт новый ключ, поэтому метку переносим в `state` (`useReplace`).
 */
function isFirstEntry(location: Location): boolean {
  if (location.key === 'default') return true;
  const state = location.state as Partial<FirstEntryState> | null;
  return state?.firstEntry === true;
}

/** Переход с заменой текущей записи, сохраняющий признак «первый экран». */
export function useReplace(): (to: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const first = isFirstEntry(location);
  return useCallback(
    (to: string) => {
      void navigate(to, { replace: true, state: first ? { firstEntry: true } : undefined });
    },
    [navigate, first],
  );
}

/**
 * «Назад» экрана: на предыдущую запись истории, а если экран открыт первым (deep link) —
 * на `fallbackPath` с заменой. Показывает BackButton Telegram и возвращает тот же обработчик
 * для кнопок на экране.
 */
export function useBack(fallbackPath = '/'): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const first = isFirstEntry(location);
  const back = useCallback(() => {
    if (first) {
      void navigate(fallbackPath, { replace: true, state: { firstEntry: true } });
    } else {
      void navigate(-1);
    }
  }, [navigate, first, fallbackPath]);
  useBackButton(back);
  return back;
}
