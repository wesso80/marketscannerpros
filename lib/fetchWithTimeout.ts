/**
 * Fetch wrapper with AbortController timeout and structured error reporting.
 * Use instead of raw `fetch()` for all outbound API calls.
 *
 * Usage:
 *   const data = await fetchWithTimeout('https://api.example.com/data', { timeoutMs: 8000 });
 */

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Fetch to ${new URL(url).hostname} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

export class FetchHttpError extends Error {
  status: number;
  statusText: string;
  body: string;

  constructor(url: string, status: number, statusText: string, body: string) {
    super(`HTTP ${status} from ${new URL(url).hostname}: ${statusText}`);
    this.name = 'FetchHttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds. Default: 10 000 (10s) */
  timeoutMs?: number;
  /** If true, don't throw on non-2xx — just return the Response. Default: false */
  allowNon2xx?: boolean;
  /** Label for logging / error messages. Default: URL hostname */
  tag?: string;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 10_000, allowNon2xx = false, tag, ...init } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    if (!allowNon2xx && !response.ok) {
      const body = await response.text().catch(() => '');
      throw new FetchHttpError(url, response.status, response.statusText, body);
    }

    return response;
  } catch (err: unknown) {
    if (err instanceof FetchHttpError) throw err;

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    // Node 18+ uses a different abort class
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience: fetch JSON with timeout.
 * Returns parsed JSON body of type T.
 */
export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  return response.json() as Promise<T>;
}
