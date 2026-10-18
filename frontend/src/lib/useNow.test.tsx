import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

describe('useNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('обновляется раз в интервал', () => {
    vi.useFakeTimers({ now: new Date('2026-08-22T10:00:00Z') });
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current.toISOString()).toBe('2026-08-22T10:00:00.000Z');
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe('2026-08-22T10:01:00.000Z');
  });
});
