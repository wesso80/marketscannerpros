# Market Scanner Application

## Overview

A real-time market scanning application that analyzes equities and cryptocurrencies using technical indicators. The system fetches market data via yfinance, calculates ATR-based position sizing, and provides a Streamlit-based dashboard for visualization and analysis. The application supports both equity symbols (AAPL, MSFT) and cryptocurrency pairs (BTC-USD, ETH-USD) with capabilities for data export, email notifications, and Slack integration.

**All features are completely free with no tier restrictions or payments required.**

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **AI Learning Dashboard Added** - Real-time visualization dashboard for TradingView webhook performance
  - New dedicated Streamlit dashboard (`ai_learning_dashboard.py`) on port 5000
  - Live performance metrics: overall winrate, P&L tracking, open positions count
  - Top-performing feature bucket analysis with color-coded winrate tables
  - Cumulative P&L charts showing performance over time
  - Recent closed positions table with entry/exit prices and results
  - Open positions monitoring and recent alerts feed
  - Filterable by symbol, timeframe with auto-refresh capability
  - Interactive Plotly visualizations for bucket performance distribution
- **AI Scanner Webhook API with Learning** - TradingView webhook endpoint with intelligent trade tracking
  - Endpoint: `/ai-scanner/alert` receives POST webhooks and automatically tracks trades
  - Position management: BUY opens LONG, SELL closes LONG and calculates P&L
  - Feature bucket learning: discretizes RSI (bins 0-9), MACD histogram sign, Volume Z-score
  - SQLite database storage (alerts.db) with 3 tables: alerts, positions, bucket_stats
  - `/ai-scanner/positions` endpoint: view open/closed positions with filters
  - `/ai-scanner/metrics` endpoint: overall winrate, last 50 trades, top-performing buckets
  - `/ai-scanner/alerts` endpoint: query historical alerts by symbol/timeframe/side
  - Optional smart filtering: ENABLE_LEARNING_FILTER=true skips low-probability setups
  - LEARN_THRESHOLD environment variable (default 0.55 = 55% winrate minimum)
  - Secured with SECRET environment variable for authentication
  - Supports 10 technical indicators (EMAs, RSI, MACD, ATR, Volume Z-score)
- **Scanner Results Fullscreen View** - Added fullscreen dialog for better data visibility
  - New "🖥️ Fullscreen View" button next to download buttons
  - Shows all results in 600px scrollable table
  - Available for Equity, Crypto, and Commodities scanner results
  - Maintains color-coded Bullish/Bearish highlighting
- **TradingView Scripts Page Added** - New marketing site page showcasing professional TradingView indicators
  - Added `/tradingview-scripts` route to marketing site
  - Featured "Time Confluence Windows — 50% Levels + Next-Close Scanner" indicator
  - Comprehensive documentation with features, usage instructions, and FAQ
  - Added "TradingView" link to header navigation
  - Screenshot and visual examples included
- **Portfolio Chart UI Improvements** - Enhanced Plotly chart readability and layout
  - Toolbar now shows on hover to prevent overlap with titles
  - Centered and bold chart titles with better positioning
  - Legend repositioned to avoid title conflicts (below performance chart, right of pie chart)
  - Increased margins for cleaner visual separation
- **Custom Scanner Settings Reorganized** - Moved settings section in sidebar for better UX
  - Relocated between Commodities and Timeframes sections
  - All dropdown-based settings for clear value visibility
  - Maintains scoring explanation (Score ≥ 0 = Bullish, < 0 = Bearish)
- **Streamlit Config Updated** - Fixed WebSocket connection issues for deployed sites
  - Removed hardcoded serverAddress causing deployment failures
  - Disabled CORS and XSRF for better Replit compatibility
  - Enabled WebSocket compression
- **Options/Margin Trading Support Added** - Trade Journal now fully supports margin and options trading
  - Added Options, Futures, and Margin trade types (in addition to Spot)
  - Options-specific fields: Option Type (CALL/PUT), Premium per Contract, Number of Contracts, Contract Multiplier, Strike Price
  - Automatic P&L calculations with contract multipliers (e.g., 100 contracts × 100 shares = 10,000 share position)
  - Dynamic UI shows appropriate fields based on trade type selection
  - Trade history displays options details correctly with proper labeling
- **FREE_FOR_ALL_MODE fully implemented** - Local check in auth_helper.py grants everyone Pro access (no API calls needed)
- **Removed legacy tier system** - Simplified from Free/Pro/Pro Trader to just Free/Pro model
- **Section reorganization** - Reordered app flow: Portfolio (free) → Price Alerts (Pro) → Trade Journal (Pro) → Backtesting (Pro)
- **Added RevenueCat authentication system** - Ready for subscription payments when enabled
- **Authentication infrastructure complete** - JWT tokens, entitlements API, app token bridge
- **Integrated auth into Streamlit** - Pro feature checks ready (trade journal, alerts, email)
- **Marketing site ready** - Pricing displayed, launch flow configured
- **Reduced dependencies** from 11 to 10 packages (removed stripe)

