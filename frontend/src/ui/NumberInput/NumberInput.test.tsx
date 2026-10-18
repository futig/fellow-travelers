import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberInput } from './NumberInput';

function Harness({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      label="Сколько чемоданов берёте?"
      value={value}
      onChange={setValue}
      min={1}
      max={2}
      hint="Больше двух мест не поместится в одно такси"
    />
  );
}

describe('NumberInput', () => {
  it('на минимуме «−» заблокирована, «+» увеличивает до максимума', async () => {
    render(<Harness initial={1} />);
    const group = screen.getByRole('group', { name: 'Сколько чемоданов берёте?' });
    expect(group).toHaveAccessibleDescription('Больше двух мест не поместится в одно такси');
    expect(screen.getByRole('button', { name: 'Меньше' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Больше' }));
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Больше' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Меньше' })).toBeEnabled();
  });

  it('«−» уменьшает', async () => {
    render(<Harness initial={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Меньше' }));
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });
});
