import { useNavigate } from 'react-router';
import { ErrorScreen } from './ErrorScreen';

/**
 * Корневой `errorElement`: исключение при рендере экрана не роняет приложение до экрана роутера
 * по умолчанию. Подробности ошибки не показываем — React и так пишет их в консоль.
 */
export function RouteError() {
  const navigate = useNavigate();
  return (
    <ErrorScreen
      title="Что-то пошло не так"
      text="Вернитесь к списку групп и попробуйте ещё раз."
      action={{ label: 'Мои группы', onClick: () => void navigate('/', { replace: true }) }}
    />
  );
}
