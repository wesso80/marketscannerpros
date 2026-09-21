/** Bound provider waits without retries or background polling. */
export async function boundedJsonFetch<T>(url: string, options: RequestInit = {}, timeoutMs = 30_000): Promise<{ response: Response; body: T }> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(error => {
      // Preserve status handling for HTML error pages, but never swallow an abort
      // or malformed successful payload.
      if (response.ok || controller.signal.aborted) throw error;
      return {};
    }) as T;
    return { response, body };
  } catch (error) {
    if (timedOut) throw new Error(`Data request timed out after ${timeoutMs / 1000} seconds. Data is unavailable; retry manually.`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
