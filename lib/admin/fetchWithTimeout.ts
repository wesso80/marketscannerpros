/**
 * Tiny wrapper around fetch with an AbortController timeout.
 * Default 25s — long enough for slow Alpha Vantage / OpenAI replies,
 * short enough to never let the route hang forever.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 25000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
