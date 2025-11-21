# Market Scanner Pro - Complete Freelancer Setup Guide

## 📦 What's Included

This export contains the complete Market Scanner Pro platform:

```
freelancer-export/
├── mobile-app/              # React Native/Expo mobile wrapper
├── marketing-site/          # Next.js marketing & API site
├── streamlit-app/           # Python/Streamlit main application
└── Documentation files      # Setup guides and references
```

## 🎯 Quick Start

### 1. Mobile App (iOS/Android)
```bash
cd mobile-app
npm install
npx eas-cli build --platform ios  # Requires EXPO_TOKEN
```
📖 See: `README-FOR-FREELANCER.md`

### 2. Next.js Marketing Site
```bash
cd marketing-site
npm install
cp .env.example .env.local
# Fill in .env.local values
npm run build
npm start
```
📖 See: `NEXTJS-BUILD-GUIDE.md`

### 3. Streamlit App
```bash
cd streamlit-app
pip install -r requirements.txt
cp .env.example .env
# Fill in .env values
streamlit run app.py --server.port 5000
```

## 🔐 Required Secrets (CLIENT MUST PROVIDE)

### For Mobile App
- `EXPO_TOKEN` - From client's Expo account

### For Marketing Site
- `APP_SIGNING_SECRET` - Generate: `openssl rand -base64 32`
- `NEXTAUTH_SECRET` - Generate: `openssl rand -base64 32`
- `SECRET` - Webhook secret
- `REVENUECAT_SECRET_API_KEY` - From client's RevenueCat account
- `TRADINGVIEW_WEBHOOK_SECRET` - From client's TradingView

### For Streamlit App
- `DATABASE_URL` - PostgreSQL connection string
- `APP_SIGNING_SECRET` - Same as marketing site
- Email/Slack credentials (optional)

## 🏗️ Architecture Overview

### How It All Connects

```
┌─────────────────┐
│  Mobile App     │ ────▶ Loads in WebView
│  (React Native) │       
└─────────────────┘       
         │                
         ▼                
┌─────────────────┐       
│ Streamlit App   │ ◀──── Main trading interface
│ (Python)        │       Port: 5000
└─────────────────┘       
         │                
         │ JWT Auth       
         ▼                
┌─────────────────┐       
│ Marketing Site  │ ◀──── API, Auth, Payments
│ (Next.js)       │       Port: 3000
└─────────────────┘       
         │                
         ├─────▶ RevenueCat (Subscriptions)
         ├─────▶ Stripe (Payments - deprecated)
         ├─────▶ PostgreSQL (Database)
         └─────▶ TradingView (Webhooks)
```

### Data Flow

1. **User opens mobile app** → WebView loads Streamlit at port 5000
2. **Streamlit checks auth** → Validates JWT token from marketing site
3. **Marketing site manages**:
   - User authentication
   - Subscription status (RevenueCat)
   - Payment processing
   - TradingView webhooks
   - Price alerts

## 🚀 Deployment Strategy

### Option 1: Replit (Current)
- ✅ All three components deployed on Replit
- ✅ Mobile app uses EAS Build (cloud builds)
- ✅ Custom domains configured

### Option 2: Vercel + Replit
- 📍 Marketing site → Vercel
- 📍 Streamlit app → Replit
- 📍 Mobile app → EAS Build

### Option 3: Separate Hosting
- 📍 Marketing site → Vercel/Netlify/Railway
- 📍 Streamlit app → Railway/Render/Fly.io
- 📍 Mobile app → EAS Build (always cloud)
- 📍 Database → Neon/Supabase/RDS

## 📱 Mobile App Specifics

### Current Setup
- **Bundle ID:** app.marketscannerpros
- **Expo Project:** @wesso80/market-scanner-pro
- **Apple Team:** P7PW224G4Y
- **WebView URL:** https://app.marketscannerpros.app

### Build Process
1. Code is uploaded to EAS Build servers
2. Cloud builds iOS (.ipa) and Android (.aab)
3. Download binaries when complete
4. Upload to App Store Connect / Google Play Console

## 🌐 Next.js Site Details

### Tech Stack
- Next.js 14.2.33 (App Router)
- TypeScript (strict mode)
- Vercel Postgres
- Stripe + RevenueCat
- JWT auth (jose library)

