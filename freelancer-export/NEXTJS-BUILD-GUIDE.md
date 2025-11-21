# Next.js Marketing Site - Build Guide & Known Issues

## 🏗️ Build Setup

### 1. Install Dependencies
```bash
cd marketing-site
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env.local
# Edit .env.local and fill in all required values
```

### 3. Build the App
```bash
npm run build
```

### 4. Run Locally
```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

## 🔍 Required Environment Variables

The app **WILL NOT BUILD** without these environment variables set in `.env.local`:

### Critical (Must Have)
- `APP_SIGNING_SECRET` - JWT token signing (generate: `openssl rand -base64 32`)
- `SECRET` - Webhook authentication
- `NEXTAUTH_SECRET` - Auth secret (generate: `openssl rand -base64 32`)
- `REVENUECAT_SECRET_API_KEY` - Subscription management API key
- `NEXT_PUBLIC_STREAMLIT_URL` - URL of the Streamlit app
- `NEXT_PUBLIC_APP_URL` - URL of this marketing site
- `NEXT_PUBLIC_API_BASE` - API base URL (usually same as app URL)

### Optional (Can be empty for local dev)
- `FREE_FOR_ALL_MODE` - Set to `"true"` to skip subscription checks
- `PRO_OVERRIDE_EMAILS` - Comma-separated emails to force Pro access
- `TRADINGVIEW_WEBHOOK_SECRET` - For TradingView webhook security
- `ALERTS_TEST_KEY` - For testing alerts endpoint

## ⚠️ Known Build Issues

### Issue 1: Missing Dependencies
**Error:** `sh: next: not found`

**Solution:** Run `npm install` before building

### Issue 2: Environment Variables Not Set
**Error:** Build succeeds but runtime errors occur

**Solution:** 
- Copy `.env.example` to `.env.local`
- Fill in all required values
- Never commit `.env.local` to git

### Issue 3: Database Connection (if using @vercel/postgres)
**Error:** Database connection fails

**Solution:**
- The app uses `@vercel/postgres` in package.json
- This requires Vercel Postgres database or compatible connection string
- For local development, you may need to mock or remove database calls
- Check `app/api` routes for database usage

### Issue 4: TypeScript Strict Mode
**Current Config:** `"strict": true` in tsconfig.json

**Potential Issues:**
- Type errors in API routes if environment variables not properly typed
- Null/undefined checks required throughout

**Solution:**
- Ensure all environment variables are typed in a `env.d.ts` file
- Use proper TypeScript types for all API responses

### Issue 5: Build Command Uses `--no-lint`
**Current:** `"build": "next build --no-lint"`

**Why:**
- ESLint checks are skipped during build
- This may hide code quality issues

**Recommendation:**
- Run `npm run lint` separately to catch issues
- Or remove `--no-lint` from build script if you want strict builds

## 📦 Key Dependencies

### Production
- `next` ^14.2.33 - Next.js framework
- `react` ^18.3.1 - React library
- `@vercel/postgres` ^0.10.0 - **Database** (requires Vercel or compatible)
- `stripe` ^19.1.0 - **Payment processing** (requires Stripe account)
- `jose` ^5.2.0 - JWT handling
- `nodemailer` ^6.9.8 - Email sending
- `resend` ^6.1.1 - Email API (alternative to nodemailer)

### Development
- `typescript` ^5.9.3
- `@types/node` ^20.19.17
- `@types/react` ^19.2.2

## 🚀 Deployment Checklist

### Vercel Deployment (Recommended)
1. ✅ Install Vercel CLI: `npm i -g vercel`
2. ✅ Set environment variables in Vercel dashboard
3. ✅ Connect Vercel Postgres database (if needed)
4. ✅ Set up Stripe webhook endpoint
5. ✅ Deploy: `vercel --prod`

### Other Platforms (Railway, Render, etc.)
1. ✅ Set all environment variables in platform dashboard
2. ✅ Configure build command: `npm run build`
3. ✅ Configure start command: `npm start`
4. ✅ Set Node version: 20.x or higher
5. ✅ Connect PostgreSQL database
6. ✅ Set up webhook endpoints with proper secrets

## 🔧 API Routes Overview

### Authentication & Payments
- `/api/auth/*` - User authentication endpoints
- `/api/payments/checkout` - Stripe checkout
- `/api/subscription/update` - Subscription management
- `/api/entitlements` - Check user subscription status
- `/api/app-token` - Generate JWT for Streamlit app

### Alerts & Webhooks
- `/api/alerts/*` - Price alert management
- `/api/ai-scanner/*` - TradingView webhook receivers

### Health & Debugging
- `/api/health` - Health check endpoint
- `/api/env-check` - Environment variable checker
- `/api/alerts/debug` - Alert debugging

## 🐛 Debugging Tips

### Check Environment Variables
```bash
# Visit this endpoint after deploying
https://your-domain.com/api/env-check
```

### Test Health Endpoint
```bash
curl https://your-domain.com/api/health
```

### Enable FREE_FOR_ALL_MODE for Testing
```bash
# In .env.local
FREE_FOR_ALL_MODE=true
```

This gives everyone Pro access without subscription checks.

## 📝 Build Output Structure

After `npm run build`, you'll have:

```
.next/
├── cache/           # Build cache
├── server/          # Server-side bundles
├── static/          # Static assets
└── standalone/      # Self-contained build (if enabled)
```

## ⚡ Performance Optimization

Current config is basic. Consider adding:

```javascript
// next.config.mjs
const nextConfig = {
  reactStrictMode: true,
  
  // Add these for production
  output: 'standalone',  // For Docker/containerized deployments
  compress: true,         // Enable gzip compression
  poweredByHeader: false, // Hide X-Powered-By header
  
  // Image optimization
  images: {
    domains: ['your-cdn.com'],
  },
};
```

## 🔐 Security Checklist

- [ ] All `.env*` files in `.gitignore`
- [ ] Secrets use strong random values (not "your-secret-here")
- [ ] Webhook endpoints verify signatures
- [ ] API routes validate inputs
- [ ] CORS properly configured (via middleware.ts)
- [ ] Rate limiting on public endpoints (TODO)

## 📞 Support

If you encounter build issues:

1. Check Node.js version: `node -v` (should be 20.x+)
2. Clear cache: `rm -rf .next && npm run build`
3. Check TypeScript errors: `npx tsc --noEmit`
4. Review environment variables: `/api/env-check` endpoint

---

**Last Updated:** November 2025  
**Next.js Version:** 14.2.33  
**Node Version Required:** 20.x or higher
