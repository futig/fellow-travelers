import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_ID, makeEvent } from '../../test/events';
import { makeTrip } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { Trips } from './Trips';

const api = vi.hoisted(() => ({ fetchEvent: vi.fn(), fetchEventTrips: vi.fn() }));

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent: api.fetchEvent,
}));
vi.mock('../../api/trips', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/trips')>()),
  fetchEventTrips: api.fetchEventTrips,
}));

const BASE = `/events/${EVENT_ID}/admin/trips`;

function renderTrips() {
  return renderRoute('/events/:id/admin/trips', <Trips />, BASE);
}

describe('Trips', () => {
  beforeEach(() => {
    api.fetchEvent.mockReset().mockResolvedValue(makeEvent());
    api.fetchEventTrips.mockReset();
  });

  it('список по времени вылета, клик → редактирование', async () => {
    const late = makeTrip({
      id: 'late',
      number: 'SU1150',
      scheduled_departure: '2026-08-23T08:40:00+03:00',
    });
    const early = makeTrip({ id: 'early', number: 'S71024' });
    api.fetchEventTrips.mockResolvedValue([late, early]);
    renderTrips();

    const items = await screen.findAllByRole('button', { name: /SU 1150|S7 1024/ });
    expect(items.map((b) => b.textContent)).toEqual([
      expect.stringContaining('S7 1024 · 22 августа'),
      expect.stringContaining('SU 1150 · 23 августа'),
    ]);
    await userEvent.click(items[1]!);
    expect(screen.getByTestId('location')).toHaveTextContent(`${BASE}/late`);
  });

  it('пусто — «Рейсов пока нет»; «Добавить рейс» → форма', async () => {
    api.fetchEventTrips.mockResolvedValue([]);
    renderTrips();
    expect(await screen.findByText('Рейсов пока нет')).toBeInTheDocument();
    expect(screen.getByText('Добавьте рейсы, которыми летят участники')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Добавить рейс/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`${BASE}/new`);
  });

  it('не админ → «только организатор»', async () => {
    api.fetchEvent.mockResolvedValue(makeEvent({ is_admin: false, is_participant: true }));
    api.fetchEventTrips.mockResolvedValue([]);
    renderTrips();
    expect(
      await screen.findByText('Управлять группой может только организатор'),
    ).toBeInTheDocument();
  });
});
