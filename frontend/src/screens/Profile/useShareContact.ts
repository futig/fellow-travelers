import { useEffect, useRef, useState } from 'react';
import { askForContact, canRequestContact, openBot } from '../../lib/telegram';
import { pollUntil } from '../../lib/poll';

const POLL_ATTEMPTS = 5;
const POLL_DELAY_MS = 1000;

/**
 * Запрос контакта у пользователя. Бот сохраняет телефон асинхронно, поэтому после попапа
 * перезапрашиваем /me до 5 раз раз в секунду, пока не появится has_phone.
 */
export function useShareContact(refetchHasPhone: () => Promise<boolean>) {
  const [sharing, setSharing] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function share() {
    if (!canRequestContact()) {
      openBot();
      return;
    }
    setSharing(true);
    try {
      await askForContact();
      await pollUntil(refetchHasPhone, {
        attempts: POLL_ATTEMPTS,
        delayMs: POLL_DELAY_MS,
        isCancelled: () => cancelled.current,
      });
    } finally {
      if (!cancelled.current) setSharing(false);
    }
  }

  return { sharing, share };
}
