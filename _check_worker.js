const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Q8nXeM0RisqL@ep-plain-recipe-a7bmaq00-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Check user_subscriptions
  const subs = await p.query(`SELECT workspace_id, email, tier, status FROM user_subscriptions ORDER BY email`);
  console.log('=== USER SUBSCRIPTIONS ===');
  console.log(JSON.stringify(subs.rows, null, 2));
  console.log(`Total: ${subs.rows.length}`);

  // Check scan_usage for today
  const usage = await p.query(`SELECT * FROM scan_usage WHERE scan_date >= CURRENT_DATE - 1 ORDER BY scan_date DESC, workspace_id`);
  console.log('\n=== SCAN USAGE (last 2 days) ===');
  console.log(JSON.stringify(usage.rows, null, 2));

  await p.end();
}

run().catch(e => { console.error(e); process.exit(1); });
