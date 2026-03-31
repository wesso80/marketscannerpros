const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    // Check what tables exist
    const tables = await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const names = tables.rows.map(r => r.tablename);
    const relevant = names.filter(n => n.includes('pick') || n.includes('daily') || n.includes('scan') || n.includes('suggest'));
    console.log('Relevant tables:', relevant);

    // Check if daily_picks exists and has data
    if (names.includes('daily_picks')) {
      const r1 = await p.query("SELECT COUNT(*)::int as cnt, MAX(scan_date) as latest_date FROM daily_picks");
      console.log('daily_picks:', r1.rows[0]);
      const r2 = await p.query("SELECT symbol, score, direction, scan_date FROM daily_picks ORDER BY scan_date DESC, score DESC LIMIT 5");
      console.log('Top picks:', r2.rows);
    } else {
      console.log('daily_picks table DOES NOT EXIST');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  p.end();
}
main();
