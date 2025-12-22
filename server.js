const { execSync } = require('child_process');

const port = process.env.PORT || 5000;
const command = `npx next start -p ${port} -H 0.0.0.0`;

console.log(`Starting Next.js on port ${port}...`);
execSync(command, { stdio: 'inherit' });
