# Market Scanner Application

## Overview

A comprehensive market scanning application built with Streamlit that analyzes equity and cryptocurrency markets using technical indicators and risk management principles. The application fetches real-time market data via yfinance, performs technical analysis with pandas, and provides ATR-based position sizing recommendations. 

**Now transformed into a multi-platform mobile application suite** with:
- **PWA (Progressive Web App)**: Installable web app for immediate mobile distribution
- **Android TWA**: Native Android app for Google Play Store distribution  
- **Capacitor Native Apps**: True iOS and Android apps for both App Store and Play Store

The app features a web dashboard for interactive analysis and supports automated notifications via email and Slack integrations.

**Trade Journal Feature (October 2025):** Comprehensive trading journal for logging trades, tracking performance, and improving through self-analysis. Includes win rate, R-multiple tracking, profit factor calculations, and exportable trade history.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Streamlit Dashboard**: Web-based interface for interactive market analysis and visualization
- **Plotly Integration**: Advanced charting capabilities for technical analysis visualization
- **Real-time Data Display**: Live market data presentation with filtering and sorting capabilities

### Backend Architecture
- **Single-File Design**: Monolithic architecture contained in `market_scanner_app.py` for simplicity and portability
- **Pandas-Based Analysis Engine**: Pure pandas implementation for technical indicator calculations and market scanning
- **Configuration Management**: Dataclass-based configuration system (`ScanConfig`) for centralized settings management
- **Risk Management Module**: ATR-based position sizing calculations with configurable risk parameters

### Data Architecture
- **Market Data Source**: yfinance API for both equity and cryptocurrency data fetching
- **Multi-Timeframe Support**: Configurable timeframes for different asset classes (1D for equities, 1h for crypto)
- **In-Memory Processing**: Pandas DataFrames for data manipulation and analysis
- **CSV Export**: Data persistence through downloadable CSV files

### Notification System
- **Multi-Channel Notifications**: Support for both email (SMTP) and Slack webhook integrations
- **Environment-Based Configuration**: Secure credential management through environment variables
- **Optional Alerting**: Configurable notification system that can be enabled/disabled

### Technical Analysis Framework
- **ATR-Based Calculations**: Average True Range for volatility measurement and position sizing
- **Volume Filtering**: Minimum dollar volume thresholds for liquidity screening
- **Multi-Asset Support**: Unified scanning framework for both equities and cryptocurrencies

### Mobile App Distribution Infrastructure
- **Progressive Web App (PWA)**: Manifest and service worker integration for installable web app experience
- **Android TWA (Trusted Web Activity)**: Bubblewrap-based native Android app for Google Play Store
- **Capacitor Native Apps**: True iOS and Android applications using server-based architecture
- **Multi-Platform Strategy**: Three distribution channels covering all mobile platforms and app stores

### Apple In-App Purchase Integration (NEW)
- **iOS App Store Compliance**: Platform-specific payment flows ensuring Apple Guidelines 3.1.1 compliance
- **React Native IAP**: Full StoreKit integration with react-native-iap library for iOS subscriptions
- **Dual Payment System**: Apple IAP for iOS, Stripe for web/Android - no payment conflicts
- **Receipt Validation**: Comprehensive backend validation with Apple's servers including sandbox fallback
- **Subscription Management**: Native iOS subscription management, restore purchases, and Apple-required features

### Production Infrastructure & Monitoring (NEW - October 3, 2025)
- **Error Monitoring (Sentry)**: Real-time error tracking and performance monitoring with 10% transaction sampling
- **Rate Limiting**: In-memory rate limiter protecting against abuse (60 requests/min, 1000 requests/hour per user)
- **Database Connection Pooling**: psycopg2 SimpleConnectionPool with 1-10 connections, health checks, and exponential backoff retry logic
- **Automated Backups**: Daily PostgreSQL backups with pg_dump, gzip compression, and 7-day retention policy
- **Health Check Endpoint**: Fast health check endpoint for monitoring services (accessed via `?health=check` query parameter)
- **Performance Optimization**: Statement timeout (30s), connection timeout (10s), and SSL requirement for database security

## Recent Changes & Important Fixes (October 2025)

### Trade Journal Feature Added (October 3, 2025)
**Added**: Complete trade journal system for performance tracking and trading improvement
**Features**:
- **Log Trades**: Record entries with symbol, direction, prices, stop loss, take profit, setup type, and reasoning
- **Track Performance**: Automatic P&L calculation, R-multiple tracking, win rate statistics
- **Analyze Results**: Performance stats dashboard with profit factor, avg win/loss, insights
- **Learn from Mistakes**: Dedicated fields for exit reasons and lessons learned
- **Export Data**: CSV export for external analysis
- **Database Schema**: Full PostgreSQL table with indexes for performance
- **Smart Insights**: Automatic performance feedback based on statistics

