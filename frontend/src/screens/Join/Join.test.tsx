import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/render';
import { Join } from './Join';

function renderJoin() {
  return renderRoute('/join', <Join />, '/join', ['/']);
}

describe('Join', () => {
  it('код приводится к верхнему регистру, «Далее» активна только для 6 букв и цифр', async () => {
    renderJoin();
    const input = screen.getByLabelText('Код приглашения');
    const next = screen.getByRole('button', { name: /Далее/ });

    expect(input).toHaveAttribute('maxlength', '6');
    expect(input).toHaveAttribute('autocapitalize', 'characters');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(next).toBeDisabled();

    await userEvent.type(input, 'k7q2z');
    expect(input).toHaveValue('K7Q2Z');
    expect(next).toBeDisabled();

    await userEvent.type(input, 'p');
    expect(input).toHaveValue('K7Q2ZP');
    expect(next).toBeEnabled();
  });

  it('кириллица — ошибка под полем, «Далее» disabled', async () => {
    renderJoin();
    const input = screen.getByLabelText('Код приглашения');
    await userEvent.type(input, 'К7Q2ZP');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Только латинские буквы и цифры');
    expect(screen.getByRole('button', { name: /Далее/ })).toBeDisabled();
  });

  it('«Далее» → превью приглашения', async () => {
    renderJoin();
    await userEvent.type(screen.getByLabelText('Код приглашения'), 'k7q2zp');
    await userEvent.click(screen.getByRole('button', { name: /Далее/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/invite/K7Q2ZP');
  });

  it('Enter в поле отправляет форму', async () => {
    renderJoin();
    await userEvent.type(screen.getByLabelText('Код приглашения'), 'K7Q2ZP{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/invite/K7Q2ZP');
  });
});
