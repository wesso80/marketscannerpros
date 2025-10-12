#!/usr/bin/env node

/**
 * Manual User Upgrade Script
 * 
 * Usage: node scripts/upgrade-user.js <workspace-id>
 * 
 * When someone pays via Stripe, get their workspace ID and run this script.
 */

require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

async function upgradeUser(workspaceId) {
  if (!workspaceId) {
    console.error('❌ Error: Please provide a workspace ID');
    console.log('\nUsage: node scripts/upgrade-user.js <workspace-id>');
    console.log('\nExample: node scripts/upgrade-user.js wks_abc123xyz');
    process.exit(1);
  }

  // Check for database connection (Vercel uses POSTGRES_URL, Replit uses DATABASE_URL)
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: No database connection found');
    console.log('\nMake sure POSTGRES_URL or DATABASE_URL is set in .env.local');
    process.exit(1);
  }

  // Set POSTGRES_URL if not already set (for Vercel Postgres SDK)
  if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }

  try {
    console.log(`\n🔄 Upgrading workspace: ${workspaceId}...`);

    const result = await sql`
      INSERT INTO subscriptions (workspace_id, tier, status, provider, updated_at)
      VALUES (${workspaceId}, 'paid', 'active', 'stripe', NOW())
      ON CONFLICT (workspace_id)
      DO UPDATE SET
        tier = 'paid',
        status = 'active',
        provider = 'stripe',
        updated_at = NOW()
      RETURNING workspace_id, tier, status
    `;

    console.log('✅ Success! User upgraded to PAID tier');
    console.log(`\nWorkspace: ${result.rows[0].workspace_id}`);
    console.log(`Tier: ${result.rows[0].tier}`);
    console.log(`Status: ${result.rows[0].status}`);
    console.log(`\n✨ Customer now has full access to all Pro features!\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error upgrading user:', error.message);
    process.exit(1);
  }
}

const workspaceId = process.argv[2];
upgradeUser(workspaceId);
