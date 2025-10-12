import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { setSubscription, upsertCustomer } from '@/lib/db';
import { sign } from '@/lib/signer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    console.log('[CONFIRM] Session ID:', sessionId);

    if (!sessionId) {
      console.error('[CONFIRM] Missing session_id');
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Retrieve the checkout session from Stripe
    console.log('[CONFIRM] Retrieving session from Stripe...');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('[CONFIRM] Session retrieved:', { 
      payment_status: session.payment_status, 
      customer: session.customer,
      subscription: session.subscription 
    });

    if (!session || session.payment_status !== 'paid') {
      console.error('[CONFIRM] Payment not completed');
      return NextResponse.json({ error: 'Payment not completed', payment_status: session.payment_status }, { status: 400 });
    }

    const workspaceId = session.metadata?.workspace_id;
    const plan = session.metadata?.plan_code || 'pro';

    if (!workspaceId) {
      return NextResponse.json({ error: 'Invalid session metadata' }, { status: 400 });
    }

    // Get subscription info
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;
    
    if (subscriptionId) {
      // Update customer record
      await upsertCustomer(workspaceId, customerId);
      
      // Get subscription details from Stripe
      const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update database with subscription
      const periodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000) 
        : undefined;
        
      await setSubscription(
        workspaceId,
        plan === 'pro_trader' ? 'pro_trader' : 'pro',
        subscription.status,
        periodEnd,
        subscriptionId
      );
    }

    // Sign the workspace ID and set cookie
    const signature = sign(workspaceId);
    const cookieValue = `${workspaceId}:${signature}`;

    const response = NextResponse.json({ 
      success: true, 
      workspaceId,
      tier: plan === 'pro_trader' ? 'pro_trader' : 'pro'
    });

    // Set the workspace cookie
    response.cookies.set('workspace_id', cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Confirm error:', error);
    return NextResponse.json(
      { error: error.message || 'Confirmation failed' },
      { status: 500 }
    );
  }
}
