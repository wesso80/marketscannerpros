# MarketScanner Pros - Mobile App Development Specification

**Version:** 1.0  
**Date:** December 13, 2025  
**Platform:** React Native (iOS & Android)

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technical Architecture](#technical-architecture)
3. [Authentication Flow](#authentication-flow)
4. [Core Features](#core-features)
5. [API Integration](#api-integration)
6. [User Interface Requirements](#user-interface-requirements)
7. [Data Storage](#data-storage)
8. [Subscription Management](#subscription-management)
9. [Push Notifications](#push-notifications)
10. [Testing Requirements](#testing-requirements)
11. [Deployment](#deployment)
12. [Third-Party Services](#third-party-services)

---

## 1. Project Overview

MarketScanner Pros is a financial market scanning platform with AI-powered analysis. The mobile app should provide native iOS and Android access to the core scanning features, AI chatbot, portfolio tracking, and trade journal.

### Business Model
- **Free Tier**: Top 10 equities + Top 10 crypto, 5 AI questions/day
- **Pro Tier**: $9.99/mo - Unlimited symbols, 50 AI questions/day
- **Pro Trader Tier**: $19.99/mo - Unlimited AI, real backtesting, TradingView access

### Key Objectives
- Native mobile experience for existing web platform
- Seamless authentication with existing user base
- Real-time market data scanning
- AI chatbot integration (MSP Analyst)
- Portfolio and trade journal management

---

## 2. Technical Architecture

### Tech Stack
```
Framework: React Native (latest stable)
Language: TypeScript
State Management: Redux Toolkit or Zustand
Navigation: React Navigation 6+
HTTP Client: Axios
WebSocket: Socket.io-client (for real-time data)
Storage: AsyncStorage + SQLite (for offline data)
Authentication: JWT tokens in secure storage
```

### Platform Support
- **iOS**: Minimum iOS 14.0+
- **Android**: Minimum API Level 24 (Android 7.0+)

### Architecture Pattern
```
/src
  /components       # Reusable UI components
  /screens          # Screen components (Scanner, Portfolio, Journal, etc.)
  /navigation       # Navigation configuration
  /services         # API calls, WebSocket handlers
  /store            # State management (Redux/Zustand)
  /utils            # Helper functions, constants
  /hooks            # Custom React hooks
  /types            # TypeScript interfaces
  /assets           # Images, fonts, icons
```

---

## 3. Authentication Flow

### Web Authentication Bridge
The app authenticates using the existing Stripe-based system:

1. **Login Screen**: User enters email (must be Stripe customer email)
2. **API Validation**: POST to `/api/auth/login` with email
3. **Response**: Receives JWT token with structure:
   ```typescript
   interface Session {
     cid: string;          // Stripe customer ID
     tier: 'free' | 'pro' | 'pro_trader';
     workspaceId: string;  // UUID for multi-device sync
     exp: number;          // Unix timestamp
   }
   ```
4. **Token Storage**: Store JWT in secure storage (iOS Keychain / Android Keystore)
5. **Auto-Refresh**: Refresh token when < 3 days from expiry

### Session Management
```typescript
// Example API endpoint
POST https://marketscannerpros.app/api/auth/login
Body: { email: "user@example.com" }
Response: { 
  success: true, 
  token: "eyJhbGc...",
  tier: "pro",
  workspaceId: "550e8400-e29b-41d4-a716-446655440000"
}
```

### Logout Flow
- Clear secure storage
- Clear AsyncStorage cache
- Reset Redux/Zustand state
- Navigate to login screen

---

## 4. Core Features

### 4.1 Market Scanner
**Screen:** `/screens/ScannerScreen.tsx`

**Functionality:**
- Asset type selector: Equities (US, AU) / Crypto / Forex
- Timeframe selector: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- Indicator filters:
  - EMA (9, 21, 50, 200)
  - RSI (14 period)
  - MACD (12, 26, 9)
  - Volume (20-day average)
  - ATR (14 period)
- Run scan button
- Results table with columns:
  - Symbol, Price, Score (0-100), RSI, MACD Signal, Volume, Change %
- Tap symbol to view detailed chart

**Tier Restrictions:**
- Free: Top 10 symbols per category
- Pro/Pro Trader: Unlimited symbols
- Display upgrade prompt for free users when scanning

**API Endpoint:**
```typescript
POST /api/scanner/scan
Body: {
  assetType: "equities_us" | "equities_au" | "crypto" | "forex",
  timeframe: "1h",
  indicators: {
    ema_9: true,
    rsi: { enabled: true, oversold: 30, overbought: 70 },
    macd: true,
    volume: true
  }
}
Response: {
  results: [
    {
      symbol: "BTC-USD",
      price: 42150.50,
      score: 87,
      rsi: 58.3,
      macd_signal: "bullish",
      volume_ratio: 1.8,
      change_pct: 3.2
    }
  ],
  scannedAt: "2025-12-13T10:30:00Z"
}
```

### 4.2 MSP Analyst AI Chatbot
**Screen:** `/screens/AnalystScreen.tsx`

**Functionality:**
- Chat interface (WhatsApp/iMessage style)
- Text input with send button
- Display message history (user + AI)
- Show "AI is typing..." indicator
- Display remaining questions for day (Free: 5, Pro: 50, Pro Trader: unlimited)
- Upgrade prompt when limit reached

**API Endpoint:**
```typescript
POST /api/msp-analyst
Headers: { Authorization: "Bearer {token}" }
Body: {
  question: "What's the outlook for tech stocks?",
  conversationHistory: [] // Optional: previous messages
}
Response: {
  answer: "Based on current market conditions...",
  remainingQuestions: 4,  // null for unlimited
  usage: {
    tokensUsed: 1250,
    tier: "free"
  }
}
```

**Error Handling:**
- 429 status: Daily limit reached → Show upgrade modal
- 401 status: Session expired → Redirect to login
- 500 status: Show generic error message

### 4.3 Portfolio Tracker
**Screen:** `/screens/PortfolioScreen.tsx`

**Functionality:**
- Display open positions table:
  - Symbol, Side (Long/Short), Qty, Entry Price, Current Price, P&L, P&L %
- Display closed trades (history)
- Add position form (symbol, side, qty, entry price)
- Close position button (capture exit price)
- Performance summary:
  - Total P&L, Win Rate, Total Trades, Profit Factor
- Export to CSV button
- Clear all data button (with confirmation)

**Data Storage:**
- Use SQLite for local persistence
- Sync with server on app launch (if logged in)
- Real-time price updates via WebSocket

**API Endpoints:**
```typescript
// Fetch positions
GET /api/portfolio/positions?workspaceId={workspaceId}
Response: {
  positions: [...],
  closedTrades: [...]
}

// Add position
POST /api/portfolio/positions
Body: {
  workspaceId: "uuid",
  symbol: "AAPL",
  side: "long",
  quantity: 100,
  entryPrice: 175.50
}

// Close position
PATCH /api/portfolio/positions/{positionId}
Body: {
  exitPrice: 180.25,
  closeDate: "2025-12-13T14:30:00Z"
}
```

### 4.4 Trade Journal
**Screen:** `/screens/JournalScreen.tsx`

**Functionality:**
- Entry form:
  - Date picker, Symbol input, Side (Long/Short)
  - Quantity, Entry Price, Exit Price (auto-calculate P&L)
  - Strategy dropdown (Breakout, Pullback, Trend, Reversal, Scalp, Swing)
  - Setup/Entry notes (multiline text)
  - Trade notes (multiline text)
  - Emotions/Lessons (multiline text)
  - Tags input (comma-separated)
  - Outcome (Win/Loss/Breakeven - auto-determined by P&L)
- Filter buttons: All / Wins / Losses / Breakeven
- Search by symbol or tags
- Stats dashboard (same as portfolio)
- Export to CSV button

**Data Storage:**
- SQLite for local storage
- Server sync for multi-device access

**API Endpoints:**
```typescript
// Fetch journal entries
GET /api/journal/entries?workspaceId={workspaceId}&filter=all
Response: {
  entries: [...]
}

// Add entry
POST /api/journal/entries
Body: {
  workspaceId: "uuid",
  date: "2025-12-13",
  symbol: "BTC-USD",
  side: "long",
  quantity: 0.5,
  entryPrice: 41500,
  exitPrice: 42150,
  pnl: 325,
  pnlPercent: 1.57,
  strategy: "Breakout",
  setup: "4H timeframe...",
  notes: "Entry was clean...",
  emotions: "Confident...",
  tags: ["crypto", "breakout", "4h"],
  outcome: "win"
}
```

### 4.5 Backtesting (Pro Trader Only)
**Screen:** `/screens/BacktestScreen.tsx`

**Functionality:**
- Symbol input
- Date range picker (start/end)
- Strategy selector: EMA Cross, SMA Cross, RSI Reversal, MACD, Bollinger Bands
- Initial capital input
- Run backtest button
- Results display:
  - Total Return %, Win Rate, Total Trades, Profit Factor, Max Drawdown
  - Equity curve chart (line chart)
  - Trade list with entry/exit points
- Export results to CSV

**API Endpoint:**
```typescript
POST /api/backtest
Body: {
  symbol: "AAPL",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  strategy: "ema_cross",
  initialCapital: 10000
}
Response: {
  results: {
    totalReturn: 15.8,
    winRate: 62.5,
    totalTrades: 48,
    profitFactor: 1.82,
    maxDrawdown: -8.3,
    equityCurve: [...],
    trades: [...]
  }
}
```

---

## 5. API Integration

### Base URL
```
Production: https://marketscannerpros.app/api
Staging: https://staging.marketscannerpros.app/api (if available)
```

### Authentication Header
```typescript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Error Handling
```typescript
interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

// Standard error codes:
// 401: Unauthorized (session expired)
// 403: Forbidden (tier restriction)
// 429: Rate limited (AI questions exceeded)
// 500: Server error
```

### WebSocket Connection (Real-Time Data)
```typescript
import io from 'socket.io-client';

const socket = io('wss://marketscannerpros.app', {
  auth: { token: userToken }
});

// Subscribe to price updates
socket.emit('subscribe', { symbols: ['BTC-USD', 'AAPL'] });

// Listen for updates
socket.on('price_update', (data) => {
  // { symbol: 'BTC-USD', price: 42150.50, change: 1.2 }
});
```

---

## 6. User Interface Requirements

### Design System
**Colors:**
```typescript
const colors = {
  primary: '#10B981',      // Green accent
  background: '#0F172A',   // Dark blue background
  surface: '#1E293B',      // Card background
  text: '#F1F5F9',         // Light text
  textSecondary: '#94A3B8', // Secondary text
  error: '#EF4444',        // Red for errors/losses
  success: '#10B981',      // Green for wins
  warning: '#F59E0B'       // Orange for warnings
};
```

**Typography:**
```typescript
const fonts = {
  heading: 'Inter-Bold',
  body: 'Inter-Regular',
  mono: 'RobotoMono-Regular'  // For numbers/prices
};
```

### Component Library
Use React Native Paper or NativeBase for consistent UI components:
- Buttons (primary, secondary, outline)
- Cards (for results, positions, entries)
- Inputs (text, number, date picker)
- Modals (alerts, confirmations)
- Bottom sheets (for filters, actions)
- Toast notifications (success/error messages)

### Navigation
```
Bottom Tab Navigator:
- Scanner (home icon)
- Analyst (chat bubble icon)
- Portfolio (briefcase icon)
- Journal (book icon)
- More (menu icon)

More Screen Stack:
- Backtesting (Pro Trader only)
- Settings
- Subscription
- Help & Support
- Legal (Terms, Privacy, Disclaimer)
```

### Responsive Design
- Support both portrait and landscape orientations
- Tablet layouts with split views (where appropriate)
- Accessibility: VoiceOver/TalkBack support, dynamic font sizes

---

## 7. Data Storage

### Local Storage Strategy
```typescript
// AsyncStorage for simple key-value pairs
import AsyncStorage from '@react-native-async-storage/async-storage';

// Store user preferences
await AsyncStorage.setItem('theme', 'dark');
await AsyncStorage.setItem('defaultTimeframe', '1h');

// SQLite for structured data (portfolio, journal)
import SQLite from 'react-native-sqlite-storage';

const db = SQLite.openDatabase({ name: 'marketscanner.db' });

// Tables:
// - positions (id, symbol, side, qty, entryPrice, currentPrice, pnl)
// - closed_trades (id, symbol, side, qty, entry, exit, pnl, closeDate)
// - journal_entries (id, date, symbol, strategy, notes, outcome)
```

### Data Sync Strategy
1. On app launch: Fetch latest data from server
2. Local changes: Save immediately to SQLite
3. Background sync: Upload local changes to server every 5 minutes
4. Conflict resolution: Server data takes precedence (last-write-wins)

### Offline Support
- Cache scanner results for 15 minutes
- Allow viewing portfolio/journal when offline
- Queue actions (add position, add journal entry) and sync when online
- Show offline indicator in UI

---

## 8. Subscription Management

### Subscription Screen
**Screen:** `/screens/SubscriptionScreen.tsx`

**Display:**
- Current tier badge (Free/Pro/Pro Trader)
- Feature comparison table
- Upgrade buttons (using Stripe Customer Portal)
- Cancel subscription link (Pro/Pro Trader only)
- Billing history

### Stripe Integration
**Do NOT implement in-app purchases (IAP).**  
Use Stripe Customer Portal for all subscription management:

```typescript
// Open Stripe portal in WebView
import { WebView } from 'react-native-webview';

const portalUrl = `https://billing.stripe.com/p/login/{session_id}`;

<WebView
  source={{ uri: portalUrl }}
  onNavigationStateChange={(navState) => {
    // Detect when user completes action and close WebView
  }}
/>
```

**Rationale:** Avoids Apple's 30% IAP fee + maintains single source of truth.

### Tier Validation
```typescript
// Check tier before rendering features
const userTier = useSelector(state => state.auth.tier);

if (userTier === 'free' && scanResults.length > 10) {
  return <UpgradePrompt feature="unlimited symbols" />;
}

if (userTier !== 'pro_trader' && route === '/backtest') {
  return <UpgradePrompt feature="backtesting" tier="pro_trader" />;
}
```

---

## 9. Push Notifications

### Implementation
Use **Firebase Cloud Messaging (FCM)** for both iOS and Android:

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

### Notification Types
1. **AI Limit Reset**: "Your 50 AI questions have been reset for today"
2. **Market Movers**: "AAPL up 5% in the last hour" (Pro Trader only)
3. **Portfolio Alerts**: "Your TSLA position is down 10%" (optional)

### Server Integration
```typescript
POST /api/notifications/register
Body: {
  workspaceId: "uuid",
  fcmToken: "device_fcm_token",
  platform: "ios" | "android"
}

// Server sends notifications via FCM for market updates and system messages
```

### Permission Handling
- Request notification permission on first app launch
- Gracefully handle denied permissions
- Allow enabling/disabling notifications in Settings screen

---

## 10. Testing Requirements

### Unit Tests
- Use Jest + React Native Testing Library
- Test business logic (P&L calculations, indicator scoring)
- Test Redux/Zustand actions and reducers
- Target: 70%+ code coverage

### Integration Tests
- Mock API calls with MSW (Mock Service Worker)
- Test authentication flow end-to-end
- Test data sync (local → server)
- Test WebSocket connections

### E2E Tests
- Use Detox for iOS/Android E2E testing
- Critical flows to test:
  - Login → Run scan → View results
  - Add portfolio position → Update price → Calculate P&L
  - AI chatbot: Ask question → Receive answer

### Manual Testing Checklist
- [ ] Test on iPhone 12+ (iOS 16+)
- [ ] Test on Samsung Galaxy S21+ (Android 12+)
- [ ] Test on tablet (iPad, Android tablet)
- [ ] Test offline mode
- [ ] Test session expiry and refresh
- [ ] Test tier restrictions (free vs paid)
- [ ] Test push notifications
- [ ] Test CSV exports (open files in external apps)

---

## 11. Deployment

### iOS Deployment
1. **Apple Developer Account**: Client provides (needs to add you as developer)
2. **App Store Connect**: Create app listing
3. **Bundle ID**: `com.marketscannerpros.app`
4. **App Name**: "MarketScanner Pros"
5. **Category**: Finance
6. **Screenshots**: Required for 6.5" iPhone, 12.9" iPad
7. **Privacy Policy URL**: https://marketscannerpros.app/legal/privacy
8. **Support URL**: https://marketscannerpros.app/contact

**Build Commands:**
```bash
cd ios
pod install
cd ..
npx react-native run-ios --configuration Release
# Archive and upload via Xcode
```

### Android Deployment
1. **Google Play Console**: Client provides access
2. **Package Name**: `com.marketscannerpros.app`
3. **App Name**: "MarketScanner Pros"
4. **Category**: Finance
5. **Content Rating**: ESRB Everyone (financial content)
6. **Screenshots**: Required for Phone, 7" Tablet, 10" Tablet
7. **Privacy Policy URL**: https://marketscannerpros.app/legal/privacy

**Build Commands:**
```bash
cd android
./gradlew assembleRelease
# Upload to Play Console: android/app/build/outputs/apk/release/app-release.apk
```

### App Store Optimization (ASO)
**Keywords:**
- Stock scanner, crypto scanner, market scanner, trading tools
- AI trading assistant, portfolio tracker, trade journal
- Technical analysis, indicators, backtesting

**Description** (provide to client):
> MarketScanner Pros helps traders find high-probability setups across stocks, crypto, and forex. Scan 1000+ symbols in seconds with proprietary scoring algorithms. Get AI-powered market analysis from MSP Analyst. Track your portfolio P&L and maintain a detailed trade journal. Available on iOS and Android.

---

## 12. Third-Party Services

### Required Services (Client will provide credentials)
1. **API Base URL**: https://marketscannerpros.app/api
2. **WebSocket URL**: wss://marketscannerpros.app
3. **Stripe**: Customer Portal URL (for subscription management)
4. **Firebase**: Client will create Firebase project and share `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)

### Environment Variables
Create `.env` file (use react-native-config):
```bash
# .env.example (for reference, not in repo)
API_BASE_URL=https://marketscannerpros.app/api
WS_URL=wss://marketscannerpros.app
STRIPE_PORTAL_BASE=https://billing.stripe.com/p/login
SENTRY_DSN=  # Optional: For error tracking
```

**Security Note:** Never commit `.env` to version control. Client will provide production values.

---

## Development Timeline Estimate

### Phase 1: Setup & Authentication (Week 1)
- [ ] React Native project initialization
- [ ] Navigation setup (tabs + stack)
- [ ] Authentication flow (login, logout, session management)
- [ ] API service layer with Axios
- [ ] State management setup (Redux/Zustand)

### Phase 2: Core Features (Weeks 2-3)
- [ ] Scanner screen with filters and results
- [ ] MSP Analyst chatbot screen
- [ ] Portfolio tracker (add, edit, close positions)
- [ ] Trade journal (add entries, filters)
- [ ] SQLite database setup and sync logic

### Phase 3: Advanced Features (Week 4)
- [ ] Backtesting screen (Pro Trader only)
- [ ] WebSocket integration for real-time data
- [ ] CSV export functionality
- [ ] Tier restriction enforcement

### Phase 4: Polish & Testing (Week 5)
- [ ] UI/UX refinements
- [ ] Push notifications setup (FCM)
- [ ] Offline mode handling
- [ ] Unit + integration tests
- [ ] E2E test critical flows

### Phase 5: Deployment (Week 6)
- [ ] iOS TestFlight beta
- [ ] Android internal testing track
- [ ] Bug fixes from beta testing
- [ ] App Store submission (iOS)
- [ ] Play Store submission (Android)

**Total Estimate:** 6 weeks for MVP (single developer)

---

## Questions for Client (Before Starting)

1. **Design Assets**: Do you have a Figma file or design mockups? If not, should I follow web platform's design closely?
2. **Firebase Project**: Can you create Firebase project and share config files?
3. **API Documentation**: Is there existing API documentation (Swagger/Postman)?
4. **Test Accounts**: Can you provide test Stripe accounts for each tier (Free/Pro/Pro Trader)?
5. **Push Notification Copy**: What exact messages do you want for each alert type?
6. **App Store Accounts**: When can you add me as developer to Apple/Google accounts?
7. **Error Tracking**: Do you want Sentry integration for production error monitoring?
8. **Analytics**: Should I integrate analytics (Firebase Analytics, Mixpanel)?

---

## Deliverables

### Code
- GitHub repository with complete React Native codebase
- README with setup instructions
- Environment variable template (`.env.example`)
- Build scripts for iOS and Android

### Documentation
- API integration guide (if not provided)
- Local development setup guide
- Deployment guide (TestFlight, Play Console)
- Troubleshooting guide

### App Store Assets
- iOS screenshots (6.5" iPhone, 12.9" iPad)
- Android screenshots (Phone, 7" Tablet, 10" Tablet)
- App icon (1024x1024 PNG)
- Feature graphic (Android: 1024x500)

### Testing
- Jest test suite (unit + integration)
- Detox E2E test suite
- Test report with coverage metrics

---

## Support & Maintenance

### Post-Launch
- 30 days of bug fixes included
- OS updates (iOS 17, Android 14) testing and compatibility
- Performance monitoring recommendations

### Future Enhancements (Out of Scope)
- Apple Watch / Wear OS apps
- Widget support (iOS 16+ / Android 12+)
- Biometric authentication (Face ID / Fingerprint)
- Dark/Light theme toggle
- Multi-language support

---

## Legal & Compliance

### Financial Disclaimers
App must display disclaimer on first launch:
> "MarketScanner Pros is an educational tool. It is not investment advice. Trading involves risk of loss. Past performance does not guarantee future results. Consult a financial advisor before trading."

### Data Privacy
- App collects: Email (for auth), device token (for notifications), usage data (scans, AI questions)
- App does NOT collect: Payment info (handled by Stripe), sensitive personal data
- Data is stored on US servers (Vercel, Render)
- GDPR/CCPA: Users can request data deletion via support email

### Terms of Service
Users must accept Terms on first launch (link to web version).

---

## Contact

For technical questions during development:
- **Project Owner**: [CLIENT TO PROVIDE]
- **Technical Contact**: [CLIENT TO PROVIDE]
- **Support Email**: support@marketscannerpros.app

---

## Appendix: Example API Responses

### Login Response
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tier": "pro",
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2025-12-20T10:30:00Z"
}
```

### Scanner Response
```json
{
  "results": [
    {
      "symbol": "AAPL",
      "price": 178.50,
      "score": 85,
      "rsi": 62.3,
      "macd_signal": "bullish",
      "ema_9": 177.20,
      "ema_21": 175.80,
      "volume_ratio": 1.6,
      "change_pct": 2.1,
      "last_updated": "2025-12-13T14:30:00Z"
    }
  ],
  "scanned_at": "2025-12-13T14:30:15Z",
  "total_symbols": 500,
  "tier_limit": null
}
```

### AI Chatbot Response
```json
{
  "answer": "Based on current market conditions, tech stocks are showing strong momentum. The Nasdaq is up 15% YTD with AI-related companies leading gains. Key support at 15,500. Consider waiting for pullback to 16,000 before adding exposure. Watch Fed policy for headwinds.",
  "remainingQuestions": 47,
  "usage": {
    "tokensUsed": 1850,
    "tier": "pro",
    "resetDate": "2025-12-14T00:00:00Z"
  }
}
```

### Portfolio Response
```json
{
  "positions": [
    {
      "id": "pos_123",
      "symbol": "BTC-USD",
      "side": "long",
      "quantity": 0.5,
      "entryPrice": 41000,
      "currentPrice": 42150,
      "pnl": 575,
      "pnlPercent": 2.80,
      "entryDate": "2025-12-10T09:30:00Z"
    }
  ],
  "closedTrades": [
    {
      "id": "trade_456",
      "symbol": "AAPL",
      "side": "long",
      "quantity": 100,
      "entryPrice": 175.50,
      "exitPrice": 180.25,
      "pnl": 475,
      "pnlPercent": 2.71,
      "entryDate": "2025-12-08T10:00:00Z",
      "exitDate": "2025-12-12T15:30:00Z"
    }
  ],
  "stats": {
    "totalPnl": 1050,
    "winRate": 66.7,
    "totalTrades": 15,
    "profitFactor": 2.1
  }
}
```

---

**End of Specification**

*This document is provided without sensitive credentials. The client will supply API endpoints, authentication tokens, and third-party service credentials separately.*
