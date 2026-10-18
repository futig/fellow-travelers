/** Код приглашения: 6 латинских букв и цифр в верхнем регистре (контракт — без учёта регистра). */
export const INVITE_CODE_RE = /^[A-Z0-9]{6}$/;

export function isInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code);
}
