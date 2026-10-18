import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { renderRoute } from '../../test/render';
import { GroupPlaceholder } from './GroupPlaceholder';

const fetchEvent = vi.hoisted(() => vi.fn());

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent,
}));

const EVENT_ID = '44444444-4444-4444-8444-444444444444';

describe('GroupPlaceholder', () => {
  beforeEach(() => {
    fetchEvent.mockReset();
  });

  it('название, даты и подпись о следующей версии', async () => {
    fetchEvent.mockResolvedValue({
      id: EVENT_ID,
      title: 'Слёт в Геленджике',
      starts_on: '2026-08-22',
      ends_on: '2026-08-24',
    });
    renderRoute('/events/:id/admin', <GroupPlaceholder admin />, `/events/${EVENT_ID}/admin`);

    expect(await screen.findByRole('heading', { name: 'Слёт в Геленджике' })).toBeInTheDocument();
    expect(screen.getByText('Администратор')).toBeInTheDocument();
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
});
