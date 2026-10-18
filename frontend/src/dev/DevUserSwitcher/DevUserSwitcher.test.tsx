import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_USER_STORAGE_KEY, type DevUser } from '../../lib/devUsers';
import { DevUserSwitcher } from './DevUserSwitcher';

const IVAN: DevUser = { label: 'Иван Петров · +7 999 000-00-01', initData: 'hash=secret-ivan' };
const MARIA: DevUser = { label: 'Мария · +7 999 000-00-02', initData: 'hash=secret-maria' };
const USERS = [IVAN, MARIA];

describe('DevUserSwitcher', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('рендерит пользователей по label, initData не показывает', () => {
    const { container } = render(<DevUserSwitcher users={USERS} reload={vi.fn()} />);
    const select = screen.getByLabelText('Dev: пользователь');
    expect(select).toHaveValue(IVAN.label);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      USERS.map((u) => u.label),
    );
    expect(container.innerHTML).not.toContain('secret');
  });

  it('показывает выбранного в этой вкладке', () => {
    sessionStorage.setItem(DEV_USER_STORAGE_KEY, MARIA.label);
    render(<DevUserSwitcher users={USERS} reload={vi.fn()} />);
    expect(screen.getByLabelText('Dev: пользователь')).toHaveValue(MARIA.label);
  });

  it('смена пользователя пишет в sessionStorage и перезагружает', async () => {
    const reload = vi.fn();
    render(<DevUserSwitcher users={USERS} reload={reload} />);
    await userEvent.selectOptions(screen.getByLabelText('Dev: пользователь'), MARIA.label);
    expect(sessionStorage.getItem(DEV_USER_STORAGE_KEY)).toBe(MARIA.label);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('пустой список — ничего не рендерит', () => {
    const { container } = render(<DevUserSwitcher users={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
