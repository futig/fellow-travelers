import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import type { MyTrip as MyTripData } from '../../api/types';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeContact } from '../../test/fixtures';
import { makeApplication, makeMember, makeMyTrip, makeTransfer } from '../../test/myTrip';
import { renderRoute } from '../../test/render';
import { MyTrip } from './MyTrip';

const api = vi.hoisted(() => ({
  fetchMyTrip: vi.fn(),
  goSolo: vi.fn(),
  resumeSearch: vi.fn(),
  cancelMyApplication: vi.fn(),
  setMyMarks: vi.fn(),
  fetchEventInvite: vi.fn(),
  joinByInvite: vi.fn(),
  openExternal: vi.fn(),
  copyToClipboard: vi.fn(),
}));

vi.mock('../../api/myTrip', () => ({ fetchMyTrip: api.fetchMyTrip }));
vi.mock('../../api/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/applications')>()),
  goSolo: api.goSolo,
  resumeSearch: api.resumeSearch,
  cancelMyApplication: api.cancelMyApplication,
  setMyMarks: api.setMyMarks,
}));
vi.mock('../../api/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/invites')>()),
  fetchEventInvite: api.fetchEventInvite,
  joinByInvite: api.joinByInvite,
}));
vi.mock('../../lib/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/links')>()),
  openExternal: api.openExternal,
  copyToClipboard: api.copyToClipboard,
}));

const GROUP = `/events/${EVENT_ID}`;
// Рейс по умолчанию: вылет 22.08 08:40 МСК, прилёт 12:25 МСК.
const BEFORE = '2026-08-20T08:00:00+03:00';
const NEAR_ARRIVAL = '2026-08-22T12:00:00+03:00';

/** Мастер-заглушка: показывает путь и `location.state`. */
function WizardProbe() {
  const location = useLocation();
  return (
    <p data-testid="wizard">
      {location.pathname + location.search} {JSON.stringify(location.state)}
    </p>
  );
}

function setNow(iso: string) {
  vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] });
}

function renderMyTrip(data: MyTripData, now = BEFORE) {
  setNow(now);
  api.fetchMyTrip.mockResolvedValue(data);
  return renderRoute(
    '/events/:id',
    <MyTrip />,
    GROUP,
    ['/'],
    [{ path: '/events/:id/apply', element: <WizardProbe /> }],
  );
}

async function click(name: string | RegExp) {
  await userEvent.click(await screen.findByRole('button', { name }));
}

const title = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

const assigned = (overrides: Partial<MyTripData> = {}) =>
  makeMyTrip({
    application: makeApplication({ status: 'assigned', transfer_id: 'cccccccc' }),
    transfer: makeTransfer({
      passengers_total: 3,
      baggage_total: 2,
      members: [
        makeMember({
          application_id: 'me',
          is_me: true,
          contact: makeContact({ first_name: 'Егор', last_name: 'Макаров', username: 'egor' }),
        }),
        makeMember({ application_id: 'luna' }),
        makeMember({
          application_id: 'anton',
          contact: makeContact({ first_name: 'Антон', last_name: 'Максимов', username: 'anton' }),
          trip_number: 'SU1108',
          effective_arrival: '2026-08-22T12:40:00+03:00',
          passengers: 2,
        }),
      ],
    }),
    ...overrides,
  });

