# Render Deploy Runbook (MarketScanner Pros)

## Why this exists
Recent deploy logs showed Render building an older commit (`2805e14e`) while newer commits were already on `main`. This runbook prevents stale deploys and speeds up root-cause isolation.

## 1) Pre-deploy verification
- Confirm latest local commit is pushed:
  - `git rev-parse --short HEAD`
  - `git push`
- Confirm Render service tracks branch `main`.
- Confirm Auto-Deploy is enabled for `main`.

## 2) Deploy target validation (critical)
In Render deploy logs, verify early lines include:
- `Cloning from ...`
- `Checking out commit <sha> in branch main`

If `<sha>` is not the expected latest commit:
- Trigger **Manual Deploy** from latest commit.
- Re-check repository/branch linkage in Render service settings.

## 3) Build log triage sequence
Expected non-fatal warnings:
- `baseline-browser-mapping ... over two months old`
- `npm audit` vulnerability summary

Fatal error is almost always later in logs. Always capture the final 80–120 lines after:
- `Creating an optimized production build ...`

## 4) Standard build command
Current build command:
- `npm install && npm run build`

Keep this consistent between local and Render.

## 5) If build succeeds locally but fails on Render
Checklist:
- Commit mismatch (most common)
- Missing env vars in Render dashboard
- Timeouts/resource limits during Next build
- Dependency lock drift (ensure `package-lock.json` is committed and current)

## 6) Quick rollback options
- Redeploy previous known-good commit from Render UI.
- Or use tagged restore point in git:
  - `restore/pre-upe-crcs-2026-02-21-58d07daa`

## 7) Post-deploy verification
- Open key pages:
  - `/tools/market-movers`
  - `/tools/crypto-explorer`
  - `/tools/equity-explorer`
- Confirm no runtime error boundaries.
- Confirm expected commit SHA in deploy metadata.
