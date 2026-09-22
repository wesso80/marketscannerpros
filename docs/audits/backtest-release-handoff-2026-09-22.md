# Publishing the backtest integrity release

The release is based on `335a7c5d334d722567210e5d277f619c516bd130`. It is held on `codex/backtest-integrity-20260922`. The accompanying ZIP contains a Git bundle and these instructions. Extract the ZIP before running commands.

Use PowerShell inside the existing `wesso80/marketscannerpros` checkout. This imports the release into a separate local reference, checks that current remote `main` is its ancestor, and pushes without force. It does not replace your working files or discard local changes.

```powershell
$releaseBundle = Join-Path $env:USERPROFILE 'Downloads\msp-backtest-release\msp-backtest-release.bundle'
if (!(Test-Path $releaseBundle)) { throw "Extract the downloaded ZIP into Downloads\msp-backtest-release first, or set releaseBundle to the actual bundle path." }

git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetching main failed.' }

git bundle verify $releaseBundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed.' }

git fetch $releaseBundle 'refs/heads/codex/backtest-integrity-20260922:refs/remotes/msp-release/backtest-20260922'
if ($LASTEXITCODE -ne 0) { throw 'Importing the release failed.' }

git merge-base --is-ancestor origin/main refs/remotes/msp-release/backtest-20260922
if ($LASTEXITCODE -ne 0) { throw 'Remote main has moved beyond this release. Stop and integrate those changes; do not force push.' }

git push origin 'refs/remotes/msp-release/backtest-20260922:refs/heads/main'
if ($LASTEXITCODE -ne 0) { throw 'Push failed. No force push was attempted.' }

git ls-remote origin refs/heads/main
```

After the push, confirm Render's web and worker deployments use the release SHA shown by the command. A successful push alone is not proof of deployment. The audit report describes post-deployment historical-data checks that remain outstanding.
