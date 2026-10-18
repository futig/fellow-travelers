import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { openExternal } from '../../lib/links';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeContact } from '../../test/fixtures';
import { makeMember, makeTransfer } from '../../test/myTrip';
import { renderRoute } from '../../test/render';
import { TransferDetails } from './TransferDetails';

const api = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  fetchAdminTransfers: vi.fn(),
}));

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent: api.fetchEvent,
}));
vi.mock('../../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/admin')>()),
  fetchAdminTransfers: api.fetchAdminTransfers,
}));
vi.mock('../../lib/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/links')>()),
  openExternal: vi.fn(() => true),
}));

const EGOR = makeMember({
  application_id: 'm1',
  contact: makeContact({ user_id: 'u1', first_name: 'Егор', last_name: 'Макаров' }),
  trip_number: 'SU1108',
  effective_arrival: '2026-08-22T12:40:00+05:00',
  passengers: 2,
});
const LUNA = makeMember({ application_id: 'm2', at_meeting_point: true });

const FIRST = makeTransfer({ id: 't-1', created_at: '2026-08-10T10:00:00+00:00' });
const SECOND = makeTransfer({
  id: 't-2',
  passengers_total: 3,
  created_at: '2026-08-11T10:00:00+00:00',
  members: [EGOR, LUNA],
});

const LIST = `/events/${EVENT_ID}/admin?tab=transfers`;

function renderDetails(tid = 't-2', history: string[] = []) {
  return renderRoute(
    '/events/:id/admin/transfers/:tid',
    <TransferDetails />,
    `/events/${EVENT_ID}/admin/transfers/${tid}`,
    history,
  );
}

describe('TransferDetails', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    vi.mocked(openExternal).mockClear();
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.fetchAdminTransfers.mockResolvedValue([SECOND, FIRST]);
  });

  it('номер, статус «Собираются», состав с рейсом и отметками, место сбора', async () => {
    renderDetails();
    expect(await screen.findByRole('heading', { name: 'Трансфер 2' })).toBeInTheDocument();
    const status = screen.getByRole('region', { name: 'Статус трансфера' });
    expect(status).toHaveTextContent('Собираются');
    expect(status).toHaveTextContent('Ждём, пока все придут к месту сбора');
    expect(screen.getByRole('heading', { name: 'Кто едет · 3' })).toBeInTheDocument();

    const [egor, luna] = within(screen.getByRole('list', { name: 'Кто едет' })).getAllByRole(
      'listitem',
    );
    // Время — в смещении из effective_arrival (пояс аэропорта прилёта), а не в поясе устройства.
    expect(egor).toHaveTextContent('SU 1108 • 12:40');
    expect(egor).toHaveTextContent('+1');
    expect(within(egor!).getByRole('link', { name: 'Позвонить: Егор Макаров' })).toHaveAttribute(
      'href',
      'tel:+79122042912',
    );
    expect(luna).toHaveTextContent('SU 1148 • 12:25 · На месте');
    expect(screen.getByText('Место сбора: Аэропорт Геленджик, выход № 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /общий чат/ })).not.toBeInTheDocument();
  });

  it('все на месте — «Готов к заказу такси»', async () => {
    api.fetchAdminTransfers.mockResolvedValue([
      { ...SECOND, members: [{ ...EGOR, at_meeting_point: true }, LUNA] },
    ]);
    renderDetails();
    const status = await screen.findByRole('region', { name: 'Статус трансфера' });
    expect(status).toHaveTextContent('Готов к заказу такси');
    expect(status).toHaveTextContent('Все участники пришли к месту сбора');
  });

  it('уехали — «Уехали», у участника отметка', async () => {
    const gone = { departed_at: '2026-08-22T13:00:00+03:00' };
    api.fetchAdminTransfers.mockResolvedValue([
      { ...SECOND, status: 'departed', members: [{ ...EGOR, ...gone }] },
    ]);
    renderDetails();
    const status = await screen.findByRole('region', { name: 'Статус трансфера' });
    expect(status).toHaveTextContent('Уехали');
    expect(screen.getByRole('listitem')).toHaveTextContent('SU 1108 • 12:40 · Уехал');
  });

  it('общий чат — только для t.me', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ chat_url: 'https://t.me/+chat' }));
    renderDetails();
    await userEvent.click(await screen.findByRole('button', { name: /Открыть общий чат/ }));
    expect(openExternal).toHaveBeenCalledWith('https://t.me/+chat');
  });

  it('чат не из Telegram — без кнопки', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ chat_url: 'https://evil.example/chat' }));
    renderDetails();
    await screen.findByRole('heading', { name: 'Трансфер 2' });
    expect(screen.queryByRole('button', { name: /общий чат/ })).not.toBeInTheDocument();
  });

  it('«‹ Все трансферы» при открытии первым — на вкладку трансферов', async () => {
    renderDetails();
    await userEvent.click(await screen.findByRole('button', { name: /Все трансферы/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(LIST);
  });

  it('«‹ Все трансферы» — назад по истории', async () => {
    renderDetails('t-2', [`/events/${EVENT_ID}/admin?status=solo`]);
    await userEvent.click(await screen.findByRole('button', { name: /Все трансферы/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/events/${EVENT_ID}/admin?status=solo`,
    );
  });

  it('трансфер не найден — пусто и «Все трансферы»', async () => {
    renderDetails('t-missing');
    expect(await screen.findByText('Трансфер не найден')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /Все трансферы/ });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(screen.getByTestId('location')).toHaveTextContent(LIST);
  });

  it('не админ — «только организатор», трансферы не запрашиваем', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    renderDetails();
    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
    expect(api.fetchAdminTransfers).not.toHaveBeenCalled();
  });

  it('404 группы — «Группа не найдена»', async () => {
    api.fetchEvent.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Не найдено'));
    renderDetails();
    expect(await screen.findByText('Группа не найдена')).toBeInTheDocument();
  });

  it('401 — «Откройте приложение из Telegram»', async () => {
    api.fetchEvent.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Нет авторизации'));
    renderDetails();
    expect(await screen.findByText('Откройте приложение из Telegram')).toBeInTheDocument();
  });

  it('ошибка трансферов — страница ошибки с повтором', async () => {
    api.fetchAdminTransfers.mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'),
    );
    renderDetails();
    expect(await screen.findByText('Сервер недоступен')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Повторить попытку/ }));
    expect(await screen.findByRole('heading', { name: 'Трансфер 2' })).toBeInTheDocument();
  });
});
