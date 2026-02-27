/**
 * In-Memory Rate Limiter
 * 
 * Works well on Render (persistent server) - state persists between requests.
 * Auto-cleans expired entries to prevent memory leaks.
 * 
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 5 });
 * const result = limiter.check(ip);
 * if (!result.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number; // seconds until reset
}

// Global stores for different limiters (persists on Render)
const stores = new Map<string, Map<string, RateLimitEntry>>();

// Cleanup old entries every 5 minutes
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  
  setInterval(() => {
    const now = Date.now();
    for (const store of stores.values()) {
      for (const [key, entry] of store.entries()) {
        if (entry.resetTime < now) {
          store.delete(key);
        }
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

export function createRateLimiter(name: string, options: RateLimitOptions) {
  // Get or create store for this limiter
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;
  
  // Schedule cleanup
  scheduleCleanup();

  return {
    /**
     * Check if request is allowed
     * @param key - Unique identifier (IP, userId, workspaceId, etc.)
     */
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      // No entry or expired - allow and start fresh
      if (!entry || entry.resetTime < now) {
        store.set(key, {
          count: 1,
          resetTime: now + options.windowMs,
        });
        return {
          allowed: true,
          remaining: options.max - 1,
          resetTime: now + options.windowMs,
        };
      }

      // Increment count
      entry.count++;

      // Over limit
      if (entry.count > options.max) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.resetTime,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        };
      }

      // Under limit
      return {
        allowed: true,
        remaining: options.max - entry.count,
        resetTime: entry.resetTime,
      };
    },

    /**
     * Reset limit for a key (e.g., after successful login)
     */
    reset(key: string): void {
      store.delete(key);
    },

    /**
     * Get current stats for monitoring
     */
    getStats(): { totalKeys: number; name: string } {
      return {
        name,
        totalKeys: store.size,
      };
    },
  };
}

// ============= Pre-configured Limiters =============

/** Login attempts: 5 per minute per IP */
export const loginLimiter = createRateLimiter("login", {
  windowMs: 60 * 1000,  // 1 minute
  max: 5,
});

/** API calls: 60 per minute per IP (general) */
export const apiLimiter = createRateLimiter("api", {
  windowMs: 60 * 1000,  // 1 minute
  max: 60,
});

/** Scanner: 20 per minute per IP */
export const scannerLimiter = createRateLimiter("scanner", {
  windowMs: 60 * 1000,  // 1 minute
  max: 20,
});

/** AI Analyst: Separate from daily DB limits, prevents spam */
export const aiLimiter = createRateLimiter("ai", {
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 requests per minute max (even for pro_trader)
});

/** Deep analysis: 5 per minute per IP (expensive - multiple AV calls) */
export const deepAnalysisLimiter = createRateLimiter("deep-analysis", {
  windowMs: 60 * 1000,  // 1 minute
  max: 5,
});

// ============= Helper =============

/**
 * Get client IP from Next.js request
 */
export function getClientIP(req: Request): string {
  // Render sets these headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback
  return "unknown";
}
