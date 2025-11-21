# Next.js Build Issues - Quick Reference

## 🔴 Critical Issues That WILL Block Build

### 1. Missing Dependencies
**Status:** ❌ BLOCKER  
**Error:** `sh: next: not found`  
**Fix:**
```bash
cd marketing-site
npm install
```

### 2. Missing Environment Variables
**Status:** ❌ BLOCKER  
**Error:** Runtime crashes, API routes fail  
**Required vars:**
- `APP_SIGNING_SECRET`
- `NEXTAUTH_SECRET`
- `SECRET`
- `REVENUECAT_SECRET_API_KEY`
- `NEXT_PUBLIC_STREAMLIT_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE`

**Fix:**
```bash
cp .env.example .env.local
# Fill in all values
```

---

## 🟡 Warning: Issues That May Cause Problems

### 3. Database Dependency
**Status:** ⚠️ WARNING  
**Package:** `@vercel/postgres` in package.json  
**Issue:** Requires Vercel Postgres or compatible database  
**Impact:** API routes that use database will fail  

**Affected routes:**
- Possibly `/api/auth/*` (if using DB for sessions)
- Other API routes that query database

**Fix Options:**
- Deploy to Vercel (automatic Postgres support)
- Replace with standard PostgreSQL client
- Mock database calls for local dev

### 4. Linting Disabled
**Status:** ⚠️ WARNING  
**Config:** `"build": "next build --no-lint"`  
**Issue:** Code quality issues won't be caught during build  

**Fix:**
```bash
# Run lint manually
npm run lint

# Or remove --no-lint from package.json
```

### 5. TypeScript Strict Mode
**Status:** ⚠️ WARNING  
**Config:** `"strict": true` in tsconfig.json  
**Issue:** May have type errors that aren't currently caught  

**Potential errors:**
- Missing null checks
- Untyped environment variables
- Implicit any types

**Test:**
```bash
npx tsc --noEmit
```

---

## 🟢 Informational: Not Blocking

### 6. Stripe + RevenueCat Both Present
**Status:** ℹ️ INFO  
**Issue:** Both payment libraries in package.json  
**Note:** Project uses RevenueCat now, Stripe is legacy  

**Cleanup (optional):**
```bash
npm uninstall stripe
# Remove Stripe imports from code
```

### 7. Build Output Mode
**Status:** ℹ️ INFO  
**Current:** Standard build output  
**Note:** Not using `output: 'standalone'`  

**For Docker/containerized deployment, add:**
```javascript
// next.config.mjs
const nextConfig = {
  output: 'standalone',
  // ...
};
```

---

## 🧪 Testing Checklist

Run these commands to verify everything works:

```bash
# 1. Type checking
npx tsc --noEmit

# 2. Linting (if enabled)
npm run lint

# 3. Build test
npm run build

# 4. Start production server
npm start

# 5. Health check
curl http://localhost:3000/api/health
```

---

## 📋 Environment Variables Verification

### Required (Must Have)
- [ ] APP_SIGNING_SECRET
- [ ] NEXTAUTH_SECRET
- [ ] SECRET
- [ ] REVENUECAT_SECRET_API_KEY
- [ ] NEXT_PUBLIC_STREAMLIT_URL
- [ ] NEXT_PUBLIC_APP_URL
- [ ] NEXT_PUBLIC_API_BASE

### Optional (Safe to Skip for Local Dev)
- [ ] FREE_FOR_ALL_MODE (defaults to false)
- [ ] PRO_OVERRIDE_EMAILS
- [ ] TRADINGVIEW_WEBHOOK_SECRET
- [ ] ALERTS_TEST_KEY
- [ ] NEXT_PUBLIC_PRICE_PRO
- [ ] NEXT_PUBLIC_PRICE_PRO_TRADER

---

## 🎯 Build Process Summary

1. ✅ Install dependencies → `npm install`
2. ✅ Set environment vars → `cp .env.example .env.local`
3. ✅ Fill in required secrets → Edit `.env.local`
4. ⚠️ Check TypeScript → `npx tsc --noEmit`
5. ✅ Build → `npm run build`
6. ✅ Test → `npm start`

---

## 🚀 Production Deployment

### Vercel (Recommended)
```bash
vercel --prod
```
- ✅ Automatic Postgres setup
- ✅ Environment variables in dashboard
- ✅ Zero config needed

### Other Platforms
- Set all env vars in platform dashboard
- Build command: `npm run build`
- Start command: `npm start`
- Node version: 20.x+

---

**Last Updated:** November 2025  
**Next.js Version:** 14.2.33  
**Status:** Build-ready with env vars ✅
