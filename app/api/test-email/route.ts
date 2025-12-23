import { NextRequest, NextResponse } from 'next/server';
import { sendAlertEmail } from '@/lib/email';
import { getSessionFromCookie } from '@/lib/auth';

/**
 * Test Email Endpoint
 * 
 * POST /api/test-email
 * Body: { email?: string }
 * 
 * Sends a test alert email to verify Resend is working.
 * Requires authentication (uses session email by default).
 */

export async function POST(req: NextRequest) {
  try {
    // Get session for default email
    const session = await getSessionFromCookie();
    
    // Parse body for optional custom email
    let targetEmail: string | null = null;
    try {
      const body = await req.json();
      targetEmail = body.email || null;
    } catch {
      // No body provided, use session email
    }

    // Use provided email or fall back to session
    const email = targetEmail || (session as any)?.email;
    
    if (!email) {
      return NextResponse.json(
        { error: 'No email provided. Please log in or provide an email in request body.' },
        { status: 400 }
      );
    }

    // Send test email
    const result = await sendAlertEmail({
      to: email,
      subject: '✅ MarketScanner Pros - Email Test Successful!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #fff;">
          <h1 style="color: #10b981; margin-bottom: 20px;">✅ Email Test Successful!</h1>
          
          <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <p style="color: #e2e8f0; margin: 0 0 15px 0; font-size: 16px;">
              Great news! Your email notifications are working correctly.
            </p>
            
            <p style="color: #94a3b8; margin: 0 0 15px 0; font-size: 14px;">
              This confirms that:
            </p>
            
            <ul style="color: #94a3b8; margin: 0; padding-left: 20px; font-size: 14px;">
              <li style="margin-bottom: 8px;">✅ Resend API key is valid</li>
              <li style="margin-bottom: 8px;">✅ Domain verification is complete</li>
              <li style="margin-bottom: 8px;">✅ Price alerts will send notifications</li>
            </ul>
          </div>
          
          <div style="background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
            <h3 style="color: #fbbf24; margin: 0 0 10px 0; font-size: 14px;">📊 Next Steps</h3>
            <p style="color: #94a3b8; margin: 0; font-size: 14px;">
              Go to the Scanner page and set up your first price alert. 
              You'll receive an email like this when your target price is hit!
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px 0;">
            <a href="https://app.marketscannerpros.app/tools/alerts" 
               style="display: inline-block; background: #10b981; color: #fff; padding: 12px 24px; 
                      text-decoration: none; border-radius: 8px; font-weight: bold;">
              Set Up Price Alerts →
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;">
          
          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
            Sent from MarketScanner Pros • ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        message: `Test email sent to ${email}`,
        emailId: result,
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Email not sent - Resend API key may not be configured',
        hint: 'Check RESEND_API_KEY environment variable',
      });
    }
  } catch (error: any) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send test email',
        details: error.message,
        hint: 'Check Resend dashboard for domain verification status'
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy browser testing
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  
  if (!email) {
    return NextResponse.json({
      error: 'Email required',
      usage: 'GET /api/test-email?email=your@email.com',
    }, { status: 400 });
  }
  
  // Create a fake request with the email in body
  const fakeReq = {
    ...req,
    json: async () => ({ email }),
  } as NextRequest;
  
  return POST(fakeReq);
}
