#!/usr/bin/env node

/**
 * Manual User Upgrade Script
 * 
 * Usage: node scripts/upgrade-user.js <workspace-id>
 * 
 * When someone pays via Stripe, you'll get their workspace ID from the payment email.
 * Run this script to upgrade them to paid tier.
 */

const { sql } = require('@vercel/postgres');

async function upgradeUser(workspaceId) {
  if (!workspaceId) {
    console.error('❌ Error: Please provide a workspace ID');
    console.log('\nUsage: node scripts/upgrade-user.js <workspace-id>');
    process.exit(1);
  }

  try {
    console.log(`\n🔄 Upgrading workspace: ${workspaceId}...`);

    await sql`
      INSERT INTO subscriptions (workspace_id, tier, status, updated_at)
      VALUES (${workspaceId}, 'paid', 'active', NOW())
      ON CONFLICT (workspace_id)
      DO UPDATE SET
        tier = 'paid',
        status = 'active',
        updated_at = NOW()
    `;

    console.log('✅ Success! User upgraded to PAID tier');
    console.log(`\nWorkspace ${workspaceId} now has full access to all features.\n`);
  } catch (error) {
    console.error('❌ Error upgrading user:', error.message);
    process.exit(1);
  }
}

const workspaceId = process.argv[2];
upgradeUser(workspaceId);
