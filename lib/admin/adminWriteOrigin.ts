import { validAdminMutationOrigin } from './mutationOrigin';

/** Only admin write requests: public routes, jobs and read requests retain their existing policy. */
export function validAdminWriteOrigin(request: Request, source: 'cookie' | 'header'): boolean {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/') || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get('origin');
  // Browsers using ambient session cookies must supply an explicit trusted origin.
  // Header clients reach this branch only after their secret has been verified.
  if (!origin) return source === 'header';
  return validAdminMutationOrigin(origin, url.origin);
}
