# 🚀 START HERE - Market Scanner Pro Setup

> **Welcome!** This guide will get you started in 5 minutes.

## 📦 What You Received

✅ **Complete codebase** - Mobile app, web app, and API  
✅ **Documentation** - Setup guides for each component  
✅ **Example configs** - .env.example files for all secrets  
❌ **No secrets** - Client will provide separately

## ⚡ Quick Start (Choose One)

### Option A: Just Deploy Mobile App
**Time: 15 minutes**

```bash
cd mobile-app
npm install

# Ask client for EXPO_TOKEN, then:
export EXPO_TOKEN=their-token-here
npx eas-cli build --platform ios
```

📖 Full guide: `README-FOR-FREELANCER.md`

---

### Option B: Run Everything Locally
**Time: 30 minutes**

```bash
# 1. Install dependencies
cd mobile-app && npm install && cd ..
cd marketing-site && npm install && cd ..
cd streamlit-app && pip install -r requirements.txt && cd ..

# 2. Set up environment variables
cd marketing-site && cp .env.example .env.local
# Edit .env.local with client's secrets
cd ../streamlit-app && cp .env.example .env
# Edit .env with client's secrets

# 3. Run everything (3 terminals)
Terminal 1: cd marketing-site && npm run dev
Terminal 2: cd streamlit-app && streamlit run app.py --server.port 5000
Terminal 3: cd mobile-app && npx expo start
```

📖 Full guide: `COMPLETE-SETUP-GUIDE.md`

---

### Option C: Deploy to Production
**Time: 1-2 hours**

See `COMPLETE-SETUP-GUIDE.md` → "Deployment Strategy" section

---

## 📚 Documentation Map

| File | Purpose |
|------|---------|
| **THIS FILE** | Quick start guide |
| `COMPLETE-SETUP-GUIDE.md` | Complete architecture & deployment |
| `README-FOR-FREELANCER.md` | Mobile app setup (iOS/Android) |
| `NEXTJS-BUILD-GUIDE.md` | Next.js build issues & solutions |
| `EXPORT-CONTENTS.txt` | Quick overview of what's included |
| `marketing-site/.env.example` | Required env vars for Next.js |
| `streamlit-app/.env.example` | Required env vars for Streamlit |

## 🔐 What Client Must Provide

### For Mobile Builds
- ✅ `EXPO_TOKEN` - Get from expo.dev account settings

### For Next.js Site
- ✅ `APP_SIGNING_SECRET` - Can generate yourself: `openssl rand -base64 32`
- ✅ `NEXTAUTH_SECRET` - Can generate yourself: `openssl rand -base64 32`
- ✅ `SECRET` - Webhook secret (ask client)
- ✅ `REVENUECAT_SECRET_API_KEY` - From RevenueCat dashboard
- ✅ `TRADINGVIEW_WEBHOOK_SECRET` - From TradingView (ask client)
- ✅ Database connection string (PostgreSQL)

### For Streamlit App
- ✅ `DATABASE_URL` - PostgreSQL connection (ask client)
- ✅ `APP_SIGNING_SECRET` - Same as Next.js site above

## ⚠️ Common Gotchas

### 1. Mobile App Git Lock Error
```bash
# Fix: Delete git lock before building
rm -f .git/index.lock
```

### 2. Next.js Build Fails
```bash
# Fix: Install dependencies first
cd marketing-site
npm install
```

### 3. Streamlit Can't Connect to DB
```bash
# Fix: Check DATABASE_URL format
# Should be: postgresql://user:pass@host:port/db
```

### 4. Mobile App Shows Blank Screen
```bash
# Fix: Verify WebView URL in App.js
# Should point to: https://app.marketscannerpros.app
```

## 🎯 Project Structure

```
freelancer-export/
│
├── mobile-app/           # React Native + Expo
│   ├── App.js           # WebView wrapper
│   ├── eas.json         # Build config
│   └── package.json
│
├── marketing-site/       # Next.js 14
│   ├── app/             # App router pages
│   ├── components/      # React components
│   ├── public/          # Static assets
│   ├── next.config.mjs
│   └── package.json
│
└── streamlit-app/        # Python + Streamlit
    ├── app.py           # Main application
    ├── auth_helper.py   # Authentication
    └── requirements.txt
```

## ✅ Verification Checklist

Before you start coding, verify:

- [ ] Node.js 20.x+ installed (`node -v`)
- [ ] Python 3.11+ installed (`python --version`)
- [ ] Git installed (`git --version`)
- [ ] npm installed (`npm -v`)
- [ ] You have client's EXPO_TOKEN
- [ ] You have client's secrets list
- [ ] You've read this file completely

## 🆘 Need Help?

### Build Issues
→ See `NEXTJS-BUILD-GUIDE.md`

### Architecture Questions
→ See `COMPLETE-SETUP-GUIDE.md`

### Mobile App Issues
→ See `README-FOR-FREELANCER.md`

### Environment Variables
→ Check `.env.example` files in each folder

## 🏁 Next Steps

1. ✅ Read this file (you're here!)
2. ⏭️ Choose your path: Option A, B, or C above
3. ⏭️ Request secrets from client
4. ⏭️ Follow the relevant guide
5. ⏭️ Test everything works
6. ⏭️ Deploy to production

---

**Questions?** Contact the client: Bradley Wessling (@wesso80)

**Ready?** Jump to your chosen option above! 🚀
