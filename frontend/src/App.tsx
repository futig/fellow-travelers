import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { StartParamContext } from './lib/startParamContext';
import { parseStartParam } from './lib/startParam';
import { getStartParamRaw } from './lib/telegram';
import { Home } from './screens/Home/Home';
import { Profile } from './screens/Profile/Profile';

const queryClient = new QueryClient();

// Memory router: URL внутри Telegram-webview не важен.
const router = createMemoryRouter([
  { path: '/', element: <Profile /> },
  { path: '/home', element: <Home /> },
]);

const startParam = parseStartParam(getStartParamRaw());

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StartParamContext.Provider value={startParam}>
        <RouterProvider router={router} />
      </StartParamContext.Provider>
    </QueryClientProvider>
  );
}
