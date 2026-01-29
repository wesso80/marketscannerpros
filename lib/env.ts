/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at startup.
 * Throws descriptive errors for missing or invalid configuration.
 * 
 * Usage:
 *   import { validateEnv } from '@/lib/env';
 *   validateEnv(); // Call at app startup
 */

import { z } from 'zod';
import { logger } from './logger';

const envSchema = z.object({
  // Authentication & Security (optional in dev, required in prod)
  APP_SIGNING_SECRET: z.string().min(32, 'APP_SIGNING_SECRET must be at least 32 characters for security').optional(),
  
  // Stripe Payment Processing (optional in dev, required in prod)
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', 'STRIPE_SECRET_KEY must start with sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_', 'STRIPE_PUBLISHABLE_KEY must start with pk_').optional(),
  
  // Database (optional in dev, required in prod)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string').optional(),
  POSTGRES_URL: z.string().url('POSTGRES_URL must be a valid PostgreSQL connection string').optional(),
  
  // OpenAI API (optional in dev, required in prod)
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-').optional(),
  
  // Alpha Vantage API (optional)
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  
  // CoinGecko API (commercial plan - 500K calls/month)
  COINGECKO_API_KEY: z.string().startsWith('CG-', 'COINGECKO_API_KEY must start with CG-').optional(),
  
  // Email Service (optional)
  RESEND_API_KEY: z.string().optional(),
  
  // RevenueCat (optional)
  REVENUECAT_API_KEY: z.string().optional(),
  
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Redis Rate Limiting (optional but recommended for production)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

type EnvSchema = z.infer<typeof envSchema>;

/**
 * Validates environment variables at runtime
 * 
 * @throws {Error} If required environment variables are missing or invalid
 * @returns {EnvSchema} Validated environment variables
 */
export function validateEnv(options?: { allowMissing?: boolean }): EnvSchema {
  try {
    const env = envSchema.parse(process.env);
    const isProd = env.NODE_ENV === 'production';
    const missing: string[] = [];

    // Allow opt-out for local builds/tests
    if (process.env.SKIP_ENV_VALIDATION === 'true') {
      logger.warn('Skipping environment validation due to SKIP_ENV_VALIDATION flag');
      return env;
    }
    
    // Required in production
    if (!env.APP_SIGNING_SECRET) missing.push('APP_SIGNING_SECRET');
    if (!env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
    if (!env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    if (!env.DATABASE_URL && !env.POSTGRES_URL) missing.push('DATABASE_URL or POSTGRES_URL');
    
    if (isProd && missing.length && !options?.allowMissing) {
      throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
    
    // Warn only in non-prod or when allowMissing is true
    if ((!isProd || options?.allowMissing) && missing.length) {
      logger.warn('Missing environment variables (dev/non-prod only)', { missing });
    }
    
    // Warn about missing optional but recommended variables
    if (isProd) {
      if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
        logger.warn('Rate limiting is disabled: UPSTASH_REDIS variables not set (recommended for production)');
      }
      
      if (!env.ALPHA_VANTAGE_API_KEY) {
        logger.warn('Alpha Vantage API key not set: Some features may be limited');
      }
      
      if (!env.STRIPE_WEBHOOK_SECRET) {
        logger.warn('STRIPE_WEBHOOK_SECRET not set: Webhook signature verification disabled');
      }
    }
    
    logger.info('Environment variables validated successfully', {
      nodeEnv: env.NODE_ENV,
      hasDatabase: !!(env.DATABASE_URL || env.POSTGRES_URL),
      hasRedis: !!(env.UPSTASH_REDIS_REST_URL),
      hasAlphaVantage: !!env.ALPHA_VANTAGE_API_KEY,
    });
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      if (options?.allowMissing) {
        logger.warn('Environment validation skipped due to missing vars (allowMissing=true)', {
          missing: error.issues.map((issue: z.ZodIssue) => issue.path.join('.'))
        });
        // Return a partial env cast; consumers should handle missing values
        return process.env as EnvSchema;
      }
      const issues = error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ENVIRONMENT CONFIGURATION ERROR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following environment variables are missing or invalid:

${issues}

Required environment variables:
  • APP_SIGNING_SECRET - JWT signing key (32+ characters)
  • STRIPE_SECRET_KEY - Stripe API key (starts with sk_)
  • OPENAI_API_KEY - OpenAI API key (starts with sk-)
  • DATABASE_URL or POSTGRES_URL - PostgreSQL connection string

Please check your .env.local file or deployment environment variables.

For local development, copy .env.example to .env.local and fill in the values.
For production, ensure all environment variables are set in your hosting platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
      
      logger.error('Environment validation failed', { issues: error.issues });
      throw new Error(errorMessage);
    }
    
    throw error;
  }
}

/**
 * Get a validated environment variable
 * 
 * @param key - Environment variable name
 * @returns The validated environment variable value
 * @throws {Error} If the variable is not set or invalid
 */
export function getEnv<K extends keyof EnvSchema>(key: K): NonNullable<EnvSchema[K]> {
  const value = process.env[key];
  
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  
  return value as NonNullable<EnvSchema[K]>;
}

/**
 * Check if running in production
 */
export const isProd = () => process.env.NODE_ENV === 'production';

/**
 * Check if running in development
 */
export const isDev = () => process.env.NODE_ENV === 'development';

/**
 * Check if running in test
 */
export const isTest = () => process.env.NODE_ENV === 'test';