**Why This Matters**: Trade journals are proven tools for trader improvement. Helps identify what works, what doesn't, and patterns in trading behavior.

### Production Features Added (October 3, 2025)
**Added**: Complete production-ready infrastructure for reliability and monitoring
**Features**:
- Sentry SDK integration for error tracking (requires SENTRY_DSN environment variable)
- Rate limiting system to prevent API abuse and protect server resources
- Database connection pooling already present, verified health checks and retry logic
- Automated daily backup system creating compressed SQL dumps in /tmp/backups
- Comprehensive error handling with Sentry capture for debugging production issues
- Rate limits: 60 requests per minute, 1000 per hour (tracked per workspace_id)

### Code Quality Improvements - LSP Error Fixes (October 3, 2025)
**Issue**: 41 LSP (Language Server Protocol) type checking errors across app.py
**Impact**: Better code quality, improved type safety, easier debugging
**Solution**: 
- Fixed unbound variable in health check endpoint initialization
- Added proper Optional type hints for nullable parameters (workspace_id, period, expires_at, etc.)
- Fixed return type annotations for functions returning Optional[Figure] and Optional[Dict]
- Added type: ignore comments for legitimate type checker limitations (Plotly API, numpy conversions)
- Fixed datetime parameter handling in database queries
- Improved type safety in Stripe and Apple IAP integration functions
- All 41 errors resolved - app now passes full type checking

### Chart Visibility Fix (Critical)
**Issue**: All Plotly charts (pie charts, line charts, technical analysis) were rendering completely black/invisible
**Root Cause**: Overly aggressive CSS and JavaScript were forcing ALL SVG elements to have dark backgrounds
**Solution**: 
- Removed CSS rules that forced `background-color` on SVG elements (lines 106-120 in app.py)
- Updated JavaScript to only style chart CONTAINERS, not SVG content (lines 1171-1182)
- Let Plotly's `template="plotly_dark"` handle chart rendering
- Charts now properly set `paper_bgcolor='#1E293B'` and `plot_bgcolor='#1E293B'` in Python code

### Dropdown & Form Visibility Fix
**Issue**: Dropdown menus and select boxes had white backgrounds with white text (unreadable)
**Solution**: Added comprehensive CSS for dropdown styling (lines 946-982 in app.py)
- Dark backgrounds (#1E293B) for all select boxes and popover menus
- White text (#FFFFFF) for dropdown options
- Hover states with lighter backgrounds (#334155)

### Stripe Checkout Flow Simplification
**Issue**: Multi-step confusing upgrade flow that redirected through broken intermediate pages
**Solution**: Direct Stripe checkout integration (lines 4689-4713, 4784-4806 in app.py)
- Removed Next.js intermediate redirect
- `create_stripe_checkout_session()` called directly from Streamlit
- Auto-redirect to Stripe with single click

**Important**: Do NOT force SVG styling via CSS - always let Plotly control chart rendering through Python configuration.

## External Dependencies

### Market Data APIs
- **yfinance**: Primary data source for equity and cryptocurrency market data
- **Yahoo Finance**: Underlying data provider accessed through yfinance wrapper

### Communication Services
- **SMTP Email Services**: Generic SMTP support for email notifications (configurable providers)
- **Slack Webhooks**: Integration for team-based alerting and notifications

### Mobile Development Frameworks
- **@capacitor/cli**: Command-line interface for native app development
- **@capacitor/core**: Core Capacitor runtime for web-to-native bridge
- **@capacitor/ios**: iOS platform integration for App Store distribution
- **@capacitor/android**: Android platform integration for Play Store distribution
- **@bubblewrap/cli**: Google's TWA (Trusted Web Activity) build tool

### Python Libraries
- **Streamlit**: Web application framework for dashboard interface (now PWA-enabled)
- **Pandas & NumPy**: Data manipulation and numerical computations
- **Plotly**: Interactive charting and visualization
- **Requests**: HTTP client for external API communications
- **psycopg2**: PostgreSQL database connectivity (prepared for future database integration)

### Infrastructure Dependencies
- **Environment Variables**: Configuration management for sensitive credentials (Stripe, Apple IAP)
- **File System**: CSV export functionality and temporary data storage
- **PWA Assets**: Service worker, manifest, and mobile app icons in `/static/` directory
- **Apple IAP Configuration**: App Store Connect product setup for Pro ($4.99) and Pro Trader ($9.99) monthly subscriptions