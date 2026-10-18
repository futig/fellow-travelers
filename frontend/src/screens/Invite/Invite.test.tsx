import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NoInitDataError } from '../../api/errors';
import type { Event, InvitePreview } from '../../api/types';
import { renderRoute } from '../../test/render';
import { Invite } from './Invite';

const fetchInvitePreview = vi.hoisted(() => vi.fn());
const joinByInvite = vi.hoisted(() => vi.fn());

vi.mock('../../api/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/invites')>()),
  fetchInvitePreview,
  joinByInvite,
}));

const EVENT_ID = '44444444-4444-4444-8444-444444444444';

const preview: InvitePreview = {
  event_id: EVENT_ID,
  title: 'Слёт в Геленджике',
  starts_on: '2026-08-22',
  ends_on: '2026-08-24',
  join_open: true,
  already_member: false,
};

const point = { address: 'Геленджик, ул. Курортная, 1', lat: null, lon: null };

const event: Event = {
  id: EVENT_ID,
  title: preview.title,
  starts_on: preview.starts_on,
  ends_on: preview.ends_on,
  meeting_point: point,
  pickup_point: point,
  destination: point,
  meeting_instruction: '',
  chat_url: null,
  join_open: true,
  is_admin: false,
  is_participant: true,
};

/** По умолчанию — как по deep link: превью открыто первым экраном. */
function renderInvite(history: string[] = []) {
  return renderRoute('/invite/:code', <Invite />, '/invite/k7q2zp', history);
}

/** Ждёт загрузки превью (в скелетоне «Вступить» тоже есть, но disabled) и жмёт «Вступить». */
async function clickJoin() {
  await screen.findByRole('heading', { name: preview.title });
  await userEvent.click(screen.getByRole('button', { name: /Вступить/ }));
}

describe('Invite', () => {
  beforeEach(() => {
    fetchInvitePreview.mockReset();
    joinByInvite.mockReset();
  });

  it('обычное: название, даты, пояснение и «Вступить»; код — в верхнем регистре', async () => {
    fetchInvitePreview.mockResolvedValue(preview);
    renderInvite();

    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByText('Приглашение')).toBeInTheDocument();
    expect(screen.getByText('22–24 августа 2026')).toBeInTheDocument();
    expect(screen.getByText(/После вступления заполните заявку/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Вступить/ })).toBeEnabled();
    expect(fetchInvitePreview).toHaveBeenCalledWith('K7Q2ZP');
  });

  it('успешное вступление → группа с заменой записи', async () => {
    fetchInvitePreview.mockResolvedValue(preview);
    let resolveJoin: (e: Event) => void = () => {};
    joinByInvite.mockReturnValue(new Promise<Event>((r) => (resolveJoin = r)));
    const { router } = renderInvite(['/']);

    await clickJoin();
    expect(screen.getByRole('button', { name: /Вступить/ })).toBeDisabled();
    expect(joinByInvite).toHaveBeenCalledWith('K7Q2ZP');

    fetchInvitePreview.mockResolvedValue({ ...preview, already_member: true });
    resolveJoin(event);
    expect(await screen.findByTestId('location')).toHaveTextContent(`/events/${EVENT_ID}`);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('button', { name: /Перейти в группу/ })).not.toBeInTheDocument();
  });

  it('already_member → «Перейти в группу» с заменой записи', async () => {
    fetchInvitePreview.mockResolvedValue({ ...preview, already_member: true });
    const { router } = renderInvite();

    await userEvent.click(await screen.findByRole('button', { name: /Перейти в группу/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/events/${EVENT_ID}`);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('button', { name: /Вступить/ })).not.toBeInTheDocument();
  });

  it('join_open=false → «Вступление закрыто» и «Мои группы»', async () => {
    fetchInvitePreview.mockResolvedValue({ ...preview, join_open: false });
    renderInvite();

    expect(await screen.findByText('Вступление закрыто')).toBeInTheDocument();
    expect(screen.getByText('Организатор закрыл вступление в эту группу')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Вступить/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Мои группы' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('JOIN_CLOSED на вступлении → «Вступление закрыто»', async () => {
    fetchInvitePreview.mockResolvedValue(preview);
    joinByInvite.mockRejectedValue(
      new ApiError(409, 'JOIN_CLOSED', 'Организатор закрыл вступление'),
    );
    renderInvite();

    await clickJoin();
    expect(await screen.findByText('Вступление закрыто')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Вступить/ })).not.toBeInTheDocument();
  });

  it('прочая ошибка вступления → message под кнопкой, можно повторить', async () => {
    fetchInvitePreview.mockResolvedValue(preview);
    joinByInvite.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'));
    renderInvite();

    await clickJoin();
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
    expect(screen.getByRole('button', { name: /Вступить/ })).toBeEnabled();
  });

  it('404 INVITE_NOT_FOUND → «Мы не нашли группу» и «Ввести другой код»', async () => {
    fetchInvitePreview.mockRejectedValue(
      new ApiError(404, 'INVITE_NOT_FOUND', 'Приглашение не найдено'),
    );
    renderInvite();

    expect(await screen.findByText('Мы не нашли группу')).toBeInTheDocument();
    expect(screen.getByText('Проверьте код приглашения')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ввести другой код/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/join');
  });

  it('нет initData → «Откройте приложение из Telegram»', async () => {
    fetchInvitePreview.mockRejectedValue(new NoInitDataError());
    renderInvite();
    expect(
      await screen.findByRole('heading', { name: 'Откройте приложение из Telegram' }),
    ).toBeInTheDocument();
  });

  it('прочая ошибка загрузки → ErrorScreen с повтором', async () => {
    fetchInvitePreview.mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'),
    );
    renderInvite();

    expect(await screen.findByText('Сервер недоступен')).toBeInTheDocument();
    fetchInvitePreview.mockResolvedValue(preview);
    await userEvent.click(screen.getByRole('button', { name: /Повторить попытку/ }));
    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
  });
});
