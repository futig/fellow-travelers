import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeTrip } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { AdminHub } from './AdminHub';

const api = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  fetchEventTrips: vi.fn(),
  fetchEventInvite: vi.fn(),
  joinByInvite: vi.fn(),
  fetchAdminParticipants: vi.fn(),
  fetchAdminTransfers: vi.fn(),
}));

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent: api.fetchEvent,
}));
vi.mock('../../api/trips', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/trips')>()),
  fetchEventTrips: api.fetchEventTrips,
}));
vi.mock('../../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/admin')>()),
  fetchAdminParticipants: api.fetchAdminParticipants,
  fetchAdminTransfers: api.fetchAdminTransfers,
}));
vi.mock('../../api/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/invites')>()),
  fetchEventInvite: api.fetchEventInvite,
  joinByInvite: api.joinByInvite,
}));

const COUNTERS = {
  expected: 0,
  searching: 0,
  assigned: 0,
  solo: 0,
  at_meeting_point: 0,
  departed: 0,
};

const INVITE = { code: 'K7Q2ZP', link: 'https://t.me/bot?startapp=join_K7Q2ZP' };

function renderHub() {
  return renderRoute('/events/:id/admin', <AdminHub />, `/events/${EVENT_ID}/admin`, ['/']);
}

describe('AdminHub', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchEventTrips.mockResolvedValue([makeTrip(), makeTrip({ id: 'x' })]);
    api.fetchEventInvite.mockResolvedValue(INVITE);
    api.fetchAdminParticipants.mockResolvedValue({ counters: COUNTERS, participants: [] });
    api.fetchAdminTransfers.mockResolvedValue([]);
  });

  it('админ-участник: шапка, меню с числом рейсов и «Моя поездка», без вступления', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_participant: true }));
    renderHub();

    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByText('Администратор')).toBeInTheDocument();
    expect(await screen.findByText(/2 рейса · Участники выбирают рейс/)).toBeInTheDocument();
    expect(screen.queryByText(/Вступление закрыто/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вступить как участник' })).not.toBeInTheDocument();
    expect(api.fetchEventInvite).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Моя поездка/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/events/${EVENT_ID}$`));
  });

  it.each([
    ['Приглашение', '/admin/invite'],
    ['Рейсы группы', '/admin/trips'],
    ['Настройки группы', '/admin/settings'],
  ])('«%s» → %s', async (title, path) => {
    api.fetchEvent.mockResolvedValue(makeEvent());
    renderHub();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(title) }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/events/${EVENT_ID}${path}`);
  });

  it('вступление закрыто — карточка', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ join_open: false }));
    renderHub();
    expect(await screen.findByText(/Вступление закрыто/)).toBeInTheDocument();
  });

  it('админ без участия: «Вступить как участник» → код приглашения → вступление → «Моя поездка»', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.joinByInvite.mockResolvedValue(makeEvent({ is_participant: true }));
    renderHub();

    expect(await screen.findByText(/Едете сами\?/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Моя поездка/ })).not.toBeInTheDocument();
    const join = screen.getByRole('button', { name: 'Вступить как участник' });
    await vi.waitFor(() => expect(join).toBeEnabled());
    await userEvent.click(join);

    expect(api.joinByInvite).toHaveBeenCalledWith('K7Q2ZP');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      new RegExp(`^/events/${EVENT_ID}$`),
    );
  });

  it('ошибка вступления — текст под кнопкой', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.joinByInvite.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'));
    renderHub();

    const join = await screen.findByRole('button', { name: 'Вступить как участник' });
    await vi.waitFor(() => expect(join).toBeEnabled());
    await userEvent.click(join);
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
  });

  it('участник, но не админ → «только организатор» и «Моя поездка»', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    renderHub();

    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Моя поездка/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/events/${EVENT_ID}$`));
  });

  it('403 FORBIDDEN → «только организатор»', async () => {
    api.fetchEvent.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Доступ запрещён'));
    renderHub();
    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
  });

  it('404 → «Группа не найдена»', async () => {
    api.fetchEvent.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Не найдено'));
    renderHub();
    expect(await screen.findByText('Группа не найдена')).toBeInTheDocument();
  });
});
