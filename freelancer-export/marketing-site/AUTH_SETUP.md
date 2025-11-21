# Authentication & Subscription System Setup

## ✅ Completed

### 1. Marketing Site Cleanup
- ✅ Fixed confusing Hero messaging (removed "7-day trial" language)
- ✅ Updated homepage pricing to clear Free/Pro structure ($4.99/month or $39.99/year)
- ✅ Created new standalone pricing page with FAQ
- ✅ Removed all old Stripe trial language

### 2. Core Authentication Infrastructure
- ✅ **JWT Utility** (`lib/jwt.ts`) - Token generation and verification
- ✅ **Entitlements API** (`app/api/entitlements/route.ts`) - Returns user tier and status
- ✅ **App Token Bridge** (`app/api/app-token/route.ts`) - Generates tokens for Streamlit
- ✅ **RevenueCat Integration** - API ready to check subscription status
- ✅ **Pro Override System** - Env var for testing: `PRO_OVERRIDE_EMAILS`
- ✅ **FREE MODE** - Everyone gets Pro by default (controlled by `FREE_FOR_ALL_MODE` env var)

### 3. Package Dependencies
- ✅ Added `jose@5.2.0` for JWT handling
- ✅ Added `nodemailer@6.9.8` for magic link emails

## 🆓 IMPORTANT: Everything is FREE Until You Enable Payments

**Current State:**
- Everyone automatically gets Pro tier (free)
- No payment processing is active
- Marketing site shows pricing but doesn't charge

**When Ready to Go Live:**
1. Set `FREE_FOR_ALL_MODE=false` in Vercel environment variables
2. Complete authentication setup below
3. Enable payment processing

## 🚧 Still Needed

### 1. Database Setup (Required)
Create these tables in your Vercel Postgres:

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

-- Entitlements table
CREATE TABLE entitlements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) DEFAULT 'free',
  status VARCHAR(20) DEFAULT 'active',
  source VARCHAR(50),
  expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Stripe links (optional, if using Stripe alongside RevenueCat)
CREATE TABLE stripe_links (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Promo codes table
CREATE TABLE promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  tier VARCHAR(20) DEFAULT 'pro',
  duration_days INTEGER DEFAULT 30,
  max_redemptions INTEGER DEFAULT 100,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

### 2. Magic Link Authentication
Create:
- `app/auth/login/page.tsx` - Login page (email input)
- `app/api/auth/magic-link/route.ts` - Send magic link email
- `app/auth/verify/page.tsx` - Verify magic link and create session

### 3. Update Launch Flow
Modify "Get Started" and "Upgrade to Pro" buttons to:
1. Check if user is logged in
2. If not → redirect to `/auth/login?redirect=/launch` or `/auth/login?plan=pro`
3. If yes → call `/api/app-token` and redirect to Streamlit with token

### 4. Environment Variables Needed

```bash
# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=your-secret-key-here

# RevenueCat
REVENUECAT_SECRET_API_KEY=your-revenuecat-key

# For testing: give instant Pro access to these emails
PRO_OVERRIDE_EMAILS=you@example.com,friend@example.com

# Email (for magic links)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@marketscannerpros.app

# Database (Vercel Postgres)
POSTGRES_URL=your-vercel-postgres-url
```

### 5. Streamlit Integration
Update your Streamlit app to:
1. Read `?token=...` from URL query params
2. Store token in `st.session_state['auth_token']`
3. Call `GET https://marketscannerpros.app/api/entitlements` with `Authorization: Bearer <token>`
4. Show/hide features based on returned tier

Example Streamlit code:
```python
import streamlit as st
import requests

# Get token from URL
query_params = st.query_params
if 'token' in query_params:
    st.session_state['auth_token'] = query_params['token']

# Check entitlements
def check_tier():
    token = st.session_state.get('auth_token')
    if not token:
        return {'tier': 'free', 'status': 'active'}
    
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(
        'https://marketscannerpros.app/api/entitlements',
        headers=headers
    )
    return response.json()

tier_info = check_tier()
if tier_info['tier'] == 'pro':
    st.success("Pro features unlocked!")
```

## 🎯 Next Steps Priority

1. **Create database tables** - Run SQL above in Vercel Postgres
2. **Set environment variables** - Add to Vercel project settings
3. **Build magic link auth** - Complete email-based login
4. **Update Streamlit** - Add entitlements check
5. **Test flow end-to-end** - Login → upgrade → launch app → see Pro features

## 📝 Testing Checklist

- [ ] Can create account with email
- [ ] Receive magic link email
- [ ] Login successfully
- [ ] See correct tier in `/api/entitlements`
- [ ] Upgrade to Pro (payment flow)
- [ ] RevenueCat webhook updates entitlements
- [ ] Launch app with token
- [ ] Streamlit shows Pro features
- [ ] iOS app can authenticate and check entitlements
