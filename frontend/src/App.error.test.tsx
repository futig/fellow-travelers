import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from './App';

vi.mock('./lib/telegram', () => ({
  getStartParamRaw: () => undefined,
  getInitDataRaw: () => 'raw-init-data',
  getInitDataPhotoUrl: () => undefined,
}));
vi.mock('./api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/events')>()),
  fetchMyEvents: async () => [],
}));
// Экран, падающий при рендере.
vi.mock('./screens/Profile/Profile', () => ({
  Profile: () => {
    throw new Error('boom');
  },
}));

describe('корневой errorElement', () => {
  beforeEach(() => {
    // React и роутер пишут пойманную ошибку в консоль — в тесте это шум.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('исключение в экране → ErrorScreen, «Мои группы» возвращает на список', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/', '/profile'] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Мои группы/ }));
    expect(await screen.findByRole('heading', { name: 'Мои группы' })).toBeInTheDocument();
  });
});
