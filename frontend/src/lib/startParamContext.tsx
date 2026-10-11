import { createContext, useContext } from 'react';
import type { StartParam } from './startParam';

// Пока любой start_param открывает начальный экран; значение сохраняем для будущих экранов.
export const StartParamContext = createContext<StartParam>({ kind: 'none' });

export function useStartParam(): StartParam {
  return useContext(StartParamContext);
}
