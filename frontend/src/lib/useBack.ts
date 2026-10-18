import { useCallback } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';
import { useBackButton } from './useBackButton';

// ВАЖНО: все переходы с `replace` в приложении делаем через `useReplace`, а не `navigate(to, {replace})`:
// иначе потеряется метка первого экрана и «Назад» на нём перестанет работать.

/** Метка первого экрана в `location.state`: сохраняется при переходах с `replace`. */
interface FirstEntryState {
  firstEntry: true;
}

const FIRST_ENTRY: FirstEntryState = { firstEntry: true };

/**
 * Экран открыт первым — назад идти некуда. Memory router даёт ключ `'default'` только
 * начальной записи; `replace` выдаёт новый ключ, поэтому метку переносим в `state` (`useReplace`).
 */
function isFirstEntry(location: Location): boolean {
  if (location.key === 'default') return true;
  const state = location.state as Partial<FirstEntryState> | null;
  return state?.firstEntry === true;
}

/** Текущий экран открыт первым: `navigate(-1)` некуда. */
export function useIsFirstEntry(): boolean {
  return isFirstEntry(useLocation());
}

interface ReplaceOptions {
  /**
   * Новый экран считать первым: его «Назад» уйдёт на свой fallback, а не на предыдущие записи
   * (например, после вступления — на «Мои группы», а не обратно на ввод кода).
   */
  asFirst?: boolean;
}

/** Переход с заменой текущей записи, сохраняющий признак «первый экран». */
export function useReplace(): (to: string, options?: ReplaceOptions) => void {
  const navigate = useNavigate();
  const first = useIsFirstEntry();
  return useCallback(
    (to: string, options?: ReplaceOptions) => {
      const markFirst = first || options?.asFirst === true;
      void navigate(to, { replace: true, state: markFirst ? FIRST_ENTRY : undefined });
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
  const first = useIsFirstEntry();
  const back = useCallback(() => {
    if (first) {
      void navigate(fallbackPath, { replace: true, state: FIRST_ENTRY });
    } else {
      void navigate(-1);
    }
  }, [navigate, first, fallbackPath]);
  useBackButton(back);
  return back;
}
