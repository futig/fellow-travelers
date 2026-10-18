import type { ApplicationStatus, EventSummary } from '../api/types';

/** Статус заявки по-русски — для списков, шапок и подписей. */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  searching: 'Ищем попутчиков',
  assigned: 'Попутчики найдены',
  solo: 'Еду самостоятельно',
  cancelled: 'Участие отменено',
};

/** Моё положение в группе одной строкой: статус заявки, «Заявка не заполнена» или «Вы организатор». */
export function eventStatusLabel(
  event: Pick<EventSummary, 'is_participant' | 'my_application_status'>,
): string {
  if (!event.is_participant) return 'Вы организатор';
  return event.my_application_status
    ? APPLICATION_STATUS_LABEL[event.my_application_status]
    : 'Заявка не заполнена';
}
