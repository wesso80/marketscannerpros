// lib/logger.ts
// Production-ready structured logging with tracing and error tracking

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  traceId?: string;
  service?: string;
  data?: any;
  error?: { name: string; message: string; stack?: string };
  duration_ms?: number;
}

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const SERVICE_NAME = 'msp-api';

// ─── Error tracking buffer for aggregation ───

interface ErrorBucket {
  key: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  sample: string;
}

const errorBuckets = new Map<string, ErrorBucket>();
const ERROR_DEDUP_WINDOW_MS = 60_000; // 1 min dedup window

function trackError(key: string, message: string) {
  const existing = errorBuckets.get(key);
  const now = Date.now();

  if (existing && now - existing.lastSeen < ERROR_DEDUP_WINDOW_MS) {
    existing.count++;
    existing.lastSeen = now;
    return false; // Duplicate within window — suppress
  }

  errorBuckets.set(key, {
    key,
    count: 1,
    firstSeen: now,
    lastSeen: now,
    sample: message,
  });

  // Prune old buckets every 100 entries
  if (errorBuckets.size > 200) {
    for (const [k, v] of errorBuckets) {
      if (now - v.lastSeen > ERROR_DEDUP_WINDOW_MS * 5) {
        errorBuckets.delete(k);
      }
    }
  }

  return true; // New error — log it
}

class Logger {
  private traceId?: string;

  /** Create a child logger scoped to a request trace */
  withTrace(traceId: string): Logger {
    const child = new Logger();
    child.traceId = traceId;
    return child;
  }

  private formatEntry(level: LogLevel, message: string, data?: any, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
    };

    if (this.traceId) entry.traceId = this.traceId;
    if (data) entry.data = data;
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: isDevelopment ? error.stack : undefined,
      };
    }

    return entry;
  }

  private emit(entry: LogEntry) {
    if (isProduction) {
      // Structured JSON logs in production (for log aggregators)
      const output = JSON.stringify(entry);
      switch (entry.level) {
        case 'error': console.error(output); break;
        case 'warn': console.warn(output); break;
        case 'info': console.info(output); break;
        case 'debug': console.debug(output); break;
      }
    } else {
      // Human-readable in development
      const prefix = `[${entry.level.toUpperCase()}] ${entry.timestamp}`;
      const trace = entry.traceId ? ` [${entry.traceId}]` : '';
      const msg = `${prefix}${trace} - ${entry.message}`;

      switch (entry.level) {
        case 'error': console.error(msg, entry.error || '', entry.data || ''); break;
        case 'warn': console.warn(msg, entry.data || ''); break;
        case 'info': console.info(msg, entry.data || ''); break;
        case 'debug': console.debug(msg, entry.data || ''); break;
      }
    }
  }

  debug(message: string, data?: any) {
    if (isDevelopment) {
      this.emit(this.formatEntry('debug', message, data));
    }
  }

  info(message: string, data?: any) {
    this.emit(this.formatEntry('info', message, data));
  }

  warn(message: string, data?: any) {
    this.emit(this.formatEntry('warn', message, data));
  }

  error(message: string, error?: Error | any, data?: any) {
    const err = error instanceof Error ? error : undefined;
    const errKey = `${message}:${err?.name || 'unknown'}`;

    // Dedup in production to avoid log flood
    if (isProduction && !trackError(errKey, message)) {
      return; // Duplicate within window — suppressed
    }

    this.emit(this.formatEntry('error', message, data, err));
  }

  /** Log an API request/response with duration */
  apiRequest(method: string, path: string, data?: any) {
    if (isDevelopment) {
      this.debug(`API ${method} ${path}`, data);
    }
  }

  apiResponse(method: string, path: string, status: number, duration?: number) {
    const message = `API ${method} ${path} → ${status}`;
    const meta = { duration_ms: duration, path, method, status };

    if (status >= 500) {
      this.error(message, undefined, meta);
    } else if (status >= 400) {
      this.warn(message, meta);
    } else if (isDevelopment || (duration && duration > 5000)) {
      // Log slow requests (>5s) even in production
      this.info(message, meta);
    }
  }

  /** Get error frequency snapshot for monitoring */
  getErrorSnapshot(): { errors: ErrorBucket[]; totalBuckets: number } {
    const now = Date.now();
    const active: ErrorBucket[] = [];
    for (const bucket of errorBuckets.values()) {
      if (now - bucket.lastSeen < ERROR_DEDUP_WINDOW_MS * 5) {
        active.push({ ...bucket });
      }
    }
    return { errors: active.sort((a, b) => b.count - a.count), totalBuckets: active.length };
  }
}

export const logger = new Logger();

/** Generate a short trace ID for request correlation */
export function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

// Convenience exports for different log levels
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
