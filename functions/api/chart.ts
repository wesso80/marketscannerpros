export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ candles: [] }), {
    headers: { "content-type": "application/json" },
  });
};
