# Build iOS App via GitHub Actions

Since the Replit environment has TypeScript compatibility issues with Expo/EAS, we'll use GitHub Actions to build the app.

## Setup Steps

### 1. Get Your Expo Access Token
1. Go to https://expo.dev/accounts/[your-account]/settings/access-tokens
2. Click "Create Token"
3. Name it "GitHub Actions"
4. Copy the token (starts with `eas_...`)

### 2. Push Code to GitHub
```bash
cd ~/marketscanner-mobile
git init
git add .
git commit -m "iOS app with StoreKit IAP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/marketscanner-mobile.git
git push -u origin main
```

### 3. Add Expo Token to GitHub Secrets
1. Go to your GitHub repo: Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `EXPO_TOKEN`
4. Value: Paste your Expo token
5. Click "Add secret"

### 4. Trigger the Build
1. Go to Actions tab in your GitHub repo
2. Click "EAS Build" workflow
3. Click "Run workflow" → "Run workflow"
4. Wait 10-15 minutes for build to complete
5. Check build status at https://expo.dev/accounts/wesso80/projects/marketscanner-mobile/builds

### 5. Submit to TestFlight
Once the build succeeds:
```bash
eas submit --platform ios --latest
```

## App Store Connect Checklist
Before submitting to App Review, verify these products exist:

✅ `com.wesso80.marketscanners.proplan.monthly`
   - $4.99/month, 7-day trial

✅ `com.wesso80.marketscanners.protrader.monthly`
   - $9.99/month, 5-day trial

Both must be set to "Ready to Submit" status.

## Why GitHub Actions?
The Replit environment has Node.js TypeScript loading issues that prevent EAS CLI from running. GitHub Actions uses a clean Ubuntu environment that doesn't have this limitation.
