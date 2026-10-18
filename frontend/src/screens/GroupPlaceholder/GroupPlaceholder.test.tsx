import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { makeEvent } from '../../test/events';
import { renderRoute } from '../../test/render';
import { GroupPlaceholder } from './GroupPlaceholder';

const fetchEvent = vi.hoisted(() => vi.fn());
const fetchMyApplication = vi.hoisted(() => vi.fn());

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent,
}));
vi.mock('../../api/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/applications')>()),
  fetchMyApplication,
}));

const EVENT_ID = '44444444-4444-4444-8444-444444444444';

describe('GroupPlaceholder', () => {
  beforeEach(() => {
    fetchEvent.mockReset();
    fetchMyApplication.mockReset().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Нет заявки'));
  });

  it('название, даты и подпись о следующей версии', async () => {
    fetchEvent.mockResolvedValue({
      id: EVENT_ID,
      title: 'Слёт в Геленджике',
      starts_on: '2026-08-22',
      ends_on: '2026-08-24',
    });
    renderRoute('/events/:id', <GroupPlaceholder />, `/events/${EVENT_ID}`);

    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByText('Ваша поездка')).toBeInTheDocument();
    expect(screen.getByText('22–24 августа 2026')).toBeInTheDocument();
    expect(screen.getByText('Экран группы появится в следующей версии')).toBeInTheDocument();
    expect(fetchEvent).toHaveBeenCalledWith(EVENT_ID);
  });

  it('404 → «Группа не найдена»', async () => {
    fetchEvent.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Не найдено'));
    renderRoute('/events/:id', <GroupPlaceholder />, `/events/${EVENT_ID}`);
    expect(await screen.findByText('Группа не найдена')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Мои группы' })).toBeInTheDocument();
  });

  it('участник без заявки → «Заполнить заявку» ведёт в мастер', async () => {
    fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    renderRoute('/events/:id', <GroupPlaceholder />, `/events/${EVENT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: /Заполнить заявку/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/events/${EVENT_ID}/apply`);
  });

  it('участник с заявкой → «Изменить заявку» открывает сводку', async () => {
    fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    fetchMyApplication.mockResolvedValue({ id: 'app' });
    renderRoute('/events/:id', <GroupPlaceholder />, `/events/${EVENT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: /Изменить заявку/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/events/${EVENT_ID}/apply?step=review`,
    );
  });

  it('не участник — кнопки заявки нет', async () => {
    fetchEvent.mockResolvedValue(makeEvent({ is_admin: true, is_participant: false }));
    renderRoute('/events/:id', <GroupPlaceholder />, `/events/${EVENT_ID}`);
    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /заявку/ })).not.toBeInTheDocument();
  });
});
