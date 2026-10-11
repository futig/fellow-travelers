import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import { initTelegram } from './lib/telegram';

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_TELEGRAM === 'true') {
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
    </StrictMode>,
  );
}

void bootstrap();
