import { describe, expect, it } from 'vitest';
import { eventStatusLabel } from './status';

describe('eventStatusLabel', () => {
  it('участник — по статусу заявки', () => {
    expect(eventStatusLabel({ is_participant: true, my_application_status: 'searching' })).toBe(
      'Ищем попутчиков',
    );
    expect(eventStatusLabel({ is_participant: true, my_application_status: 'assigned' })).toBe(
      'Попутчики найдены',
    );
    expect(eventStatusLabel({ is_participant: true, my_application_status: 'solo' })).toBe(
      'Еду самостоятельно',
    );
    expect(eventStatusLabel({ is_participant: true, my_application_status: 'cancelled' })).toBe(
      'Участие отменено',
    );
  });

  it('участник без заявки — «Заявка не заполнена»', () => {
    expect(eventStatusLabel({ is_participant: true, my_application_status: null })).toBe(
      'Заявка не заполнена',
    );
  });

  it('не участник (только админ) — «Вы организатор»', () => {
    expect(eventStatusLabel({ is_participant: false, my_application_status: null })).toBe(
      'Вы организатор',
    );
  });
});
