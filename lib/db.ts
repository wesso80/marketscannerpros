import { Pool, PoolClient, QueryResult } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Lazy pool initialization to support worker context where dotenv runs after imports
function getPool(): Pool {
  if (!global.__pgPool) {
    // Neon requires SSL - enable if DATABASE_URL contains "neon" or in production
    const requiresSSL = process.env.DATABASE_URL?.includes('neon') || process.env.NODE_ENV === "production";
    
    global.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 15,
      connectionTimeoutMillis: 5_000,   // 5s to acquire connection
      idleTimeoutMillis: 10_000,        // release idle clients after 10s
      ssl: requiresSSL ? { rejectUnauthorized: false } : undefined,
    });

    global.__pgPool.on('error', (err) => {
      console.error('[db] Unexpected idle client error:', err);
    });
  }
  return global.__pgPool;
}

// Export pool getter for backwards compatibility
export const pool = {
  query: async (text: string, params?: any[]): Promise<QueryResult> => {
    return getPool().query(text, params);
  }
};

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query('SET statement_timeout = 30000'); // 30s query timeout
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
