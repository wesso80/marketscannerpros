import { Pool, PoolClient, QueryResult } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

const queryTransaction = new AsyncLocalStorage<{ client: PoolClient; deadline: number; failed?: unknown }>();

/** Opt-in atomic unit for engines built on q(). A caught SQL error still prevents commit. */
export async function atomicQueries<T>(work: () => Promise<T>, budgetMs = 45_000): Promise<T> {
  if (queryTransaction.getStore()) throw new Error('Nested atomicQueries is not supported');
  return tx(async (client) => {
    const state = { client, deadline: Date.now() + budgetMs, failed: undefined as unknown };
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
    return queryTransaction.run(state, async () => {
      const result = await work();
      if (state.failed) throw state.failed;
      if (Date.now() >= state.deadline) throw new Error('Paper cycle exceeded transaction budget');
      return result;
    });
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Lazy pool initialization to support worker context where dotenv runs after imports
export function getPool(): Pool {
  if (!global.__pgPool) {
    // Neon requires SSL - enable if DATABASE_URL contains "neon" or in production
    const requiresSSL = process.env.DATABASE_URL?.includes('neon') || process.env.NODE_ENV === "production";
    
    global.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.PG_POOL_MAX ?? '15', 10),
      connectionTimeoutMillis: 5_000,   // 5s to acquire connection
      idleTimeoutMillis: 10_000,        // release idle clients after 10s
      statement_timeout: 30_000,        // 30s query timeout (pool-level)
      ssl: requiresSSL ? { rejectUnauthorized: true } : undefined,
    });

    global.__pgPool.on('error', (err) => {
      console.error('[db] Unexpected idle client error:', err);
    });
  }
  return global.__pgPool;
}

/** Preferred parameter types for queries. Loose enough for existing code. */
export type QueryParam = string | number | boolean | null | undefined | Date | Buffer | string[];

// Export pool getter for backwards compatibility
export const pool = {
  query: async (text: string, params?: any[]): Promise<QueryResult> => {
    return getPool().query(text, params);
  }
};

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const scope = queryTransaction.getStore();
  if (scope) {
    if (scope.failed) throw scope.failed;
    if (Date.now() >= scope.deadline) {
      scope.failed = new Error('Paper cycle exceeded transaction budget');
      throw scope.failed;
    }
    try { return (await scope.client.query(text, params)).rows as T[]; }
    catch (error) { scope.failed = error; throw error; }
  }
  const client = await getPool().connect();
  try {
    // statement_timeout now set at pool level — no per-query SET needed
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] ROLLBACK failed after transaction error:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
