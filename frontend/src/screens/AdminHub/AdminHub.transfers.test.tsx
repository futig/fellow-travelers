import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import type { Counters } from '../../api/types';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeContact, makeTrip } from '../../test/fixtures';
import { makeApplication, makeMember, makeTransfer } from '../../test/myTrip';
import { renderRoute } from '../../test/render';
import { AdminHub } from './AdminHub';

const api = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  fetchEventTrips: vi.fn(),
  fetchEventInvite: vi.fn(),
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
vi.mock('../../api/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/invites')>()),
  fetchEventInvite: api.fetchEventInvite,
}));
vi.mock('../../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/admin')>()),
  fetchAdminParticipants: api.fetchAdminParticipants,
  fetchAdminTransfers: api.fetchAdminTransfers,
}));

const COUNTERS: Counters = {
  expected: 0,
  searching: 0,
  assigned: 0,
  solo: 0,
  at_meeting_point: 0,
  departed: 0,
};

const member = (id: string, name: string, overrides = {}) =>
  makeMember({
    application_id: id,
    contact: makeContact({ user_id: id, first_name: name }),
    ...overrides,
  });

// Порядок в ответе не совпадает с порядком создания: номера — по created_at.
const DEPARTED = makeTransfer({
  id: 't-3',
  status: 'departed',
  passengers_total: 1,
  created_at: '2026-08-12T10:00:00+00:00',
  members: [member('m5', 'Илья', { departed_at: '2026-08-22T13:00:00+03:00' })],
});
const READY = makeTransfer({
  id: 't-1',
  passengers_total: 3,
  created_at: '2026-08-10T10:00:00+00:00',
  members: [
    member('m1', 'Егор', { at_meeting_point: true, passengers: 2 }),
    member('m2', 'Луна', { at_meeting_point: true }),
  ],
});
const GATHERING = makeTransfer({
  id: 't-2',
  passengers_total: 2,
  created_at: '2026-08-11T10:00:00+00:00',
  members: [member('m3', 'Анна', { at_meeting_point: true }), member('m4', 'Михаил')],
});

function renderHub(search = '?tab=transfers') {
  return renderRoute('/events/:id/admin', <AdminHub />, `/events/${EVENT_ID}/admin${search}`, [
    '/',
  ]);
}

describe('AdminHub — вкладка «Трансферы»', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.fetchEventTrips.mockResolvedValue([makeTrip()]);
    api.fetchEventInvite.mockResolvedValue({ code: 'K7Q2ZP', link: 'https://t.me/b' });
    api.fetchAdminTransfers.mockResolvedValue([DEPARTED, READY, GATHERING]);
    api.fetchAdminParticipants.mockResolvedValue({ counters: COUNTERS, participants: [] });
  });

  it('?tab=transfers открывает вкладку; мета-строка с падежами', async () => {
    renderHub();
    expect(await screen.findByRole('tab', { name: 'Трансферы' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('3 трансфера · 6 человек')).toBeInTheDocument();
    expect(api.fetchAdminParticipants).not.toHaveBeenCalled();
  });

  it('мета-строка: 1 трансфер · 2 человека', async () => {
    api.fetchAdminTransfers.mockResolvedValue([GATHERING]);
    renderHub();
    expect(await screen.findByText('1 трансфер · 2 человека')).toBeInTheDocument();
  });

  it('карточки по номерам, имена и статусы', async () => {
    renderHub();
    const list = await screen.findByRole('list', { name: 'Трансферы' });
    const cards = within(list).getAllByRole('button');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Трансфер 1 · 3 человека');
    expect(cards[0]).toHaveTextContent('Егор, Луна');
    expect(cards[0]).toHaveTextContent('Все на месте');
    expect(cards[1]).toHaveTextContent('Трансфер 2 · 2 человека');
    expect(cards[1]).toHaveTextContent('Анна, Михаил');
    expect(cards[1]).toHaveTextContent('Собираются');
    expect(cards[2]).toHaveTextContent('Трансфер 3 · 1 человек');
    expect(cards[2]).toHaveTextContent('Уехали');
  });

  it('клик по карточке → детали трансфера', async () => {
    renderHub();
    await userEvent.click(await screen.findByRole('button', { name: /Трансфер 2/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/events/${EVENT_ID}/admin/transfers/t-2`,
    );
  });

  it('пусто — «Трансферов пока нет»', async () => {
    api.fetchAdminTransfers.mockResolvedValue([]);
    renderHub();
    expect(await screen.findByText('Трансферов пока нет')).toBeInTheDocument();
    expect(screen.getByText('Они появятся, когда сервис подберёт попутчиков')).toBeInTheDocument();
  });

  it('ошибка — карточка с повтором внутри вкладки', async () => {
    api.fetchAdminTransfers.mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'),
    );
    renderHub();
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
    expect(screen.getByRole('tab', { name: 'Участники' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Повторить попытку/ }));
    expect(await screen.findByText('3 трансфера · 6 человек')).toBeInTheDocument();
  });

  it('переключение вкладок пишет ?tab с заменой и сохраняет фильтры', async () => {
    const { router } = renderHub('?status=solo');
    await screen.findByText('Ожидается 0 человек');
    await userEvent.click(screen.getByRole('tab', { name: 'Трансферы' }));
    expect(router.state.location.search).toBe('?status=solo&tab=transfers');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByText('3 трансфера · 6 человек')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Участники' }));
    expect(router.state.location.search).toBe('?status=solo');
    expect(await screen.findByRole('button', { name: 'Едут сами' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('номер трансфера в карточке участника совпадает с вкладкой «Трансферы»', async () => {
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [
        {
          contact: makeContact(),
          application: makeApplication({ status: 'assigned', transfer_id: 't-2' }),
        },
      ],
    });
    renderHub('');
    const card = await screen.findByRole('article', { name: 'Луна Сокол' });
    expect(await within(card).findByRole('button', { name: 'Трансфер 2' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Трансферы' }));
    const list = await screen.findByRole('list', { name: 'Трансферы' });
    expect(within(list).getAllByRole('button')[1]).toHaveTextContent('Трансфер 2');
    expect(within(list).getAllByRole('button')[1]).toHaveTextContent('Анна, Михаил');
  });
});
