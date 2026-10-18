import { createContext, useContext } from 'react';
import type { StartParam } from './startParam';

// start_param, с которым открыто приложение (первый экран выбирается по нему в App).
export const StartParamContext = createContext<StartParam>({ kind: 'none' });

export function useStartParam(): StartParam {
  return useContext(StartParamContext);
}
