Set-Location "c:\Users\bradl\Downloads\marketscannerpros-main (2)\marketscannerpros-main"
$ErrorActionPreference = 'Stop'

$routeFiles = Get-ChildItem -Path app -Recurse -Filter page.tsx
$rootApp = (Join-Path (Get-Location).Path 'app')
$routes = @()
foreach ($rf in $routeFiles) {
  $rel = $rf.FullName.Substring($rootApp.Length).TrimStart('\\').Replace('\\','/')
  if ($rel -eq 'page.tsx') { $routes += '/' } else { $routes += '/' + ($rel -replace '/page\.tsx$','') }
}
$routes = $routes | Sort-Object -Unique
$dynamicRoutes = $routes | Where-Object { $_ -match '\[[^\]]+\]' }

function MatchesRoute($p, $allRoutes, $dynRoutes) {
  if ($allRoutes -contains $p) { return $true }
  foreach ($dr in $dynRoutes) {
    $rx = '^' + ($dr -replace '\[\.\.\.[^\]]+\]','__CATCHALL__' -replace '\[[^\]]+\]','__SEG__')
    $rx = [regex]::Escape($rx).Replace('__CATCHALL__','.+').Replace('__SEG__','[^/]+') + '$'
    if ($p -match $rx) { return $true }
  }
  return $false
}

$patterns = @(
  'href\s*=\s*"(?<p>/[^"#?]*)"',
  "href\s*=\s*'(?<p>/[^'#?]*)'",
  'href\s*=\s*\{\s*"(?<p>/[^"#?]*)"\s*\}',
  "href\s*=\s*\{\s*'(?<p>/[^'#?]*)'\s*\}",
  'router\.push\(\s*"(?<p>/[^"#?]*)"\s*\)',
  "router\.push\(\s*'(?<p>/[^'#?]*)'\s*\)",
  'router\.replace\(\s*"(?<p>/[^"#?]*)"\s*\)',
  "router\.replace\(\s*'(?<p>/[^'#?]*)'\s*\)",
  'redirect\(\s*"(?<p>/[^"#?]*)"\s*\)',
  "redirect\(\s*'(?<p>/[^'#?]*)'\s*\)",
  'window\.location\.href\s*=\s*"(?<p>/[^"#?]*)"',
  "window\.location\.href\s*=\s*'(?<p>/[^'#?]*)'"
)

$files = Get-ChildItem -Path app -Recurse -Include *.tsx,*.ts
$findings = @()
foreach ($f in $files) {
  $ln = 0
  foreach ($line in Get-Content -LiteralPath $f.FullName) {
    $ln++
    foreach ($pat in $patterns) {
      $ms = [regex]::Matches($line, $pat)
      foreach ($m in $ms) {
        $p = $m.Groups['p'].Value
        if (-not $p) { continue }
        if ($p -like '/api/*') { continue }
        if (-not (MatchesRoute $p $routes $dynamicRoutes)) {
          $findings += [pscustomobject]@{
            File = $f.FullName.Replace((Get-Location).Path + '\\','').Replace('\\','/')
            Line = $ln
            Target = $p
            Snippet = $line.Trim()
          }
        }
      }
    }
  }
}

"ROUTES:"
$routes
"MISSING:"
if ($findings.Count -eq 0) { "NONE" } else { $findings | Sort-Object Target,File,Line | ConvertTo-Json -Depth 3 }