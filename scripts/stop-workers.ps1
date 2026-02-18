[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

$patterns = @(
  'worker:ingest',
  'worker/ingest-data\.ts',
  'worker:engine',
  'worker/engine-runner\.ts',
  'worker:notifications:loop',
  'worker/notification-router\.ts\s+--watch',
  'worker:outcomes:loop',
  'worker/label-outcomes\.ts\s+--watch'
)

function Matches-WorkerPattern {
  param(
    [string]$CommandLine,
    [string[]]$Needles
  )

  foreach ($needle in $Needles) {
    if ($CommandLine -match $needle) {
      return $true
    }
  }

  return $false
}

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $cmd = $_.CommandLine
    $_.Name -match 'node|npm|tsx' -and
    $cmd -and
    (Matches-WorkerPattern -CommandLine $cmd -Needles $patterns)
  } |
  Sort-Object ProcessId -Unique

if (-not $processes -or $processes.Count -eq 0) {
  Write-Host '[workers] no matching worker processes found' -ForegroundColor Yellow
  return
}

Write-Host "[workers] found $($processes.Count) matching process(es)" -ForegroundColor Gray

foreach ($proc in $processes) {
  $line = "PID=$($proc.ProcessId) :: $($proc.CommandLine)"

  if ($PSCmdlet.ShouldProcess($line, 'Stop-Process -Force')) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Host "[workers] stopped PID $($proc.ProcessId)" -ForegroundColor Green
    }
    catch {
      Write-Host "[workers] failed to stop PID $($proc.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host '[workers] done' -ForegroundColor Gray
