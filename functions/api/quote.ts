export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
  if (!symbol) return new Response(JSON.stringify({ error: "symbol required" }), { status: 400 });
  // TODO: replace with real data source
  return new Response(JSON.stringify({ symbol, price: 123.45 }), {
    headers: { "content-type": "application/json" },
  });
};
