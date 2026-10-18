import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import type { AdminParticipant, Counters } from '../../api/types';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeContact, makeTrip } from '../../test/fixtures';
import { makeApplication, makeTransfer } from '../../test/myTrip';
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
vi.mock('../../lib/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/links')>()),
  openExternal: vi.fn(() => true),
}));

const TRIP_2 = makeTrip({
  id: 'trip-2',
  number: 'U6219',
  scheduled_departure: '2026-08-23T06:00:00+05:00',
  departure_location: { ...makeTrip().departure_location, timezone: 'Asia/Yekaterinburg' },
});

const COUNTERS: Counters = {
  expected: 3,
  searching: 1,
  assigned: 2,
  solo: 0,
  at_meeting_point: 1,
  departed: 0,
};

const OLD_TRANSFER = makeTransfer({ id: 't-old', created_at: '2026-08-01T10:00:00+00:00' });
const NEW_TRANSFER = makeTransfer({ id: 't-new', created_at: '2026-08-05T10:00:00+00:00' });

function participant(overrides: Partial<AdminParticipant> = {}): AdminParticipant {
  return { contact: makeContact(), application: makeApplication(), ...overrides };
}

function renderHub(search = '') {
  return renderRoute('/events/:id/admin', <AdminHub />, `/events/${EVENT_ID}/admin${search}`, [
    '/',
  ]);
}

