import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionFromCookie } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get customer ID from session (cid is the Stripe customer ID for paid users)
    const customerId = session.cid;
    
    if (!customerId || customerId.startsWith("trial_")) {
      return NextResponse.json({ 
        error: "No active subscription found. Trial users don't have billing to manage." 
      }, { status: 400 });
    }

    // Create a Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://marketscannerpros.app/dashboard",
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create portal session" },
      { status: 500 }
    );
  }
}
