import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('ввод вызывает onChange, ошибка связана через aria-describedby', async () => {
    const onChange = vi.fn();
    render(<TextInput label="Номер рейса" value="" onChange={onChange} error="Неверный номер" />);
    const input = screen.getByLabelText('Номер рейса');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Неверный номер');
    await userEvent.type(input, 'S');
    expect(onChange).toHaveBeenCalledWith('S');
  });

  it('многострочный режим', () => {
    render(<TextInput label="Инструкция" value="текст" onChange={() => {}} multiline />);
    expect(screen.getByLabelText('Инструкция').tagName).toBe('TEXTAREA');
  });
});
