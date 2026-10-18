import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const TABS = [
  { id: 'participants', label: 'Участники' },
  { id: 'transfers', label: 'Трансферы' },
] as const;

function Harness() {
  const [value, setValue] = useState<'participants' | 'transfers'>('participants');
  return <Tabs tabs={TABS} value={value} onChange={setValue} aria-label="Разделы" />;
}

describe('Tabs', () => {
  it('клик и стрелки переключают вкладку', async () => {
    render(<Harness />);
    const [first, second] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(second!);
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{ArrowRight}');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveFocus();
  });
});
