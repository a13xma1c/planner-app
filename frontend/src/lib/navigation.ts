/** Where to send someone after they sign in (defaults to the app root). */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
