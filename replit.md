# Market Scanner Application

## Overview
A multi-platform market scanning application that analyzes equity and cryptocurrency markets using technical indicators and risk management. It fetches real-time data, performs technical analysis, and provides ATR-based position sizing. The application includes a web dashboard, automated notifications, and a comprehensive trade journal. It is distributed as a Progressive Web App (PWA), Android TWA, and Capacitor-based native iOS/Android apps, targeting both mobile and web platforms for broad accessibility.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Streamlit Dashboard**: Interactive web-based interface.
- **Plotly Integration**: Advanced charting for technical analysis visualization.
- **Real-time Data Display**: Live market data with filtering and sorting.
- **PWA Integration**: Installable web app experience with manifest and service worker.
- **Dark Theme**: Consistent dark backgrounds for all UI elements and charts.

### Technical Implementations
- **Single-File Design**: Monolithic `market_scanner_app.py` for simplicity.
- **Pandas-Based Analysis**: Core engine for technical indicator calculations.
- **Dataclass Configuration**: `ScanConfig` for centralized settings.
- **ATR-Based Risk Management**: Position sizing with configurable risk parameters.
- **Multi-Timeframe Support**: Configurable timeframes for different asset classes.
- **Multi-Channel Notifications**: Email (SMTP) and Slack webhook integrations.
- **Trade Journal**: PostgreSQL-backed system for logging trades, tracking performance (P&L, R-multiple, win rate), and self-analysis.
- **Stable Workspace ID**: Stripe-based, signed cookie system for persistent user data across sessions and devices.
- **Trial Abuse Prevention**: Three-layer system involving email collection, trial tracking database, and pre-checkout validation.
- **TradingView Integration**: System for Pro Trader members to submit TradingView usernames for invite-only script access, with admin email notifications.
- **In-App Purchase (IAP)**: Apple StoreKit integration for iOS subscriptions (via `react-native-iap`) and Stripe for web/Android.
- **Error Monitoring**: Sentry integration for real-time error tracking and performance monitoring.
- **Rate Limiting**: In-memory rate limiter (60 requests/min, 1000 requests/hour per user).
- **Database Connection Pooling**: `psycopg2` pool with health checks and retry logic.
- **Automated Backups**: Daily PostgreSQL backups with `pg_dump` and 7-day retention.
- **Health Check Endpoint**: For monitoring services.
- **Code Quality**: Extensive type hinting and LSP error resolution for improved maintainability.

### System Design Choices
- **Multi-Platform Strategy**: PWA, Android TWA, and Capacitor for comprehensive mobile and web distribution.
- **Secure Configuration**: Environment variables for sensitive credentials.
- **Data Persistence**: CSV export and PostgreSQL for trade journal.
- **Scalability**: Designed with production features like rate limiting, connection pooling, and error monitoring.
- **Legal Compliance**: Integrated legal documentation (Terms of Service, Privacy Policy, Refund Policy, Cookie Policy) addressing trial policies, data collection, and platform-specific guidelines.

## External Dependencies

### Market Data APIs
- **yfinance**: Equity and cryptocurrency market data.
- **Yahoo Finance**: Underlying data provider for yfinance.

### Communication Services
- **SMTP Email Services**: For email notifications.
- **Slack Webhooks**: For team notifications.

### Mobile Development Frameworks
- **@capacitor/cli**, **@capacitor/core**, **@capacitor/ios**, **@capacitor/android**: For native mobile app development.
- **@bubblewrap/cli**: For Android TWA creation.

### Python Libraries
- **Streamlit**: Web application framework.
- **Pandas & NumPy**: Data manipulation and numerical operations.
- **Plotly**: Interactive charting.
- **Requests**: HTTP client.
- **psycopg2**: PostgreSQL database adapter.

### Infrastructure Dependencies
- **Stripe**: Payment processing for subscriptions and managing workspace IDs.
- **Apple App Store Connect**: For iOS in-app purchase configuration.
- **Sentry**: Error tracking and performance monitoring.
- **PostgreSQL**: Database for trade journaling and system data.
- **Environment Variables**: For sensitive credentials (e.g., `APP_SIGNING_SECRET`, `SENTRY_DSN`).