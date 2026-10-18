import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { EVENT_ID, makeEvent } from '../../test/events';
import { GDZ, makeTrip, SVO } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { TripForm } from './TripForm';

const api = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  fetchEventTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  searchLocations: vi.fn(),
}));

vi.mock('../../api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/events')>()),
  fetchEvent: api.fetchEvent,
}));
vi.mock('../../api/trips', () => ({
  fetchEventTrips: api.fetchEventTrips,
  createTrip: api.createTrip,
  updateTrip: api.updateTrip,
  deleteTrip: api.deleteTrip,
}));
vi.mock('../../api/locations', () => ({ searchLocations: api.searchLocations }));

const LIST = `/events/${EVENT_ID}/admin/trips`;
const trip = makeTrip();

/** Как в App: `/trips/new` — отдельный маршрут без `:tripId`. */
function renderForm(path: string) {
  const route = path.endsWith('/new')
    ? '/events/:id/admin/trips/new'
    : '/events/:id/admin/trips/:tripId';
  return renderRoute(route, <TripForm />, path, [LIST]);
}

async function pickAirport(label: string, query: string, option: RegExp) {
  await userEvent.type(screen.getByLabelText(label), query);
  await userEvent.click(await screen.findByRole('button', { name: option }));
}

describe('TripForm', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchEvent.mockResolvedValue(makeEvent());
    api.fetchEventTrips.mockResolvedValue([trip]);
    api.searchLocations.mockImplementation(async (q: string) =>
      q.toLowerCase().startsWith('мос') ? [SVO] : [GDZ],
    );
  });

  it('создание: номер в верхнем регистре, проверка формата, тело запроса, назад к списку', async () => {
    api.createTrip.mockResolvedValue(trip);
    renderForm(`${LIST}/new`);

    const number = await screen.findByLabelText('Номер рейса');
    await userEvent.type(number, 'su-1148');
    expect(number).toHaveValue('SU-1148');
    await userEvent.click(screen.getByRole('button', { name: /Добавить рейс/ }));
    expect(number).toHaveAccessibleDescription(/Номер рейса — например, SU 1148/);
    expect(api.createTrip).not.toHaveBeenCalled();

    await userEvent.clear(number);
    await userEvent.type(number, 'su 1148');
    await pickAirport('Аэропорт вылета', 'мос', /Москва · SVO/);
    await pickAirport('Аэропорт прилёта', 'гел', /Геленджик · GDZ/);
    fireEvent.change(screen.getByLabelText('Вылет (местное время аэропорта вылета)'), {
      target: { value: '2026-08-22T08:40' },
    });
    fireEvent.change(screen.getByLabelText('Прилёт (местное время аэропорта прилёта)'), {
      target: { value: '2026-08-22T12:25' },
    });
    expect(screen.queryByLabelText(/Расчётное время прилёта/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Добавить рейс/ }));

    expect(api.createTrip).toHaveBeenCalledWith(EVENT_ID, {
      mode: 'flight',
      number: 'SU 1148',
      departure_location_id: SVO.id,
      arrival_location_id: GDZ.id,
      scheduled_departure: '2026-08-22T08:40:00',
      scheduled_arrival: '2026-08-22T12:25:00',
    });
    expect(await screen.findByTestId('location')).toHaveTextContent(new RegExp(`^${LIST}$`));
  });

  it('422 при создании — под полями', async () => {
    api.createTrip.mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Проверьте введённые данные', {
        number: 'Такой рейс уже добавлен',
      }),
    );
    renderForm(`${LIST}/new`);
    await userEvent.type(await screen.findByLabelText('Номер рейса'), 'SU1148');
    await pickAirport('Аэропорт вылета', 'мос', /Москва · SVO/);
    await pickAirport('Аэропорт прилёта', 'гел', /Геленджик · GDZ/);
    fireEvent.change(screen.getByLabelText('Вылет (местное время аэропорта вылета)'), {
      target: { value: '2026-08-22T08:40' },
    });
    fireEvent.change(screen.getByLabelText('Прилёт (местное время аэропорта прилёта)'), {
      target: { value: '2026-08-22T12:25' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Добавить рейс/ }));
    expect(await screen.findByLabelText('Номер рейса')).toHaveAccessibleDescription(
      /Такой рейс уже добавлен/,
    );
  });

  it('правка: предзаполнение, PATCH только изменений, назад к списку', async () => {
    api.updateTrip.mockResolvedValue(trip);
    renderForm(`${LIST}/${trip.id}`);

    expect(await screen.findByRole('heading', { name: 'Рейс SU 1148' })).toBeInTheDocument();
    expect(screen.getByLabelText('Номер рейса')).toHaveValue('SU 1148');
    expect(
      screen.getByRole('button', { name: /Аэропорт вылета: Москва · SVO/ }),
    ).toBeInTheDocument();
    const arrival = screen.getByLabelText('Прилёт (местное время аэропорта прилёта)');
    expect(arrival).toHaveValue('2026-08-22T12:25');

    fireEvent.change(arrival, { target: { value: '2026-08-22T12:50' } });
    fireEvent.change(screen.getByLabelText(/Расчётное время прилёта/), {
      target: { value: '2026-08-22T13:10' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Сохранить/ }));

    expect(api.updateTrip).toHaveBeenCalledWith(trip.id, {
      scheduled_arrival: '2026-08-22T12:50:00',
      estimated_arrival: '2026-08-22T13:10:00',
    });
    expect(await screen.findByTestId('location')).toHaveTextContent(new RegExp(`^${LIST}$`));
  });

  it('рейса нет в списке — «Рейс не найден»', async () => {
    renderForm(`${LIST}/missing`);
    expect(await screen.findByText('Рейс не найден')).toBeInTheDocument();
  });

  it('удаление: подтверждение → DELETE → назад к списку', async () => {
    api.deleteTrip.mockResolvedValue(undefined);
    renderForm(`${LIST}/${trip.id}`);

    await userEvent.click(await screen.findByRole('button', { name: /Удалить рейс/ }));
    expect(screen.getByRole('heading', { name: 'Удалить рейс?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));
    expect(api.deleteTrip).toHaveBeenCalledWith(trip.id);
    expect(await screen.findByTestId('location')).toHaveTextContent(new RegExp(`^${LIST}$`));
  });

  it('TRIP_IN_USE — объяснение на форме, остаёмся', async () => {
    api.deleteTrip.mockRejectedValue(
      new ApiError(409, 'TRIP_IN_USE', 'На рейс уже есть заявки — его нельзя удалить'),
    );
    renderForm(`${LIST}/${trip.id}`);

    await userEvent.click(await screen.findByRole('button', { name: /Удалить рейс/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'На этот рейс уже есть заявки — удалить нельзя. Исправьте данные рейса.',
    );
    expect(screen.getByLabelText('Номер рейса')).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });
});
