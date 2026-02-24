/**
 * Token Bucket Rate Limiter for API calls
 * Used by workers to stay under provider rate limits (e.g., 300 RPM for Nasdaq, 600 RPM for Alpha Vantage)
 */

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,      // Max tokens (burst capacity)
    private readonly refillPerSecond: number // Tokens added per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;

    const add = elapsed * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + add);
    this.lastRefill = now;
  }

  /**
   * Take n tokens, waiting if necessary (with a max wait timeout)
   * @param n Number of tokens to take (default: 1)
   * @param maxWaitMs Maximum ms to wait before throwing (default: 30000)
   */
  async take(n = 1, maxWaitMs = 30_000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    while (true) {
      this.refill();
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error(`TokenBucket: timed out waiting for ${n} tokens after ${maxWaitMs}ms`);
      }
      // Wait a bit and try again
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Try to take tokens without waiting
   * @returns true if tokens were available, false otherwise
   */
  tryTake(n = 1): boolean {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /**
   * Get current token count
   */
  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Pre-configured rate limiters for different providers
export const rateLimiters = {
  /**
   * Alpha Vantage: 600 RPM commercial license.
   * ALPHA_VANTAGE_RPM env var controls the global governor in lib/avRateGovernor.ts.
   * NOTE: The global rate governor is the PRIMARY choke point for API routes.
   * This limiter is used inside the worker only as a secondary guard.
   */
  alphaVantage: new TokenBucket(8, 500 / 60), // 500 RPM (100 RPM headroom)
  
  /**
   * Nasdaq BX Options: 300 RPM (when enabled)
   */
  nasdaq: new TokenBucket(4, 70 / 60), // Shared with AV quota for now
  
  /**
   * CoinGecko: Commercial plan
   */
  coinGecko: new TokenBucket(25, 25 / 60), // Conservative
};

/**
 * Simple sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: any;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (attempt === maxRetries || !shouldRetry(err)) {
        throw err;
      }

      console.warn(`[retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, (err as Error)?.message || err);
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  throw lastError;
}
