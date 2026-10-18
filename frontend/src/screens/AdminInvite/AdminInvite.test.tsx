import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_ID, makeEvent } from '../../test/events';
import { renderRoute } from '../../test/render';
import { AdminInvite } from './AdminInvite';

const api = vi.hoisted(() => ({ fetchEvent: vi.fn(), fetchEventInvite: vi.fn() }));
const links = vi.hoisted(() => ({ openExternal: vi.fn(), copyToClipboard: vi.fn() }));

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent: api.fetchEvent,
}));
vi.mock('../../api/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/invites')>()),
  fetchEventInvite: api.fetchEventInvite,
}));
vi.mock('../../lib/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/links')>()),
  ...links,
}));

const LINK = 'https://t.me/poputchiki_bot?startapp=join_K7Q2ZP';

function renderInvite() {
  return renderRoute(
    '/events/:id/admin/invite',
    <AdminInvite />,
    `/events/${EVENT_ID}/admin/invite`,
  );
}

describe('AdminInvite', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(links).forEach((fn) => fn.mockReset());
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.fetchEventInvite.mockResolvedValue({ code: 'K7Q2ZP', link: LINK });
  });

  it('код и ссылка; «Поделиться» открывает t.me/share с текстом', async () => {
    renderInvite();
    expect(await screen.findByText('K7Q2ZP')).toBeInTheDocument();
    expect(screen.getByText(LINK)).toBeInTheDocument();
    expect(screen.queryByText(/Вступление закрыто/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Поделиться/ }));
    const url = new URL(links.openExternal.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe('https://t.me/share/url');
    expect(url.searchParams.get('url')).toBe(LINK);
    expect(url.searchParams.get('text')).toBe(
      'Присоединяйтесь к группе «Слёт в Геленджике» — подберём попутчиков из аэропорта',
    );
  });

  it('копирование ссылки и кода — отклик через aria-live', async () => {
    links.copyToClipboard.mockResolvedValue(true);
    renderInvite();

    await userEvent.click(await screen.findByRole('button', { name: 'Скопировать ссылку' }));
    expect(links.copyToClipboard).toHaveBeenLastCalledWith(LINK);
    const status = await screen.findByText('Ссылка скопирована');
    expect(status).toHaveAttribute('aria-live', 'polite');

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать код' }));
    expect(links.copyToClipboard).toHaveBeenLastCalledWith('K7Q2ZP');
    expect(await screen.findByText('Код скопирован')).toBeInTheDocument();
  });

  it('не получилось скопировать — сообщение', async () => {
    links.copyToClipboard.mockResolvedValue(false);
    renderInvite();
    await userEvent.click(await screen.findByRole('button', { name: 'Скопировать код' }));
    expect(await screen.findByText('Не удалось скопировать')).toBeInTheDocument();
  });

  it('вступление закрыто — предупреждение', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ join_open: false }));
    renderInvite();
    expect(
      await screen.findByText('Вступление закрыто — по этой ссылке сейчас нельзя присоединиться'),
    ).toBeInTheDocument();
  });

  it('не админ — без запроса кода', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    renderInvite();
    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
    expect(api.fetchEventInvite).not.toHaveBeenCalled();
  });
});
