import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './App';

vi.mock('./lib/telegram', () => ({
  getStartParamRaw: () => undefined,
  getInitDataRaw: () => undefined,
  getInitDataPhotoUrl: () => undefined,
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('маршрутизация', () => {
  it('/ — «Мои группы»', async () => {
    renderAt('/?filter=admin');
    expect(await screen.findByRole('heading', { name: 'Мои группы' })).toBeInTheDocument();
  });

  it('deep link на ещё не готовый экран — редирект на «Мои группы»', async () => {
    renderAt('/events/3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b/admin');
    expect(await screen.findByRole('heading', { name: 'Мои группы' })).toBeInTheDocument();
  });
});
