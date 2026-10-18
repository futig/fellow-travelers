import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorScreen, OpenInTelegramScreen } from './ErrorScreen';

describe('ErrorScreen', () => {
  it('заголовок по умолчанию, текст ошибки и «Повторить попытку»', async () => {
    const onRetry = vi.fn();
    render(<ErrorScreen text="Сервер недоступен" onRetry={onRetry} />);
    expect(
      screen.getByRole('heading', { name: 'Не удалось загрузить страницу' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Сервер недоступен')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Повторить попытку/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('без onRetry — без кнопки', () => {
    render(<OpenInTelegramScreen />);
    expect(
      screen.getByRole('heading', { name: 'Откройте приложение из Telegram' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('action — своя кнопка вместо «Повторить попытку»', async () => {
    const onClick = vi.fn();
    render(<ErrorScreen text="x" onRetry={vi.fn()} action={{ label: 'Мои группы', onClick }} />);
    expect(screen.queryByRole('button', { name: /Повторить попытку/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Мои группы/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
