const { execFileSync } = require('child_process');

const port = String(process.env.PORT || 5000);

// S3 FIX: Validate PORT is numeric to prevent command injection
if (!/^\d+$/.test(port)) {
  console.error(`Invalid PORT value: ${port}`);
  process.exit(1);
}

console.log(`Starting Next.js on port ${port}...`);
execFileSync('npx', ['next', 'start', '-p', port, '-H', '0.0.0.0'], { stdio: 'inherit' });
