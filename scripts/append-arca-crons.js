// scripts/append-arca-crons.js — one-shot helper to add ARCA cron services to render.yaml
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'render.yaml');
const block = `
  - type: cron
    name: arca-cycle
    runtime: node
    schedule: "*/15 * * * *"  # Every 15m, 24/7 (ARCA holds crypto) - SIMULATED ARCA cycle per active workspace
    buildCommand: echo "Cron job ready"
    startCommand: curl -fL --retry 3 --retry-delay 15 --retry-all-errors --connect-timeout 10 --max-time 600 -X POST "$WEB_URL/api/cron/arca-cycle" -H "x-cron-secret:$CRON_SECRET" -H "Content-Type:application/json"
    envVars:
      - key: WEB_URL
        value: "https://marketscannerpros.app"
      - key: CRON_SECRET
        sync: false

  - type: cron
    name: arca-daily-report
    runtime: node
    schedule: "30 22 * * *"  # 22:30 UTC daily - persist DAILY_OPERATOR + EVENING_RECONCILIATION reports
    buildCommand: echo "Cron job ready"
    startCommand: curl -fL --retry 3 --retry-delay 15 --retry-all-errors --connect-timeout 10 --max-time 300 -X POST "$WEB_URL/api/cron/arca-daily-report" -H "x-cron-secret:$CRON_SECRET" -H "Content-Type:application/json"
    envVars:
      - key: WEB_URL
        value: "https://marketscannerpros.app"
      - key: CRON_SECRET
        sync: false
`;
const current = fs.readFileSync(file, 'utf8');
if (current.includes('name: arca-cycle')) {
  console.log('arca-cycle already present; skipping.');
  process.exit(0);
}
fs.appendFileSync(file, block);
console.log('appended ARCA cron services');
