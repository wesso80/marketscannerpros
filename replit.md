# Market Scanner Application

## Overview

A comprehensive market scanning application built with Streamlit that analyzes equity and cryptocurrency markets using technical indicators and risk management principles. The application fetches real-time market data via yfinance, performs technical analysis with pandas, and provides ATR-based position sizing recommendations. 

**Now transformed into a multi-platform mobile application suite** with:
- **PWA (Progressive Web App)**: Installable web app for immediate mobile distribution
- **Android TWA**: Native Android app for Google Play Store distribution  
- **Capacitor Native Apps**: True iOS and Android apps for both App Store and Play Store

The app features a web dashboard for interactive analysis and supports automated notifications via email and Slack integrations.

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