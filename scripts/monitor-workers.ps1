param(
  [int]$DurationMinutes = 60,
  [int]$IntervalSeconds = 60,
  [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $LogPath = Join-Path $workspace "worker-monitor-$stamp.log"
}

$patterns = @{
  ingest = 'worker/ingest-data.ts'
  engine = 'worker/engine-runner.ts'
  notifications = 'worker/notification-router.ts --watch'
  outcomes = 'worker/label-outcomes.ts --watch'
}

function Get-WorkerCount {
  param([string]$Pattern)
  $matches = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match 'node|npm|tsx' -and $_.CommandLine -match [regex]::Escape($Pattern)
  }
  return ($matches | Measure-Object).Count
}

function Get-DbSnapshot {
  $tmp = Join-Path $workspace 'tmp_monitor_db_check.cjs'
@'
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
(async () => {
  const db = process.env.DATABASE_URL;
  if (!db) {
    console.log(JSON.stringify({ dbError: 'DATABASE_URL missing' }));
    process.exit(0);
  }
  const client = new Client({
    connectionString: db,
    ssl: (db || '').includes('neon') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();
  const quotes = await client.query("select max(fetched_at) as latest, count(*) filter (where fetched_at >= now() - interval '5 minutes')::int as last_5m from quotes_latest").catch(() => ({ rows: [{}] }));
  const cryptoQuotes = await client.query("select max(ql.fetched_at) as latest, count(*) filter (where ql.fetched_at >= now() - interval '5 minutes')::int as last_5m from quotes_latest ql join symbol_universe su on su.symbol = ql.symbol where su.asset_type = 'crypto' and su.enabled = true").catch(() => ({ rows: [{}] }));
  const cryptoUniverse = await client.query("select max(last_fetched_at) as latest, count(*) filter (where last_fetched_at >= now() - interval '5 minutes')::int as last_5m from symbol_universe where asset_type = 'crypto' and enabled = true").catch(() => ({ rows: [{}] }));
  const ingest = await client.query("select finished_at, status, (metadata->>'coingeckoAttempted')::int as coingecko_attempted, (metadata->>'coingeckoSucceeded')::int as coingecko_succeeded, (metadata->>'coingeckoNoData')::int as coingecko_nodata, (metadata->>'coingeckoFailed')::int as coingecko_failed, (metadata->>'skippedNotDue')::int as skipped_not_due from worker_runs where worker_name = 'ingest-main' order by finished_at desc limit 1").catch(() => ({ rows: [{}] }));
  const events = await client.query("select count(*) filter (where created_at >= now() - interval '5 minutes')::int as last_5m, max(created_at) as latest from ai_events").catch(() => ({ rows: [{}] }));
  const deliveries = await client.query("select count(*) filter (where attempted_at >= now() - interval '5 minutes')::int as last_5m, max(attempted_at) as latest from notification_deliveries").catch(() => ({ rows: [{}] }));
  console.log(JSON.stringify({
    quotes: quotes.rows[0] || {},
    crypto_quotes: cryptoQuotes.rows[0] || {},
    crypto_universe: cryptoUniverse.rows[0] || {},
    ingest_latest: ingest.rows[0] || {},
    ai_events: events.rows[0] || {},
    notification_deliveries: deliveries.rows[0] || {}
  }));
  await client.end();
})().catch(err => {
  console.log(JSON.stringify({ dbError: err.message || String(err) }));
});
'@ | Set-Content -Path $tmp -Encoding UTF8

  try {
    $raw = node $tmp 2>$null
    if (-not $raw) {
      return @{ dbError = 'No output from DB check' }
    }
    $lines = @($raw | Where-Object { $_ -and $_.Trim() -ne '' })
    $jsonLine = $lines[-1]
    return ($jsonLine | ConvertFrom-Json -ErrorAction Stop)
  }
  catch {
    return @{ dbError = $_.Exception.Message }
  }
  finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Force
    }
  }
}

$iterations = [math]::Ceiling(($DurationMinutes * 60) / [math]::Max(1, $IntervalSeconds))

"[monitor] starting at $(Get-Date -Format o)" | Out-File -FilePath $LogPath -Encoding utf8
"[monitor] workspace: $workspace" | Out-File -FilePath $LogPath -Append -Encoding utf8
"[monitor] durationMinutes=$DurationMinutes intervalSeconds=$IntervalSeconds iterations=$iterations" | Out-File -FilePath $LogPath -Append -Encoding utf8

for ($i = 1; $i -le $iterations; $i++) {
  $snapshot = [ordered]@{
    ts = (Get-Date).ToString('o')
    iteration = $i
    workers = [ordered]@{
      ingest = (Get-WorkerCount -Pattern $patterns.ingest)
      engine = (Get-WorkerCount -Pattern $patterns.engine)
      notifications = (Get-WorkerCount -Pattern $patterns.notifications)
      outcomes = (Get-WorkerCount -Pattern $patterns.outcomes)
    }
    db = (Get-DbSnapshot)
  }

  ($snapshot | ConvertTo-Json -Depth 6 -Compress) | Out-File -FilePath $LogPath -Append -Encoding utf8

  if ($i -lt $iterations) {
    Start-Sleep -Seconds $IntervalSeconds
  }
}

"[monitor] finished at $(Get-Date -Format o)" | Out-File -FilePath $LogPath -Append -Encoding utf8
Write-Output "Monitor complete. Log: $LogPath"