describe('AdminHub — вкладка «Участники»', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchEvent.mockResolvedValue(makeEvent({ is_participant: true }));
    api.fetchEventTrips.mockResolvedValue([makeTrip(), TRIP_2]);
    api.fetchAdminTransfers.mockResolvedValue([NEW_TRANSFER, OLD_TRANSFER]);
    api.fetchAdminParticipants.mockResolvedValue({ counters: COUNTERS, participants: [] });
  });

  it('по умолчанию открыта вкладка «Участники»', async () => {
    renderHub();
    expect(await screen.findByRole('tab', { name: 'Участники' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: 'Участники' })).toBeInTheDocument();
  });

  it.each([
    [1, 'Ожидается 1 человек'],
    [3, 'Ожидается 3 человека'],
    [5, 'Ожидается 5 человек'],
    [22, 'Ожидается 22 человека'],
  ])('счётчики: expected=%i → «%s»', async (expected, text) => {
    api.fetchAdminParticipants.mockResolvedValue({
      counters: { ...COUNTERS, expected },
      participants: [],
    });
    renderHub();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('сводка: все счётчики с подписями и пояснение', async () => {
    renderHub();
    const summary = await screen.findByRole('region', { name: 'Сводка' });
    const value = (label: string) =>
      within(summary).getByText(label).parentElement?.querySelector('dd')?.textContent;
    expect(value('Ищут')).toBe('1');
    expect(value('В трансферах')).toBe('2');
    expect(value('Едут сами')).toBe('0');
    expect(value('На месте')).toBe('1');
    expect(value('Уехали')).toBe('0');
    expect(within(summary).getByText(/отменённые не входят/)).toBeInTheDocument();
  });

  it('фильтры уходят в API и пишутся в URL', async () => {
    const { router } = renderHub();
    await screen.findByText('Ожидается 3 человека');
    expect(api.fetchAdminParticipants).toHaveBeenLastCalledWith(EVENT_ID, {});

    const searching = screen.getByRole('button', { name: 'Ищут' });
    expect(searching).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(searching);
    await userEvent.click(screen.getByRole('button', { name: 'Едут сами' }));
    await vi.waitFor(() =>
      expect(api.fetchAdminParticipants).toHaveBeenLastCalledWith(EVENT_ID, {
        status: ['searching', 'solo'],
      }),
    );
    expect(screen.getByRole('button', { name: 'Ищут' })).toHaveAttribute('aria-pressed', 'true');

    const select = screen.getByRole('combobox', { name: 'Рейс' });
    expect(
      within(select).getByRole('option', { name: 'SU 1148 · 22 августа' }),
    ).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'U6 219 · 23 августа' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'trip-2');
    await vi.waitFor(() =>
      expect(api.fetchAdminParticipants).toHaveBeenLastCalledWith(EVENT_ID, {
        status: ['searching', 'solo'],
        trip_id: 'trip-2',
      }),
    );
    expect(router.state.location.search).toBe('?status=searching&status=solo&trip=trip-2');
    // Фильтры меняют параметры с заменой записи — назад уходим сразу с экрана.
    expect(router.state.historyAction).toBe('REPLACE');

    await userEvent.click(screen.getByRole('button', { name: 'Ищут' }));
    await vi.waitFor(() =>
      expect(api.fetchAdminParticipants).toHaveBeenLastCalledWith(EVENT_ID, {
        status: ['solo'],
        trip_id: 'trip-2',
      }),
    );
  });

  it('фильтры из URL переживают ремоунт', async () => {
    const first = renderHub('?status=solo&status=cancelled&trip=trip-2');
    await screen.findByText('Ожидается 3 человека');
    expect(api.fetchAdminParticipants).toHaveBeenLastCalledWith(EVENT_ID, {
      status: ['solo', 'cancelled'],
      trip_id: 'trip-2',
    });
    first.unmount();

    renderHub('?status=solo&status=cancelled&trip=trip-2');
    expect(await screen.findByRole('button', { name: 'Едут сами' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Отменили' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Ищут' })).toHaveAttribute('aria-pressed', 'false');
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Рейс' })).toHaveValue('trip-2'),
    );
  });

  it('карточка с заявкой: рейс, багаж, ожидание, статус, отметка, трансфер', async () => {
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [
        participant({
          application: makeApplication({
            passengers: 2,
            status: 'assigned',
            at_meeting_point: true,
            transfer_id: 't-new',
          }),
        }),
      ],
    });
    renderHub();
    const card = await screen.findByRole('article', { name: 'Луна Сокол' });
    expect(within(card).getByText('+1')).toBeInTheDocument();
    expect(within(card).getByText('SU 1148 · прилёт 12:25')).toBeInTheDocument();
    expect(within(card).getByText('Багаж: 2 чемодана · Ждёт: 15 минут')).toBeInTheDocument();
    expect(within(card).getByText('Попутчики найдены')).toBeInTheDocument();
    expect(within(card).getByText('На месте')).toBeInTheDocument();

    // Номер — по created_at: t-new создан вторым.
    await userEvent.click(await within(card).findByRole('button', { name: 'Трансфер 2' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/events/${EVENT_ID}/admin/transfers/t-new`,
    );
  });

  it('время прилёта — в поясе аэропорта прилёта; «Не ждёт», «Уехал»', async () => {
    const trip = makeTrip({
      effective_arrival: '2026-08-22T07:25:00+00:00',
      arrival_location: { ...makeTrip().arrival_location, timezone: 'Asia/Yekaterinburg' },
    });
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [
        participant({
          application: makeApplication({
            trip,
            baggage_count: 0,
            max_wait_minutes: 0,
            status: 'solo',
            departed_at: '2026-08-22T13:00:00+00:00',
          }),
        }),
      ],
    });
    renderHub();
    const card = await screen.findByRole('article', { name: 'Луна Сокол' });
    expect(within(card).getByText('SU 1148 · прилёт 12:25')).toBeInTheDocument();
    expect(within(card).getByText('Багаж: только ручная кладь · Не ждёт')).toBeInTheDocument();
    expect(within(card).getByText('Уехал')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Трансфер/ })).not.toBeInTheDocument();
  });

  it('без заявки — «Заявка не заполнена»; контакты текстом и ссылками', async () => {
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [participant({ application: null })],
    });
    renderHub();
    const card = await screen.findByRole('article', { name: 'Луна Сокол' });
    expect(within(card).getByText('Заявка не заполнена')).toBeInTheDocument();
    expect(within(card).getByText('+7 912 204 29 12 · @luna_sokol')).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: 'Написать в Telegram: Луна Сокол' }),
    ).toHaveAttribute('href', 'https://t.me/luna_sokol');
    expect(within(card).getByRole('link', { name: 'Позвонить: Луна Сокол' })).toHaveAttribute(
      'href',
      'tel:+79122042912',
    );
  });

  it('невалидные контакты не становятся ссылками', async () => {
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [
        participant({ contact: makeContact({ username: 'a b', phone: 'javascript:1' }) }),
      ],
    });
    renderHub();
    const card = await screen.findByRole('article', { name: 'Луна Сокол' });
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('сортировка: по прилёту, без заявки — в конце', async () => {
    const at = (iso: string) => makeApplication({ trip: makeTrip({ effective_arrival: iso }) });
    api.fetchAdminParticipants.mockResolvedValue({
      counters: COUNTERS,
      participants: [
        participant({
          contact: makeContact({ user_id: 'u1', first_name: 'Без', last_name: null }),
          application: null,
        }),
        participant({
          contact: makeContact({ user_id: 'u2', first_name: 'Поздний', last_name: null }),
          application: at('2026-08-22T15:00:00+03:00'),
        }),
        participant({
          contact: makeContact({ user_id: 'u3', first_name: 'Ранний', last_name: null }),
          application: at('2026-08-22T09:00:00+03:00'),
        }),
      ],
    });
    renderHub();
    await screen.findByRole('article', { name: 'Ранний' });
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Ранний',
      'Поздний',
      'Без',
    ]);
  });

  it('пусто без фильтров — «Пока никто не вступил» и «Приглашение»', async () => {
    renderHub();
    expect(await screen.findByText('Пока никто не вступил')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Приглашение' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/events/${EVENT_ID}/admin/invite`);
  });

  it('пусто с фильтрами — «Никого не нашли»', async () => {
    renderHub('?status=cancelled');
    expect(await screen.findByText('Никого не нашли')).toBeInTheDocument();
    expect(screen.getByText('Измените фильтры')).toBeInTheDocument();
  });

  it('ошибка вкладки — карточка с повтором, хаб работает', async () => {
    api.fetchAdminParticipants.mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'),
    );
    renderHub();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Сервер недоступен');
    expect(screen.getByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Рейсы группы/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Повторить попытку/ }));
    expect(await screen.findByText('Ожидается 3 человека')).toBeInTheDocument();
  });

  it('не админ — вкладки не грузятся', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    renderHub();
    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(api.fetchAdminParticipants).not.toHaveBeenCalled();
  });
});
