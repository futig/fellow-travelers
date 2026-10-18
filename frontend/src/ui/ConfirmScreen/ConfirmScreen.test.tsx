import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmScreen } from './ConfirmScreen';

describe('ConfirmScreen', () => {
  it('кнопки вызывают обработчики; pending блокирует', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmScreen
        title="Отменить поиск попутчиков?"
        text="Мы не будем искать вам попутчиков."
        confirmLabel="Да, поеду один"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Отменить поиск попутчиков?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Нет, вернуться обратно' }));
    await userEvent.click(screen.getByRole('button', { name: 'Да, поеду один' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <ConfirmScreen
        title="Отменить поиск попутчиков?"
        confirmLabel="Да, поеду один"
        onConfirm={onConfirm}
        onCancel={onCancel}
        pending
        error="Не получилось"
      />,
    );
    expect(screen.getByRole('button', { name: 'Да, поеду один' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Не получилось');
  });
});