### Key Features
- Marketing pages (pricing, blog, legal)
- User authentication
- Subscription management
- API routes for Streamlit integration
- TradingView webhook receivers
- Email notifications (nodemailer/resend)

### Known Issues
- ⚠️ Uses `--no-lint` in build (linting disabled)
- ⚠️ Requires Vercel Postgres or compatible DB
- ⚠️ Some routes use Stripe (deprecated in favor of RevenueCat)

## 📊 Streamlit App Details

### Tech Stack
- Streamlit web framework
- Python 3.11
- PostgreSQL (psycopg2)
- yfinance (market data)
- pandas, numpy, plotly

### Key Features
- Portfolio tracking (FREE)
- Price alerts (Pro)
- Trade journal (Pro)
- Backtesting (Pro)
- Scanner tools
- Market analysis

### Pro Features Control
- Set `FREE_FOR_ALL_MODE=true` → Everyone gets Pro
- Set `FREE_FOR_ALL_MODE=false` → Checks JWT tokens

## 🔧 Development Workflow

### Local Development
```bash
# Terminal 1: Marketing site
cd marketing-site
npm run dev  # Port 3000

# Terminal 2: Streamlit app
cd streamlit-app
streamlit run app.py --server.port 5000

# Terminal 3: Mobile app (optional)
cd mobile-app
npx expo start
```

### Testing the Full Flow
1. Open marketing site: `http://localhost:3000`
2. Click "Get Started"
3. Should redirect to: `http://localhost:5000?token=xxx`
4. Streamlit validates token
5. Shows Pro features if valid

## 📋 Pre-Deployment Checklist

### Marketing Site
- [ ] All environment variables set
- [ ] Database connected and migrated
- [ ] Stripe/RevenueCat webhooks configured
- [ ] CORS settings correct (middleware.ts)
- [ ] Custom domain DNS configured
- [ ] SSL/TLS certificates active

### Streamlit App
- [ ] Database URL configured
- [ ] Port 5000 bound to 0.0.0.0
- [ ] Auth secret matches marketing site
- [ ] Free-for-all mode set correctly
- [ ] Health check responding

### Mobile App
- [ ] Bundle ID matches: app.marketscannerpros
- [ ] WebView URL points to production Streamlit
- [ ] Icons and splash screens set
- [ ] EAS project linked correctly
- [ ] Apple/Google credentials configured

## 🐛 Common Issues & Solutions

### Issue: Mobile app build fails with git lock
**Solution:** Delete `.git/index.lock` before building

### Issue: Streamlit can't validate JWT
**Solution:** Ensure `APP_SIGNING_SECRET` matches in both apps

### Issue: Next.js build fails
**Solution:** Run `npm install` and set all env vars in `.env.local`

### Issue: Database connection fails
**Solution:** Check `DATABASE_URL` format and firewall rules

### Issue: RevenueCat returns "no subscription"
**Solution:** Check API key and user ID in requests

## 📞 Client Handoff Requirements

Before delivering to client, ensure they have:

1. ✅ Access to Expo account (@wesso80)
2. ✅ RevenueCat account credentials
3. ✅ Apple Developer account (Team ID: P7PW224G4Y)
4. ✅ Google Play Console access
5. ✅ Database credentials
6. ✅ Domain access (marketscannerpros.app, app.marketscannerpros.app)
7. ✅ TradingView webhook secrets
8. ✅ All environment variables documented

## 📚 File Reference

- `README-FOR-FREELANCER.md` - Mobile app setup
- `NEXTJS-BUILD-GUIDE.md` - Next.js build issues & guide
- `EXPORT-CONTENTS.txt` - Quick overview
- `marketing-site/.env.example` - Required env vars for Next.js
- `streamlit-app/.env.example` - Required env vars for Streamlit

## ⚡ Quick Commands Reference

```bash
# Mobile app build
cd mobile-app && npx eas-cli build --platform all

# Next.js build
cd marketing-site && npm run build

# Streamlit run
cd streamlit-app && streamlit run app.py --server.port 5000

# Install all dependencies
(cd mobile-app && npm install) && \
(cd marketing-site && npm install) && \
(cd streamlit-app && pip install -r requirements.txt)
```

---

**Client:** Bradley Wessling (@wesso80)  
**Project:** Market Scanner Pro  
**Export Date:** November 2025  
**Total Components:** 3 (Mobile + Web + API)  
**Status:** Production-ready ✅
