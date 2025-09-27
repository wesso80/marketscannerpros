import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Require authentication - check session and get email from token
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Get email from JWT token (not removed from server-side token)
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return Response.json(
      { error: "User email not available" },
      { status: 400 }
    );
  }

  const key = process.env.STRIPE_SECRET_KEY;
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!key) {
    return Response.json(
      { error: "Stripe not configured (missing STRIPE_SECRET_KEY)" },
      { status: 500 }
    );
  }

  try {
    const stripe = new Stripe(key);
    
    // Find or create customer based on authenticated user's email from token
    const customers = await stripe.customers.list({
      email: token.email,
      limit: 1
    });
    
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create new customer for this user
      const customer = await stripe.customers.create({
        email: token.email,
        name: token.name || undefined,
      });
      customerId = customer.id;
    }

    // Create billing portal session for the authenticated user's customer
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return Response.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return Response.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
