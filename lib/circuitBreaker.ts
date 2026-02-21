/**
 * Circuit Breaker — prevents cascading failures when external APIs go down.
 *
 * States:
 *   CLOSED   → Healthy. Requests pass through. Failures counted.
 *   OPEN     → Tripped. Requests are immediately rejected for `resetTimeoutMs`.
 *   HALF_OPEN → After timeout, a single probe request is allowed through.
 *              If it succeeds → CLOSED.  If it fails → back to OPEN.
 *
 * Usage:
 *   const avBreaker = new CircuitBreaker('alpha-vantage', { failureThreshold: 5 });
 *   const data = await avBreaker.call(() => fetch('https://...'));
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms the circuit stays OPEN before moving to HALF_OPEN. Default: 60 000 (1 min) */
  resetTimeoutMs?: number;
  /** Optional callback when state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;
  public readonly retryAfterMs: number;

  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker '${name}' is OPEN — requests blocked for ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.onStateChange = options.onStateChange;
  }

  /** Execute a function through the circuit breaker. */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transition('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError(this.name, this.resetTimeoutMs - elapsed);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
      this.transition('CLOSED');
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Probe failed — reopen
      this.transition('OPEN');
    } else if (this.failureCount >= this.failureThreshold) {
      this.transition('OPEN');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    if (to === 'CLOSED') this.failureCount = 0;
    console.warn(`[circuit-breaker] ${this.name}: ${from} → ${to}`);
    this.onStateChange?.(this.name, from, to);
  }

  /** Get current circuit health snapshot. */
  getSnapshot() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
    };
  }
}

// ─── Pre-configured circuit breakers for external services ───

export const avCircuit = new CircuitBreaker('alpha-vantage', {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,   // 1 min cooldown
});

export const coinGeckoCircuit = new CircuitBreaker('coingecko', {
  failureThreshold: 5,
  resetTimeoutMs: 45_000,   // 45s cooldown
});

export const openAICircuit = new CircuitBreaker('openai', {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,   // 30s cooldown
});

/**
 * Wrap a fetch call with the appropriate circuit breaker.
 *
 * @example
 * const data = await withCircuit(avCircuit, () => fetchAlphaJson(url, tag));
 */
export async function withCircuit<T>(breaker: CircuitBreaker, fn: () => Promise<T>): Promise<T> {
  return breaker.call(fn);
}
