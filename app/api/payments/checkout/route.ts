import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { workspaceId } = await req.json();
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspace ID' }, { status: 400 });
    }

    const checkoutUrl = await createCheckoutSession(workspaceId);
    
    if (!checkoutUrl) {
      return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (error: any) {
    console.error('[CHECKOUT ERROR]:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}
