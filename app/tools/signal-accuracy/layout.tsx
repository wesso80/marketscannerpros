import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';

export const metadata: Metadata = { title: 'Setup accuracy' };
export const dynamic = 'force-dynamic';

export default async function SignalAccuracyLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const token = jar.get('ms_admin')?.value || jar.get('ms_auth')?.value;
  let admin = false;
  if (token) {
    try {
      const payload = verifySessionToken(token);
      const cid = typeof payload.cid === 'string' ? payload.cid : '';
      const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : undefined;
      admin = Boolean(cid && (payload.kind === 'admin' || isOperator(cid, workspaceId)));
    } catch {
      admin = false;
    }
  }
  if (!admin) redirect('/auth?next=/tools/signal-accuracy');
  return children;
}
