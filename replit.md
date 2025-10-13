# Market Scanner Application

## Overview

A real-time market scanning application that analyzes equities and cryptocurrencies using technical indicators. The system fetches market data via yfinance, calculates ATR-based position sizing, and provides a Streamlit-based dashboard for visualization and analysis. The application supports both equity symbols (AAPL, MSFT) and cryptocurrency pairs (BTC-USD, ETH-USD) with capabilities for data export, email notifications, and Slack integration.

## User Preferences

Preferred communication style: Simple, everyday language.

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