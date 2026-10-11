const RU_PHONE_RE = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/;

/** `+79122042912` → `+7 912 204 29 12`; остальные номера возвращаем как есть. */
export function formatPhone(phone: string): string {
  const m = RU_PHONE_RE.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export function formatName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}
