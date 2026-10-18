import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Option } from './Option';

describe('Option', () => {
  it('с onClick — кнопка, клик вызывает обработчик', async () => {
    const onClick = vi.fn();
    render(
      <Option leading="🎒" title="Только ручная кладь" subtitle="Сразу выйду" onClick={onClick} />,
    );
    const button = screen.getByRole('button', { name: /Только ручная кладь/ });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('без onClick — не кнопка', () => {
    render(<Option title="Лечу один" trailing="edit" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Лечу один')).toBeInTheDocument();
  });

  it('disabled — клик не срабатывает', async () => {
    const onClick = vi.fn();
    render(<Option title="Москва" onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: /Москва/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
