import { describe, expect, it } from 'vitest';
import { formatName, formatPhone } from './format';

describe('formatPhone', () => {
  it('российский номер', () => {
    expect(formatPhone('+79122042912')).toBe('+7 912 204 29 12');
  });

  it('прочие номера как есть', () => {
    expect(formatPhone('+375291234567')).toBe('+375291234567');
    expect(formatPhone('+7912')).toBe('+7912');
  });
});

describe('formatName', () => {
  it('имя и фамилия', () => {
    expect(formatName('Иван', 'Петров')).toBe('Иван Петров');
  });

  it('без фамилии', () => {
    expect(formatName('Иван', null)).toBe('Иван');
  });
});
