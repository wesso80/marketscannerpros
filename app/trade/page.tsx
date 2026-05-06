import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/adminAuth';
import ChartView from './ChartView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MSP Trade', robots: { index: false, follow: false } };

export default async function TradePage() {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  const fakeReq = new Request('http://internal/trade', { headers: { cookie } });
  const auth = await requireAdmin(fakeReq);
  if (!auth.ok) redirect('/admin/login?next=/trade');

  return <ChartView initialSymbol="ES.c.0" initialResolution="5" />;
}
