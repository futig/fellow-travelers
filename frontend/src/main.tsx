import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import { initTelegram } from './lib/telegram';

/** Только dev с моком Telegram: переключатель тестовых пользователей (в prod-сборку не попадает). */
async function loadDevUserSwitcher(): Promise<ReactNode> {
  try {
    const [{ getDevUsers }, { DevUserSwitcher }] = await Promise.all([
      import('./lib/devUsers'),
      import('./dev/DevUserSwitcher/DevUserSwitcher'),
    ]);
    const users = getDevUsers();
    return users.length > 0 ? <DevUserSwitcher users={users} /> : null;
  } catch (e) {
    console.error('Переключатель dev-пользователей не загружен', e);
    return null;
  }
}

async function bootstrap() {
  let devTools: ReactNode = null;
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_TELEGRAM === 'true') {
    devTools = await loadDevUserSwitcher();
    try {
      const { setupMockTelegram } = await import('./lib/mockTelegram');
      setupMockTelegram();
    } catch (e) {
      console.error('Мок Telegram не установлен', e);
    }
  }
  initTelegram();

  // App читает start_param при загрузке модуля, поэтому импортируем его после мока и init.
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      {devTools}
    </StrictMode>,
  );
}

void bootstrap();
