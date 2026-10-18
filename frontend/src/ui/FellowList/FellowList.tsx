import type { MouseEvent, ReactNode } from 'react';
import type { components } from '../../api/schema';
import { formatName, formatPhone } from '../../lib/format';
import { openExternal, telegramUserUrl, telUrl } from '../../lib/links';
import { Avatar } from '../Avatar/Avatar';
import styles from './FellowList.module.css';

type Contact = components['schemas']['Contact'];

export interface Fellow {
  /** Ключ строки (application_id или user_id). */
  id: string;
  contact: Contact;
  /** 2 — едет со спутником, рядом с именем «+1». */
  passengers?: 1 | 2;
  /** Подпись под именем («Это вы», «SU 1108 • 12:40», «На месте»). */
  caption?: ReactNode;
  /** `success` — зелёная подпись («На месте»). */
  captionTone?: 'soft' | 'success';
  /** Показывать ли контакты (для себя — не нужно). */
  showContacts?: boolean;
}

interface Props {
  items: Fellow[];
  'aria-label'?: string;
}

function openTelegram(e: MouseEvent<HTMLAnchorElement>) {
  // Внутри Telegram ссылку t.me открываем через SDK; вне его сработает обычный переход.
  if (openExternal(e.currentTarget.href)) e.preventDefault();
}

function contactsLine(contact: Contact): string {
  const parts: string[] = [];
  if (contact.phone) parts.push(formatPhone(contact.phone));
  if (contact.username) parts.push(`@${contact.username}`);
  return parts.join(' · ');
}

/** Список людей с аватаром, подписью, контактами текстом и кнопками 💬 / 📞. */
export function FellowList({ items, 'aria-label': ariaLabel }: Props) {
  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {items.map(
        ({ id, contact, passengers, caption, captionTone = 'soft', showContacts = true }) => {
          const name = formatName(contact.first_name, contact.last_name);
          const tgUrl = showContacts ? telegramUserUrl(contact.username) : null;
          const phoneUrl = showContacts ? telUrl(contact.phone) : null;
          const contacts = showContacts ? contactsLine(contact) : '';
          return (
            <li key={id} className={styles.row}>
              <Avatar src={contact.photo_url} size={32} />
              <div className={styles.body}>
                <div className={styles.text}>
                  <p className={styles.name}>
                    {name}
                    {passengers === 2 && (
                      <span className={styles.plus} aria-label="со спутником">
                        {' '}
                        +1
                      </span>
                    )}
                  </p>
                  {caption && (
                    <p
                      className={`${styles.caption} ${captionTone === 'success' ? styles.success : ''}`}
                    >
                      {caption}
                    </p>
                  )}
                  {contacts && <p className={styles.caption}>{contacts}</p>}
                </div>
                {(tgUrl || phoneUrl) && (
                  <div className={styles.actions}>
                    {tgUrl && (
                      <a
                        className={styles.action}
                        href={tgUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Написать в Telegram: ${name}`}
                        onClick={openTelegram}
                      >
                        💬
                      </a>
                    )}
                    {phoneUrl && (
                      <a
                        className={styles.action}
                        href={phoneUrl}
                        aria-label={`Позвонить: ${name}`}
                      >
                        📞
                      </a>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        },
      )}
    </ul>
  );
}