## System Architecture

### Application Framework
- **Frontend/Dashboard**: Streamlit-based web interface providing real-time market data visualization and interactive controls
- **Data Processing**: Pure pandas-based data pipeline for market analysis and technical indicator calculations
- **Deployment Strategy**: Autoscale-ready architecture with health check endpoint optimization

### Performance Optimization
- **Lazy Loading Pattern**: Heavy dependencies (pandas, numpy, yfinance, psycopg2, plotly) are imported only after health check validation to ensure sub-second health endpoint responses
- **Health Check First**: Ultra-fast health check endpoint processes query parameters before any module imports, critical for autoscale deployment environments
- **Query Parameter Detection**: Multiple fallback mechanisms to detect health check requests across different Streamlit versions

### Data Architecture
- **Market Data Source**: yfinance API for real-time and historical market data retrieval
- **Data Storage**: PostgreSQL database with connection pooling via psycopg2
- **Data Format**: Pandas DataFrames for in-memory processing and CSV export capability

### Technical Indicators & Analysis
- **Position Sizing**: ATR (Average True Range) based position sizing calculations
- **Risk Management**: Volatility-based position calculations to manage portfolio risk
- **Multi-Asset Support**: Unified processing pipeline for both traditional equities and cryptocurrency markets

### Visualization Layer
- **Charting**: Plotly for interactive financial charts and technical analysis visualizations
- **QR Code Generation**: PIL and qrcode libraries for generating shareable QR codes
- **Data Export**: CSV download functionality for offline analysis

### Integration Architecture
- **Notification Systems**: 
  - Email notifications for market alerts and summaries
  - Slack webhook integration for team collaboration
- **External APIs**: REST-based integrations via requests library

### Database Design
- **Connection Management**: psycopg2 connection pooling for efficient database resource utilization
- **Cursor Strategy**: RealDictCursor for dictionary-based result sets enabling cleaner data handling
- **Timezone Handling**: dateutil.tz and datetime.timezone for proper temporal data management across markets

### Deployment Considerations
- **Health Endpoint**: Implements `/health` query parameter check returning JSON status without database dependencies
- **Environment Configuration**: OS environment variables for sensitive configuration (database credentials, API keys)
- **Stateless Design**: Application designed for horizontal scaling in autoscale environments

### Authentication & Subscription Architecture
- **RevenueCat Integration**: Subscription management via RevenueCat SDK
  - Monthly subscription: $4.99/month
  - Annual subscription: $39.99/year (33% savings)
  - Entitlement: "pro" grants access to all premium features
- **FREE_FOR_ALL_MODE**: Environment variable (default: true) grants everyone Pro access during development
  - Implemented locally in `auth_helper.py` for instant Pro access without API calls
  - Set `FREE_FOR_ALL_MODE=false` to enable subscription checking
- **JWT Authentication**: Token-based authentication for secure API communication
  - Marketing site generates JWT tokens via `/api/app-token`
  - Tokens include user ID, email, and tier information
  - 30-minute expiration for security
- **Entitlements API**: `/api/entitlements` endpoint returns user subscription status
  - Checks RevenueCat for active subscriptions
  - Falls back to free tier on errors
  - Returns: `{tier: "free"|"pro", status: "active"|"expired"}`
- **Streamlit Integration**: `auth_helper.py` module handles subscription checks
  - FREE_FOR_ALL_MODE check happens first (local, instant)
  - Reads token from URL query parameters if mode disabled
  - Calls entitlements API to verify subscription if mode disabled
  - Protects premium features: Price Alerts, Trade Journal, Backtesting
  - Portfolio Tracking is FREE for everyone
  - Shows upgrade prompts for free tier users
- **Launch Flow**: Marketing site → Streamlit app with token parameter
  - User clicks "Get Started" or "Upgrade to Pro"
  - Marketing site redirects to: `streamlit-app.replit.app?token=xyz`
  - Streamlit reads token and checks subscription
  - Shows/hides features based on tier

## External Dependencies

### Market Data Provider
- **yfinance**: Yahoo Finance API wrapper for fetching equity and cryptocurrency market data, historical prices, and fundamental information

### Database
- **PostgreSQL**: Primary relational database for persistent storage
- **psycopg2**: PostgreSQL adapter with connection pooling and RealDictCursor support

### Data Processing & Analysis
- **pandas**: Core data manipulation and analysis library
- **numpy**: Numerical computing for technical indicator calculations

### Visualization & UI
- **Streamlit**: Web application framework for dashboard interface
- **Plotly**: Interactive charting library for financial visualizations
- **PIL (Pillow)**: Image processing for QR code generation
- **qrcode**: QR code generation library

### Communication & Notifications
- **requests**: HTTP library for Slack webhook integration and external API calls
- **Email**: Built-in Python email capabilities (implied from feature description)

### Utilities
- **dateutil**: Advanced date/time parsing and timezone handling
- **dataclasses**: Type-safe data structure definitions
- **json**: JSON serialization for API responses and configuration
- **base64**: Encoding for image embedding and data transmission