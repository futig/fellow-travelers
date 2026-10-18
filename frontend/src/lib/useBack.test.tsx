import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useBack, useReplace } from './useBack';

function Page({ name }: { name: string }) {
  const back = useBack('/home');
  const replace = useReplace();
  const location = useLocation();
  return (
    <>
      <p data-testid="page">{`${name} ${location.pathname}`}</p>
      <button onClick={back}>Назад</button>
      <button onClick={() => replace('/b')}>Заменить</button>
      <button onClick={() => replace('/b', { asFirst: true })}>Заменить как первый</button>
    </>
  );
}

function renderAt(entries: string[]) {
  const router = createMemoryRouter(
    [
      { path: '/home', element: <Page name="home" /> },
      { path: '/a', element: <Page name="a" /> },
      { path: '/b', element: <Page name="b" /> },
    ],
    { initialEntries: entries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('useBack', () => {
  it('есть история — на предыдущий экран', async () => {
    renderAt(['/b', '/a']);
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('page')).toHaveTextContent('b /b');
  });

  it('первый экран — на fallback с заменой', async () => {
    const router = renderAt(['/a']);
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('page')).toHaveTextContent('home /home');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('первый экран после replace — всё ещё первый', async () => {
    renderAt(['/a']);
    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));
    expect(screen.getByTestId('page')).toHaveTextContent('b /b');
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('page')).toHaveTextContent('home /home');
  });

  it('replace не первого экрана — назад по истории', async () => {
    renderAt(['/home', '/a']);
    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('page')).toHaveTextContent('home /home');
  });

  it('replace с asFirst — «Назад» на fallback, а не по истории', async () => {
    renderAt(['/a', '/b', '/a']);
    await userEvent.click(screen.getByRole('button', { name: 'Заменить как первый' }));
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('page')).toHaveTextContent('home /home');
  });
});
