import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTrip } from '../test/fixtures';
import { fetchAdminParticipants } from './admin';
import { upsertMyApplication } from './applications';
import { ApiError, NoInitDataError, shouldRetry, toApiError } from './errors';
import {
  useDeleteTrip,
  useJoin,
  useLocations,
  useUpdateEvent,
  useUpsertApplication,
} from './hooks';
import { queryKeys } from './keys';
import { fetchMyTrip } from './myTrip';
import { deleteTrip } from './trips';
import type { Application } from './types';

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  PATCH: vi.fn(),
  DELETE: vi.fn(),
}));
const initData = vi.hoisted(() => ({ value: 'raw-init-data' as string | undefined }));

vi.mock('./client', () => ({ api }));
vi.mock('../lib/telegram', () => ({ getInitDataRaw: () => initData.value }));

const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function fail(status: number, body: unknown) {
  return { data: undefined, error: body, response: new Response(null, { status }) };
}

const application: Application = {
  id: '66666666-6666-4666-8666-666666666666',
  event_id: EVENT_ID,
  trip: makeTrip(),
  with_companion: false,
  passengers: 1,
  baggage_count: 0,
  max_wait_minutes: 15,
  status: 'searching',
  at_meeting_point: false,
  departed_at: null,
  transfer_id: null,
  created_at: '2026-08-01T10:00:00+00:00',
  updated_at: '2026-08-01T10:00:00+00:00',
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  initData.value = 'raw-init-data';
});

describe('errors', () => {
  it('422: details.fields попадает в ApiError.fields', () => {
    const err = toApiError(422, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Неверные поля',
        details: { fields: { number: 'Обязательное поле', bad: 1 } },
      },
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fields).toEqual({ number: 'Обязательное поле' });
  });

  it('без details.fields — fields не заданы', () => {
    expect(
      toApiError(409, { error: { code: 'JOIN_CLOSED', message: 'x', details: null } }).fields,
    ).toBeUndefined();
  });

  it('shouldRetry: 4xx и отсутствие initData не повторяем, 5xx — до 2 раз', () => {
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', ''))).toBe(false);
    expect(shouldRetry(0, new NoInitDataError())).toBe(false);
    expect(shouldRetry(0, new ApiError(503, 'INTERNAL_ERROR', ''))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new ApiError(500, 'INTERNAL_ERROR', ''))).toBe(false);
  });
});

describe('API-функции', () => {
  it('fetchMyTrip: путь с event_id, данные из ответа', async () => {
    const myTrip = { application: null, transfer: null };
    api.GET.mockResolvedValue(ok(myTrip));
    expect(await fetchMyTrip(EVENT_ID)).toBe(myTrip);
    expect(api.GET).toHaveBeenCalledWith('/events/{event_id}/my-trip', {
      params: { path: { event_id: EVENT_ID } },
    });
  });

  it('без initData — NoInitDataError без запроса', async () => {
    initData.value = undefined;
    await expect(fetchMyTrip(EVENT_ID)).rejects.toBeInstanceOf(NoInitDataError);
    expect(api.GET).not.toHaveBeenCalled();
  });

  it('upsertMyApplication: ошибка контракта → ApiError с кодом', async () => {
    api.PUT.mockResolvedValue(
      fail(409, {
        error: { code: 'APPLICATION_LOCKED', message: 'Заявку уже нельзя менять', details: null },
      }),
    );
    const body = {
      trip_id: application.trip.id,
      with_companion: false,
      baggage_count: 0,
      max_wait_minutes: 15 as const,
      seek_companions: true,
    };
    const err = await upsertMyApplication(EVENT_ID, body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'APPLICATION_LOCKED' });
    expect(api.PUT).toHaveBeenCalledWith('/events/{event_id}/my-application', {
      params: { path: { event_id: EVENT_ID } },
      body,
    });
  });

  it('deleteTrip: 204 без тела — успех', async () => {
    api.DELETE.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    });
    await expect(deleteTrip('t1')).resolves.toBeUndefined();
  });

  it('fetchAdminParticipants: пустые фильтры не передаются', async () => {
    api.GET.mockResolvedValue(ok({ counters: {}, participants: [] }));
    await fetchAdminParticipants(EVENT_ID, { status: [], trip_id: undefined });
    expect(api.GET).toHaveBeenLastCalledWith('/events/{event_id}/admin/participants', {
      params: { path: { event_id: EVENT_ID }, query: {} },
    });
    await fetchAdminParticipants(EVENT_ID, { status: ['searching', 'solo'] });
    expect(api.GET).toHaveBeenLastCalledWith('/events/{event_id}/admin/participants', {
      params: { path: { event_id: EVENT_ID }, query: { status: ['searching', 'solo'] } },
    });
  });
});

