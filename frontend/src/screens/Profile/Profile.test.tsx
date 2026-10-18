import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NoInitDataError } from '../../api/errors';
import type { Me } from '../../api/me';
import { Profile } from './Profile';

const fetchMe = vi.hoisted(() => vi.fn());

vi.mock('../../api/me', () => ({ fetchMe, meQueryKey: ['me'] }));
vi.mock('../../lib/telegram', () => ({
  getInitDataPhotoUrl: () => undefined,
  canRequestContact: () => true,
  askForContact: vi.fn(),
  openBot: vi.fn(),
}));

const baseMe: Me = {
  user_id: '7b0e1c0e-6f0e-4a3e-9d5e-1f6f0b8f2a11',
  first_name: 'Иван',
  last_name: 'Петров',
  username: 'ivan_petrov',
  phone: '+79122042912',
  photo_url: null,
  telegram_id: 1,
  has_phone: true,
};

function renderProfile() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Profile', () => {
  beforeEach(() => {
    fetchMe.mockReset();
  });

  it('с телефоном: значения видны, «Далее» активна', async () => {
    fetchMe.mockResolvedValue(baseMe);
    renderProfile();

    expect(await screen.findByLabelText('Имя')).toHaveValue('Иван Петров');
    expect(screen.getByLabelText('Телеграм')).toHaveValue('@ivan_petrov');
    expect(screen.getByLabelText('Номер телефона')).toHaveValue('+7 912 204 29 12');
    expect(screen.getByRole('button', { name: /Далее/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Поделиться номером' })).not.toBeInTheDocument();
    expect(screen.getByText('Шаг 1 из 5')).toBeInTheDocument();
  });

  it('без телефона: «Далее» disabled, есть «Поделиться номером» и пояснение', async () => {
    fetchMe.mockResolvedValue({ ...baseMe, phone: null, has_phone: false, username: null });
    renderProfile();

    expect(await screen.findByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByLabelText('Номер телефона')).toHaveValue('');
    expect(screen.getByLabelText('Телеграм')).toHaveValue('нет');
    expect(screen.getByRole('button', { name: /Далее/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Поделиться номером' })).toBeEnabled();
    expect(screen.getByText(/Телефон нужен, чтобы попутчики/)).toBeInTheDocument();
  });

  it('401 → «Откройте приложение из Telegram»', async () => {
    fetchMe.mockImplementation(async () => {
      throw new ApiError(401, 'UNAUTHORIZED', 'Нет доступа');
    });
    renderProfile();
    expect(
      await screen.findByRole('heading', { name: 'Откройте приложение из Telegram' }),
    ).toBeInTheDocument();
  });

  it('отсутствие initData → «Откройте приложение из Telegram»', async () => {
    fetchMe.mockImplementation(async () => {
      throw new NoInitDataError();
    });
    renderProfile();
    expect(
      await screen.findByRole('heading', { name: 'Откройте приложение из Telegram' }),
    ).toBeInTheDocument();
  });

  it('прочие ошибки → сообщение и «Повторить попытку»', async () => {
    fetchMe.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Сервер недоступен'));
    renderProfile();

    expect(await screen.findByText('Сервер недоступен')).toBeInTheDocument();
    fetchMe.mockResolvedValue(baseMe);
    screen.getByRole('button', { name: /Повторить попытку/ }).click();
    expect(await screen.findByLabelText('Имя')).toHaveValue('Иван Петров');
  });
});
