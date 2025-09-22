export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ alerts: [] }), {
    headers: { "content-type": "application/json" },
  });
};
