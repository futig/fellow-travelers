import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';

/** Показывает текущий путь — для проверки переходов в тестах экранов. */
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

/**
 * Рендерит экран по маршруту `path` в memory router; любой другой путь — `LocationProbe`.
 * `history` — записи до начального экрана (по умолчанию экран открыт первым, как по deep link).
 */
export function renderRoute(
  path: string,
  element: ReactNode,
  initialPath: string,
  history: string[] = [],
) {
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [...history, initialPath] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}
