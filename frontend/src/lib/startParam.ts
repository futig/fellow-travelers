export type StartParam =
  | { kind: 'join'; code: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'admin'; eventId: string }
  | { kind: 'adminList' }
  | { kind: 'none' };

const NONE: StartParam = { kind: 'none' };
const JOIN_CODE_RE = /^[A-Z0-9]{6}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Разбирает `start_param` мини-приложения (docs/contracts/README.md, §6). */
export function parseStartParam(raw: string | undefined): StartParam {
  if (!raw) return NONE;
  if (raw === 'admin') return { kind: 'adminList' };

  const sep = raw.indexOf('_');
  if (sep === -1) return NONE;
  const prefix = raw.slice(0, sep);
  const value = raw.slice(sep + 1);

  switch (prefix) {
    case 'join':
      return JOIN_CODE_RE.test(value) ? { kind: 'join', code: value.toUpperCase() } : NONE;
    case 'event':
      return UUID_RE.test(value) ? { kind: 'event', eventId: value.toLowerCase() } : NONE;
    case 'admin':
      return UUID_RE.test(value) ? { kind: 'admin', eventId: value.toLowerCase() } : NONE;
    default:
      return NONE;
  }
}
