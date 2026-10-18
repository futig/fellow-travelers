import { useRef, type KeyboardEvent } from 'react';
import styles from './Tabs.module.css';

export interface Tab<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label': string;
  /** id панели для `aria-controls` по id вкладки. */
  panelId?: (id: T) => string;
}

/** Вкладки в ряд; активная — тёмная. Стрелки, Home и End переключают вкладку. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  panelId,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((t) => t.id === value);
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    const tab = tabs[next];
    if (!tab) return;
    e.preventDefault();
    onChange(tab.id);
    refs.current[next]?.focus();
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId?.(tab.id)}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.active : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
