# Vercel Deployment Guide

## Prerequisites
1. A Vercel account (https://vercel.com)
2. Your MarketScanner Pro repository on GitHub/GitLab
3. Stripe account with live keys for production

## Quick Deploy Steps

### 1. Connect Repository to Vercel
1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Import your Git repository
4. Select the `marketscanner-web` folder as the root directory

### 2. Configure Environment Variables
In Vercel dashboard, go to Project Settings → Environment Variables and add:

**Required:**
- `NEXT_PUBLIC_APP_URL` = https://your-domain.vercel.app
- `STRIPE_SECRET_KEY` = your_live_stripe_secret_key
- `STRIPE_PUBLISHABLE_KEY` = your_live_stripe_publishable_key
- `NEXTAUTH_URL` = https://your-domain.vercel.app
- `NEXTAUTH_SECRET` = generate_random_secret_32_chars
- `GOOGLE_CLIENT_ID` = your_google_oauth_client_id
- `GOOGLE_CLIENT_SECRET` = your_google_oauth_client_secret

**Optional:**
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` = your-domain.com

### 3. Deploy
1. Click "Deploy" in Vercel
2. Wait for build completion
3. Your app will be live at your-project.vercel.app

### 4. Custom Domain (Optional)
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed by Vercel

## Build Configuration
The project is pre-configured with:
- `vercel.json` for deployment settings
- `next.config.ts` optimized for production
- `.vercelignore` to exclude unnecessary files

## Environment-Specific Features
- Analytics (Plausible) loads only with user consent
- CORS configuration for external origins
- Stripe billing portal integration
- NextAuth for Google OAuth

## Troubleshooting
- Ensure all environment variables are set
- Check Vercel build logs for any errors
- Verify Stripe webhook endpoints if using subscriptions
- Test authentication flow after deployment