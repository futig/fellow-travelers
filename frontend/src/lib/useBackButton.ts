import { backButton } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

/** Показывает BackButton Telegram, пока компонент смонтирован. Вне Telegram ничего не делает. */
export function useBackButton(onClick: () => void): void {
  useEffect(() => {
    try {
      if (!backButton.isSupported() || !backButton.mount.isAvailable()) return;
      backButton.mount();
      backButton.show();
      const off = backButton.onClick(onClick);
      return () => {
        off();
        backButton.hide();
      };
    } catch {
      return;
    }
  }, [onClick]);
}
