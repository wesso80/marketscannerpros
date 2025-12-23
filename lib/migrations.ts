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

    console.log('[migrations] Schema check complete');
  } catch (error) {
    console.error('[migrations] Error running migrations:', error);
    // Don't throw - allow app to continue
  }
}
