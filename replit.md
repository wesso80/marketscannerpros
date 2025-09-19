# Market Scanner Application

## Overview

A comprehensive market scanning application built with Streamlit that analyzes equity and cryptocurrency markets using technical indicators and risk management principles. The application fetches real-time market data via yfinance, performs technical analysis with pandas, and provides ATR-based position sizing recommendations. It features a web dashboard for interactive analysis and supports automated notifications via email and Slack integrations.

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

## External Dependencies

### Market Data APIs
- **yfinance**: Primary data source for equity and cryptocurrency market data
- **Yahoo Finance**: Underlying data provider accessed through yfinance wrapper

### Communication Services
- **SMTP Email Services**: Generic SMTP support for email notifications (configurable providers)
- **Slack Webhooks**: Integration for team-based alerting and notifications

### Python Libraries
- **Streamlit**: Web application framework for dashboard interface
- **Pandas & NumPy**: Data manipulation and numerical computations
- **Plotly**: Interactive charting and visualization
- **Requests**: HTTP client for external API communications
- **psycopg2**: PostgreSQL database connectivity (prepared for future database integration)

### Infrastructure Dependencies
- **Environment Variables**: Configuration management for sensitive credentials
- **File System**: CSV export functionality and temporary data storage