describe('хуки', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrapper };
  }

  function invalidatedKeys(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);
  }

  it('useUpsertApplication: заявка — из ответа, инвалидируются поездка, мои группы, админка', async () => {
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    api.PUT.mockResolvedValue(ok(application));
    const { result } = renderHook(() => useUpsertApplication(EVENT_ID), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        trip_id: application.trip.id,
        with_companion: false,
        baggage_count: 0,
        max_wait_minutes: 15,
      }),
    );
    expect(invalidatedKeys(spy)).toEqual([
      queryKeys.myTrip(EVENT_ID),
      queryKeys.myEvents,
      queryKeys.admin(EVENT_ID),
    ]);
    expect(client.getQueryData(queryKeys.myApplication(EVENT_ID))).toEqual(application);
  });

  it('useDeleteTrip: рейсы, заявка, поездка, админка', async () => {
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    api.DELETE.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    });
    const { result } = renderHook(() => useDeleteTrip(EVENT_ID), { wrapper });
    await act(() => result.current.mutateAsync('t1'));
    expect(invalidatedKeys(spy)).toEqual([
      queryKeys.trips(EVENT_ID),
      queryKeys.myApplication(EVENT_ID),
      queryKeys.myTrip(EVENT_ID),
      queryKeys.admin(EVENT_ID),
    ]);
  });

  it('useUpdateEvent: группа — из ответа, инвалидируются мои группы и поездка', async () => {
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const event = { id: EVENT_ID, title: 'Конференция' };
    api.PATCH.mockResolvedValue(ok(event));
    const { result } = renderHook(() => useUpdateEvent(EVENT_ID), { wrapper });
    await act(() => result.current.mutateAsync({ title: 'Конференция' }));
    expect(invalidatedKeys(spy)).toEqual([queryKeys.myEvents, queryKeys.myTrip(EVENT_ID)]);
    expect(client.getQueryData(queryKeys.event(EVENT_ID))).toEqual(event);
  });

  it('useJoin: мои группы, поездка, админка (превью — нет)', async () => {
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    api.POST.mockResolvedValue(ok({ id: EVENT_ID, title: 'Конференция' }, 201));
    const { result } = renderHook(() => useJoin(), { wrapper });
    await act(() => result.current.mutateAsync('k7q2zp'));
    expect(invalidatedKeys(spy)).toEqual([
      queryKeys.myEvents,
      queryKeys.myTrip(EVENT_ID),
      queryKeys.admin(EVENT_ID),
    ]);
  });

  it('useLocations: короче 2 символов запрос не уходит', async () => {
    const { wrapper } = setup();
    api.GET.mockResolvedValue(ok([]));
    const { result, rerender } = renderHook(({ q }) => useLocations(q), {
      wrapper,
      initialProps: { q: 'S' },
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.GET).not.toHaveBeenCalled();
    rerender({ q: 'SV' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.GET).toHaveBeenCalledWith('/locations', {
      params: { query: { q: 'SV', kind: 'airport' } },
    });
  });
});
