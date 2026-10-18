import { useId, type ChangeEvent } from 'react';
import { getSelectedDevUser, selectDevUser, type DevUser } from '../../lib/devUsers';
import styles from './DevUserSwitcher.module.css';

interface Props {
  users: DevUser[];
  /** Перезапуск приложения после смены пользователя (в тестах — мок). */
  reload?: () => void;
}

/** Только dev: выбор тестового пользователя. Показывает label, initData — никогда. */
export function DevUserSwitcher({ users, reload = () => window.location.reload() }: Props) {
  const id = useId();
  const selected = getSelectedDevUser(users);
  if (!selected) return null;

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    selectDevUser(e.target.value);
    // SDK и кэш запросов проще перезапустить целиком.
    reload();
  }

  return (
    <div className={styles.switcher}>
      <label htmlFor={id} className={styles.label}>
        Dev: пользователь
      </label>
      <select id={id} className={styles.select} value={selected.label} onChange={handleChange}>
        {users.map((u) => (
          <option key={u.label} value={u.label}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}
