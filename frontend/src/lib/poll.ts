const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Вызывает `check` до `attempts` раз с паузой `delayMs` перед каждой попыткой,
 * пока она не вернёт true. Возвращает true, если условие выполнилось.
 */
export async function pollUntil(
  check: () => Promise<boolean>,
  {
    attempts,
    delayMs,
    isCancelled,
  }: { attempts: number; delayMs: number; isCancelled?: () => boolean },
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs);
    if (isCancelled?.()) return false;
    if (await check()) return true;
  }
  return false;
}
