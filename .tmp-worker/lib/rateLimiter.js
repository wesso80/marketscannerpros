"use strict";
/**
 * Token Bucket Rate Limiter for API calls
 * Used by workers to stay under provider rate limits (e.g., 300 RPM for Nasdaq, 75 RPM for Alpha Vantage)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiters = exports.TokenBucket = void 0;
exports.sleep = sleep;
exports.retryWithBackoff = retryWithBackoff;
class TokenBucket {
    constructor(capacity, // Max tokens (burst capacity)
    refillPerSecond // Tokens added per second
    ) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        if (elapsed <= 0)
            return;
        const add = elapsed * this.refillPerSecond;
        this.tokens = Math.min(this.capacity, this.tokens + add);
        this.lastRefill = now;
    }
    /**
     * Take n tokens, waiting if necessary
     * @param n Number of tokens to take (default: 1)
     */
    async take(n = 1) {
        while (true) {
            this.refill();
            if (this.tokens >= n) {
                this.tokens -= n;
                return;
            }
            // Wait a bit and try again
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    /**
     * Try to take tokens without waiting
     * @returns true if tokens were available, false otherwise
     */
    tryTake(n = 1) {
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
    available() {
        this.refill();
        return Math.floor(this.tokens);
    }
}
exports.TokenBucket = TokenBucket;
// Pre-configured rate limiters for different providers
exports.rateLimiters = {
    /**
     * Alpha Vantage: Standard plan = 75 calls/minute
     * Premium plans vary, adjust capacity accordingly
     */
    alphaVantage: new TokenBucket(70, 70 / 60), // 70 RPM with small buffer
    /**
     * Nasdaq BX Options: 300 RPM
     */
    nasdaq: new TokenBucket(280, 280 / 60), // 280 RPM with buffer
    /**
     * CoinGecko: Free = 10-30 calls/minute, Pro = higher
     */
    coinGecko: new TokenBucket(25, 25 / 60), // Conservative free tier
};
/**
 * Simple sleep helper
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
    const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000, shouldRetry = () => true, } = options;
    let lastError;
    let delay = initialDelayMs;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt === maxRetries || !shouldRetry(err)) {
                throw err;
            }
            console.warn(`[retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err?.message || err);
            await sleep(delay);
            delay = Math.min(delay * 2, maxDelayMs);
        }
    }
    throw lastError;
}
