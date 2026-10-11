import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollUntil } from './poll';

describe('pollUntil', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('останавливается, когда условие выполнилось', async () => {
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const promise = pollUntil(check, { attempts: 5, delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('делает не больше заданного числа попыток', async () => {
    const check = vi.fn().mockResolvedValue(false);
    const promise = pollUntil(check, { attempts: 5, delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBe(false);
    expect(check).toHaveBeenCalledTimes(5);
  });
});