describe('MyTrip', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.goSolo.mockResolvedValue(makeApplication({ status: 'solo' }));
    api.resumeSearch.mockResolvedValue(makeApplication());
    api.cancelMyApplication.mockResolvedValue(makeApplication({ status: 'cancelled' }));
    api.setMyMarks.mockResolvedValue(makeApplication());
    api.copyToClipboard.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('шапка по фазе', () => {
    it('до вылета: отсчёт, рейс с багажом, как найтись; без отметок', async () => {
      renderMyTrip(makeMyTrip());
      expect(await title('До вылета 2 дня')).toBeInTheDocument();
      expect(screen.getByText('Ваша поездка')).toBeInTheDocument();
      expect(screen.getByText('22 августа · 2 чемодана')).toBeInTheDocument();
      expect(screen.getByText('Ждём у стойки информации')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Я на месте/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Заказ такси')).not.toBeInTheDocument();
    });

    it('в пути', async () => {
      renderMyTrip(makeMyTrip(), '2026-08-22T10:00:00+03:00');
      expect(await title('В пути, прилёт в 12:25')).toBeInTheDocument();
    });

    it('после прилёта', async () => {
      renderMyTrip(makeMyTrip(), '2026-08-22T13:00:00+03:00');
      expect(await title('Добро пожаловать в Геленджик')).toBeInTheDocument();
    });

    it('раз в минуту заголовок пересчитывается', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-22T08:39:30+03:00') });
      api.fetchMyTrip.mockResolvedValue(makeMyTrip());
      renderRoute('/events/:id', <MyTrip />, GROUP);
      await vi.waitFor(() => expect(screen.getByText(/До вылета 1 минута/)).toBeInTheDocument());
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('В пути, прилёт в 12:25');
    });
  });

  it('нет заявки: название, даты, «Заполнить заявку» → мастер', async () => {
    renderMyTrip(makeMyTrip({ application: null }));
    expect(await title('Слёт в Геленджике')).toBeInTheDocument();
    expect(screen.getByText('22–24 августа 2026')).toBeInTheDocument();
    expect(screen.getByText('Заполните заявку — мы подберём попутчиков')).toBeInTheDocument();
    expect(screen.getByText('Ждём у стойки информации')).toBeInTheDocument();
    await click(/Заполнить заявку/);
    expect(screen.getByTestId('wizard')).toHaveTextContent(`${GROUP}/apply`);
  });

  it('админ без участия: вступить по своему приглашению', async () => {
    api.fetchEventInvite.mockResolvedValue({ code: 'K7Q2ZP', link: 'https://t.me/bot' });
    api.joinByInvite.mockResolvedValue(makeEvent({ is_participant: true }));
    renderMyTrip(
      makeMyTrip({
        event: makeEvent({ is_admin: true, is_participant: false }),
        application: null,
      }),
    );
    expect(
      await screen.findByText('Вы управляете группой. Едете сами? Вступите как участник'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Управление группой/ })).toBeInTheDocument();
    const join = screen.getByRole('button', { name: 'Вступить как участник' });
    await vi.waitFor(() => expect(join).toBeEnabled());
    api.fetchMyTrip.mockResolvedValue(makeMyTrip({ application: null }));
    await userEvent.click(join);
    expect(api.joinByInvite).toHaveBeenCalledWith('K7Q2ZP');
    expect(
      await screen.findByText('Заполните заявку — мы подберём попутчиков'),
    ).toBeInTheDocument();
  });

  it('админ-участник видит ссылку на управление', async () => {
    renderMyTrip(makeMyTrip({ event: makeEvent({ is_admin: true, is_participant: true }) }));
    await click(/Управление группой/);
    expect(screen.getByTestId('location')).toHaveTextContent(`${GROUP}/admin`);
  });

  it('404 → «Группа не найдена»', async () => {
    api.fetchMyTrip.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Не найдено'));
    renderRoute('/events/:id', <MyTrip />, GROUP);
    expect(await screen.findByText('Группа не найдена')).toBeInTheDocument();
  });

  describe('как найтись', () => {
    it('посадка в такси — только если отличается от места сбора', async () => {
      const event = makeEvent({ is_participant: true, chat_url: null });
      const { unmount } = renderMyTrip(makeMyTrip({ event }));
      expect(await screen.findByText(/Место сбора: Аэропорт Геленджик/)).toBeInTheDocument();
      expect(screen.queryByText(/Посадка в такси/)).not.toBeInTheDocument();
      unmount();

      renderMyTrip(
        makeMyTrip({
          event: makeEvent({ is_participant: true, pickup_point: { address: 'Парковка P1' } }),
        }),
      );
      expect(await screen.findByText('Посадка в такси: Парковка P1')).toBeInTheDocument();
    });

    it('инструкция с переносами строк', async () => {
      const event = makeEvent({ is_participant: true, meeting_instruction: 'Строка 1\nСтрока 2' });
      renderMyTrip(makeMyTrip({ event }));
      const text = await screen.findByText(/Строка 1/);
      expect(text.textContent).toBe('Строка 1\nСтрока 2');
      expect(text).toHaveClass('instruction');
    });

    it.each([
      ['https://t.me/geleng_chat', true],
      ['https://example.com/chat', false],
      [null, false],
    ])('общий чат %s → кнопка: %s', async (chatUrl, shown) => {
      renderMyTrip(makeMyTrip({ event: makeEvent({ is_participant: true, chat_url: chatUrl }) }));
      await title('До вылета 2 дня');
      const button = screen.queryByRole('button', { name: /Общий чат/ });
      if (!shown) {
        expect(button).not.toBeInTheDocument();
        return;
      }
      await userEvent.click(button!);
      expect(api.openExternal).toHaveBeenCalledWith(chatUrl);
    });
  });

  describe('статусы', () => {
    it('assigned: попутчики с подписями и вместимость', async () => {
      renderMyTrip(assigned());
      const list = await screen.findByRole('list', { name: 'Попутчики' });
      const rows = within(list).getAllByRole('listitem');
      expect(rows[0]).toHaveTextContent('Егор Макаров');
      expect(rows[0]).toHaveTextContent('Это вы');
      expect(within(rows[0]!).queryByRole('link')).not.toBeInTheDocument();
      expect(rows[1]).toHaveTextContent('Летит тем же рейсом');
      expect(rows[2]).toHaveTextContent('SU 1108 • 12:40');
      expect(screen.getByText('В машине 3 из 3 мест · багаж 2 из 2')).toBeInTheDocument();
    });

    it('searching: «Пока никого не нашли» и «Обновить»', async () => {
      renderMyTrip(makeMyTrip());
      expect(await screen.findByText('Пока никого не нашли')).toBeInTheDocument();
      await click('Обновить');
      await vi.waitFor(() => expect(api.fetchMyTrip).toHaveBeenCalledTimes(2));
    });

    it('solo: «Вы едете один» → «Найти попутчиков»', async () => {
      renderMyTrip(makeMyTrip({ application: makeApplication({ status: 'solo' }) }));
      expect(await screen.findByRole('heading', { name: 'Вы едете один' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Поеду один/ })).not.toBeInTheDocument();
      await click(/Найти попутчиков/);
      expect(api.resumeSearch).toHaveBeenCalledWith(EVENT_ID);
    });

    it('cancelled: «Участие отменено» → «Вернуться в поиск»', async () => {
      renderMyTrip(makeMyTrip({ application: makeApplication({ status: 'cancelled' }) }));
      expect(await screen.findByText('Участие отменено')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Отменить участие' })).not.toBeInTheDocument();
      await click('Вернуться в поиск');
      expect(api.resumeSearch).toHaveBeenCalledWith(EVENT_ID);
    });
  });

  describe('отметки', () => {
    it('«Я на месте» → at_meeting_point: true', async () => {
      renderMyTrip(makeMyTrip(), NEAR_ARRIVAL);
      await click(/Я на месте/);
      expect(api.setMyMarks).toHaveBeenCalledWith(EVENT_ID, { at_meeting_point: true });
    });

    it('уже на месте: плашка и «Я ещё не на месте»', async () => {
      renderMyTrip(
        makeMyTrip({ application: makeApplication({ at_meeting_point: true }) }),
        NEAR_ARRIVAL,
      );
      expect(await screen.findByText('Вы на месте')).toBeInTheDocument();
      await click('Я ещё не на месте');
      expect(api.setMyMarks).toHaveBeenCalledWith(EVENT_ID, { at_meeting_point: false });
    });

    it('«Я уехал» — через подтверждение; «Нет» возвращает', async () => {
      renderMyTrip(makeMyTrip(), NEAR_ARRIVAL);
      await click(/Я уехал/);
      expect(await screen.findByRole('heading', { name: 'Отметить отъезд?' })).toBeInTheDocument();
      expect(
        screen.getByText('Отметку нельзя отменить — после неё изменить поездку не получится'),
      ).toBeInTheDocument();
      await click('Нет, вернуться обратно');
      expect(api.setMyMarks).not.toHaveBeenCalled();
      await click(/Я уехал/);
      await click('Да, я уехал');
      expect(api.setMyMarks).toHaveBeenCalledWith(EVENT_ID, { departed: true });
    });

    it('ошибка мутации: сообщение и перезапрос поездки', async () => {
      api.setMyMarks.mockRejectedValue(
        new ApiError(409, 'ALREADY_DEPARTED', 'Вы уже отметили отъезд'),
      );
      renderMyTrip(makeMyTrip(), NEAR_ARRIVAL);
      await click(/Я на месте/);
      expect(await screen.findByRole('alert')).toHaveTextContent('Вы уже отметили отъезд');
      await vi.waitFor(() => expect(api.fetchMyTrip).toHaveBeenCalledTimes(2));
    });
  });

  describe('такси', () => {
    it('адреса копируются, без ссылки Яндекс Go кнопки нет', async () => {
      renderMyTrip(makeMyTrip(), NEAR_ARRIVAL);
      expect(await screen.findByRole('heading', { name: 'Заказ такси' })).toBeInTheDocument();
      expect(screen.getByText('Закажите такси до места назначения')).toBeInTheDocument();
      expect(screen.getByText('Откуда: Аэропорт Геленджик, выход № 3')).toBeInTheDocument();
      await click('Скопировать адрес: куда');
      expect(api.copyToClipboard).toHaveBeenCalledWith('Геленджик, ул. Курортная, 1');
      expect(await screen.findByText('Адрес назначения скопирован')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Заказать такси/ })).not.toBeInTheDocument();
    });

    it('все на месте — «Пора заказывать такси»; ссылка Яндекс Go открывается', async () => {
      const data = assigned();
      const url = 'https://go.yandex/route?x=1';
      renderMyTrip(
        {
          ...data,
          transfer: {
            ...data.transfer!,
            members: data.transfer!.members.map((m) => ({ ...m, at_meeting_point: true })),
          },
          taxi: { ...data.taxi, yandex_go_url: url },
        },
        NEAR_ARRIVAL,
      );
      expect(
        await screen.findByRole('heading', { name: 'Пора заказывать такси' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Договоритесь с попутчиками, кто закажет машину'),
      ).toBeInTheDocument();
      await click(/Заказать такси/);
      expect(api.openExternal).toHaveBeenCalledWith(url);
    });
  });

  describe('действия', () => {
    it('«Изменить данные» при assigned: подтверждение → go-solo → мастер со state', async () => {
      renderMyTrip(assigned());
      await click(/Изменить данные/);
      expect(await screen.findByRole('heading', { name: 'Изменить данные?' })).toBeInTheDocument();
      await click('Да, изменить');
      expect(api.goSolo).toHaveBeenCalledWith(EVENT_ID);
      expect(await screen.findByTestId('wizard')).toHaveTextContent(
        `${GROUP}/apply?step=review {"seekCompanions":true}`,
      );
    });

    it('«Изменить данные» без трансфера — сразу в сводку мастера', async () => {
      renderMyTrip(makeMyTrip());
      await click(/Изменить данные/);
      expect(screen.getByTestId('wizard')).toHaveTextContent(`${GROUP}/apply?step=review`);
      expect(api.goSolo).not.toHaveBeenCalled();
    });

    it('«Поеду один» — подтверждение 7.c → go-solo', async () => {
      renderMyTrip(assigned());
      await click(/Поеду один/);
      expect(
        await screen.findByRole('heading', { name: 'Отменить поиск попутчиков?' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Мы не будем искать вам попутчиков.')).toBeInTheDocument();
      await click('Да, поеду один');
      expect(api.goSolo).toHaveBeenCalledWith(EVENT_ID);
      expect(await title('До вылета 2 дня')).toBeInTheDocument();
    });

    it('«Отменить участие» — подтверждение → cancel', async () => {
      renderMyTrip(makeMyTrip());
      await click('Отменить участие');
      expect(await screen.findByRole('heading', { name: 'Отменить участие?' })).toBeInTheDocument();
      await click('Да, отменить участие');
      expect(api.cancelMyApplication).toHaveBeenCalledWith(EVENT_ID);
    });

    it('после отъезда — только «Хорошей дороги», без действий и отметок', async () => {
      renderMyTrip(
        makeMyTrip({ application: makeApplication({ departed_at: '2026-08-22T12:50:00+03:00' }) }),
        '2026-08-22T13:00:00+03:00',
      );
      expect(await title('Хорошей дороги!')).toBeInTheDocument();
      expect(screen.getByText('Вы отметили отъезд. Хорошей дороги!')).toBeInTheDocument();
      for (const name of [/Изменить данные/, /Поеду один/, 'Отменить участие', /Я на месте/]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });
  });
});
