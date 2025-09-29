// Simple API endpoint - Stripe portal functionality removed for now
// Can be re-implemented later when authentication is added back

export async function POST() {
  return Response.json(
    { error: "Billing portal not available without authentication" },
    { status: 501 }
  );
}
