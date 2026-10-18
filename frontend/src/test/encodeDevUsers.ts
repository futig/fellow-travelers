/** Как backend (`python -m app.dev.users`): base64url без паддинга от UTF-8 JSON. */
export function encodeDevUsers(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
