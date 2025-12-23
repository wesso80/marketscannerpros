/**
 * Auto-migration runner
 * Ensures database schema is up to date on app startup
 */

import { q } from './db';

let migrationRun = false;

export async function runMigrations() {
  if (migrationRun) return;
  migrationRun = true;

  try {
    console.log('[migrations] Checking database schema...');

    // Check if ai_usage has token columns
    const columns = await q(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ai_usage'
    `);
    
    const columnNames = columns.map((c: any) => c.column_name);
    
    // Migration 012: Add token tracking columns
    if (!columnNames.includes('prompt_tokens')) {
      console.log('[migrations] Running migration 012: Adding token tracking columns to ai_usage...');
      await q(`
        ALTER TABLE ai_usage 
        ADD COLUMN IF NOT EXISTS prompt_tokens INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS completion_tokens INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_tokens INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS model VARCHAR(50) DEFAULT 'gpt-4o-mini'
      `);
      console.log('[migrations] ✅ Migration 012 complete');
    }

    // Create index if not exists
    await q(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC)
    `).catch(() => {}); // Ignore if exists

    // Migration 013: Create push_subscriptions table
    const tables = await q(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
    `);
    
    if (tables.length === 0) {
      console.log('[migrations] Running migration 013: Creating push_subscriptions table...');
      await q(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh_key TEXT NOT NULL,
          auth_key TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(workspace_id, endpoint)
        )
      `);
      await q(`
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace ON push_subscriptions(workspace_id)
      `).catch(() => {});
      console.log('[migrations] ✅ Migration 013 complete');
    }

    console.log('[migrations] Schema check complete');
  } catch (error) {
    console.error('[migrations] Error running migrations:', error);
    // Don't throw - allow app to continue
  }
}

