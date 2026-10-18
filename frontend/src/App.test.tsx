import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './App';
import { makeEvent } from './test/events';

const EVENT_ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

vi.mock('./lib/telegram', () => ({
  getStartParamRaw: () => undefined,
  getInitDataRaw: () => undefined,
  getInitDataPhotoUrl: () => undefined,
}));
vi.mock('./api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/events')>()),
  fetchMyEvents: async () => [],
  fetchEvent: async (id: string) => makeEvent({ id }),
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
    expect(await screen.findByText('Вы пока не в группах')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Мои группы' })).toBeInTheDocument();
  });

  it('/join — ввод кода', () => {
    renderAt('/join');
    expect(screen.getByRole('heading', { name: 'Вступить в группу' })).toBeInTheDocument();
  });

  it('/events/:id/admin — управление группой', async () => {
    renderAt(`/events/${EVENT_ID}/admin`);
    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByText('Администратор')).toBeInTheDocument();
  });

  it('неизвестный путь — редирект на «Мои группы»', async () => {
    renderAt(`/events/${EVENT_ID}/admin/settings`);
    expect(await screen.findByText('Вы пока не в группах')).toBeInTheDocument();
  });
});
