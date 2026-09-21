const { execFileSync } = require('child_process');

const port = String(process.env.PORT || 5000);

// S3 FIX: Validate PORT is numeric to prevent command injection
if (!/^\d+$/.test(port)) {
  console.error(`Invalid PORT value: ${port}`);
  process.exit(1);
}

// Complete the additive disclosure schema migration before serving requests.
// A failure stops this release before it can report acceptance as saved.
execFileSync(process.execPath, [require.resolve('./scripts/run_migration_058.js')], { stdio: 'inherit' });

console.log(`Starting Next.js on port ${port}...`);
execFileSync('npx', ['next', 'start', '-p', port, '-H', '0.0.0.0'], { stdio: 'inherit' });
