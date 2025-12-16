// lib/logger.ts
// Production-ready logging system with environment-based levels

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
}

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

class Logger {
  private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data && { data }),
    };
  }

  debug(message: string, data?: any) {
    if (isDevelopment) {
      const entry = this.formatMessage('debug', message, data);
      console.debug(`[DEBUG] ${entry.timestamp} - ${message}`, data || '');
    }
  }

  info(message: string, data?: any) {
    const entry = this.formatMessage('info', message, data);
    console.info(`[INFO] ${entry.timestamp} - ${message}`, data || '');
  }

  warn(message: string, data?: any) {
    const entry = this.formatMessage('warn', message, data);
    console.warn(`[WARN] ${entry.timestamp} - ${message}`, data || '');
    
    // In production, could send to monitoring service
    if (isProduction && typeof window === 'undefined') {
      // Server-side only - could integrate with Sentry, DataDog, etc.
    }
  }

  error(message: string, error?: Error | any, data?: any) {
    const entry = this.formatMessage('error', message, { error, ...data });
    console.error(`[ERROR] ${entry.timestamp} - ${message}`, error, data || '');
    
    // In production, send errors to monitoring service
    if (isProduction && typeof window === 'undefined') {
      // Could integrate with Sentry here
      // sentry.captureException(error, { extra: data });
    }
  }

  // Special method for API requests
  apiRequest(method: string, path: string, data?: any) {
    if (isDevelopment) {
      this.debug(`API ${method} ${path}`, data);
    }
  }

  // Special method for API responses
  apiResponse(method: string, path: string, status: number, duration?: number) {
    const message = `API ${method} ${path} - ${status}`;
    if (status >= 500) {
      this.error(message, undefined, { duration });
    } else if (status >= 400) {
      this.warn(message, { duration });
    } else if (isDevelopment) {
      this.info(message, { duration });
    }
  }
}

export const logger = new Logger();

// Convenience exports for different log levels
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
