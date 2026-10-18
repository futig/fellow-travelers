import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в `intervalMs` (обратный отсчёт, фазы поездки). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
