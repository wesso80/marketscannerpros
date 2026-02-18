$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot

function Test-WorkerRunning {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Pattern
  )

  $matches = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -match 'node|npm|tsx' -and
      $_.CommandLine -match $Pattern
    }

  return [bool]$matches
}

function Start-WorkerIfMissing {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Pattern,
    [Parameter(Mandatory = $true)]
    [string]$NpmScript
  )

  if (Test-WorkerRunning -Pattern $Pattern) {
    Write-Host "[workers] $Name already running" -ForegroundColor Yellow
    return
  }

  Write-Host "[workers] starting $Name..." -ForegroundColor Cyan

  Start-Process -FilePath 'powershell.exe' `
    -WorkingDirectory $workspace `
    -WindowStyle Minimized `
    -ArgumentList @(
      '-NoExit',
      '-ExecutionPolicy', 'Bypass',
      '-Command', "npm run $NpmScript"
    )

  Start-Sleep -Seconds 2

  if (Test-WorkerRunning -Pattern $Pattern) {
    Write-Host "[workers] $Name started" -ForegroundColor Green
  }
  else {
    Write-Host "[workers] $Name did not start (check terminal output)" -ForegroundColor Red
  }
}

Write-Host "[workers] workspace: $workspace" -ForegroundColor Gray

$workers = @(
  @{ Name = 'ingest'; Pattern = 'worker/ingest-data\.ts|worker:ingest'; Script = 'worker:ingest' },
  @{ Name = 'engine'; Pattern = 'worker/engine-runner\.ts|worker:engine'; Script = 'worker:engine' },
  @{ Name = 'notifications'; Pattern = 'worker/notification-router\.ts\s+--watch|worker:notifications:loop'; Script = 'worker:notifications:loop' },
  @{ Name = 'outcomes'; Pattern = 'worker/label-outcomes\.ts\s+--watch|worker:outcomes:loop'; Script = 'worker:outcomes:loop' }
)

foreach ($worker in $workers) {
  Start-WorkerIfMissing -Name $worker.Name -Pattern $worker.Pattern -NpmScript $worker.Script
}

Write-Host "[workers] done" -ForegroundColor Gray
