/** Render's internal request URL can differ from the browser-facing HTTPS origin.
 * Trust the explicit public application origin, never arbitrary forwarded headers.
 * Header-authenticated non-browser clients may omit Origin; authentication remains mandatory.
 */
export function validAdminMutationOrigin(origin: string | null, requestOrigin: string): boolean {
  if (!origin) return true;
  if (origin === 'https://marketscannerpros.app') return true;
  return origin === requestOrigin;
}
