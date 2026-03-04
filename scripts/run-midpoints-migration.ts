/**
 * Run Midpoints Migration
 * 
 * Applies the timeframe_midpoints table schema to the database.
 * 
 * Usage:
 *   npm run migrate:midpoints
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config(); // Fallback to .env

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  try {
    console.log('🔧 Running Midpoints Migration...\n');
    
    // Check if table already exists
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'timeframe_midpoints'
    `);
    
    if (tableCheck.rows.length > 0) {
      console.log('⚠️  Table "timeframe_midpoints" already exists');
      console.log('   Migration will update functions and indexes...\n');
    } else {
      console.log('✓ Table does not exist, creating fresh...\n');
    }
    
    // Read migration file
    const migrationPath = path.join(process.cwd(), 'migrations', '001_timeframe_midpoints.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Executing migration file: 001_timeframe_midpoints.sql\n');
    
    // Execute migration
    await pool.query(sql);
    
    console.log('✓ Migration executed successfully\n');
    
    // Verify table and indexes
    console.log('🔍 Verifying database objects...\n');
    
    const verification = await pool.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_name = 'timeframe_midpoints') as column_count,
        (SELECT COUNT(*) FROM pg_indexes 
         WHERE tablename = 'timeframe_midpoints') as index_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'timeframe_midpoints'
    `);
    
    if (verification.rows.length > 0) {
      const { table_name, column_count, index_count } = verification.rows[0];
      console.log(`✓ Table: ${table_name}`);
      console.log(`✓ Columns: ${column_count}`);
      console.log(`✓ Indexes: ${index_count}`);
    }
    
    // Check functions
    const functions = await pool.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name LIKE '%midpoint%'
      ORDER BY routine_name
    `);
    
    console.log(`\n✓ Functions created: ${functions.rows.length}`);
    functions.rows.forEach((row: any) => {
      console.log(`  - ${row.routine_name}()`);
    });
    
    // Check view
    const views = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
        AND table_name = 'midpoint_stats'
    `);
    
    if (views.rows.length > 0) {
      console.log('\n✓ View created: midpoint_stats');
    }
    
    console.log('\n✅ Migration complete! Database is ready for midpoint data.\n');
    console.log('Next steps:');
    console.log('  1. Run backfill script: npm run backfill:midpoints');
    console.log('  2. Integrate with worker: Update worker/ingest-data.ts');
    console.log('  3. Test API: GET /api/midpoints?symbol=BTCUSD&currentPrice=68000\n');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
