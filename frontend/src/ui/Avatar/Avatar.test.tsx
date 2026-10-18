import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('https-фото показывается без referrer', () => {
    const { container } = render(<Avatar src="https://t.me/i/userpic/320/x.jpg" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://t.me/i/userpic/320/x.jpg');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it.each(['http://example.com/x.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA'])(
    '%s → заглушка',
    (src) => {
      const { container } = render(<Avatar src={src} />);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByRole('img', { name: 'Нет фото' })).toBeInTheDocument();
    },
  );
});
