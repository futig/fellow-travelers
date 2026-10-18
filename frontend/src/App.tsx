import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Navigate, RouterProvider } from 'react-router';
import { createQueryClient } from './api/queryClient';
import { StartParamContext } from './lib/startParamContext';
import { parseStartParam, startParamToPath } from './lib/startParam';
import { getStartParamRaw } from './lib/telegram';
import { GroupPlaceholder } from './screens/GroupPlaceholder/GroupPlaceholder';
import { Home } from './screens/Home/Home';
import { Invite } from './screens/Invite/Invite';
import { Join } from './screens/Join/Join';
import { Profile } from './screens/Profile/Profile';

const queryClient = createQueryClient();

const startParam = parseStartParam(getStartParamRaw());

export const routes = [
  { path: '/', element: <Home /> },
  { path: '/profile', element: <Profile /> },
  { path: '/join', element: <Join /> },
  { path: '/invite/:code', element: <Invite /> },
  // Заглушки до «Моей поездки» и «Управления» (инкременты 5 и 6).
  { path: '/events/:id', element: <GroupPlaceholder /> },
  { path: '/events/:id/admin', element: <GroupPlaceholder admin /> },
  // Неизвестный путь (в т.ч. deep link на ещё не готовый экран) — на «Мои группы».
  { path: '*', element: <Navigate to="/" replace /> },
];

// Memory router: URL внутри Telegram-webview не важен. Первый экран — по start_param.
const router = createMemoryRouter(routes, { initialEntries: [startParamToPath(startParam)] });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StartParamContext.Provider value={startParam}>
        <RouterProvider router={router} />
      </StartParamContext.Provider>
    </QueryClientProvider>
  );
}
