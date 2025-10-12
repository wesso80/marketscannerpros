# Market Scanner - User Instructions

## Getting Started

Your Market Scanner is a powerful tool that analyzes stocks and cryptocurrencies, helping you find the best trading opportunities. Here's how to use it:

### Accessing the App
- Open your web browser and go to the Market Scanner (it's running on port 5000)
- The app works on desktop and mobile devices
- You can install it as a mobile app through your browser's "Add to Home Screen" option

---

## Main Features Overview

### 🔍 Market Scanner
- Analyzes stocks and crypto to find the best trading opportunities
- Shows you which investments are trending up or down
- Calculates how much you should invest based on your risk tolerance

### 🚨 Price Alerts
- Get notified when a stock or crypto reaches your target price
- Receive alerts via email
- Set alerts for any price above or below current levels

### 📊 Advanced Charts
- View detailed price charts with technical indicators
- Analyze trends, momentum, and trading patterns
- Customize which indicators you want to see

### 💰 Position Sizing
- Automatically calculates how much to invest
- Based on your account size and risk preference
- Helps you never risk too much on one trade

---

## Step-by-Step Usage Guide

### Running Your First Market Scan

1. **Configure Your Settings** (in the left sidebar):
   - **Account Equity**: Enter how much money you have to invest
   - **Risk per Trade**: Set what percentage you're willing to risk (1% is recommended)
   - **Stop Multiplier**: How far your stop-loss should be (1.5x ATR is default)

2. **Choose Your Investments**:
   - **Equity Markets**: Add stock symbols (like AAPL, MSFT, TSLA) - one per line
   - **Crypto Markets**: Add crypto symbols (like BTC-USD, ETH-USD) - one per line

3. **Set Timeframes**:
   - **Stocks**: Usually "1D" (daily) works best
   - **Crypto**: "1h" (hourly) is recommended for faster signals

4. **Run the Scan**:
   - Click the big "Run Scanner" button
   - Wait for the analysis to complete (usually takes 30 seconds)

5. **Read Your Results**:
   - **Score**: Higher scores = better opportunities
   - **Direction**: "Bullish" (buy) or "Bearish" (sell)
   - **Size**: How many shares/coins to buy
   - **Risk $**: How much you could lose if stopped out

### Setting Up Price Alerts

1. **Configure Email Notifications** (in the left sidebar):
   - Enter your email address
   - Click "Test Email" to make sure it works
   - Click "Save Settings" to remember your preferences

2. **Create an Alert**:
   - Scroll down to the "Price Alerts" section
   - Click "New Alert"
   - Enter the symbol (like AAPL or BTC-USD)
   - Choose "above" or "below"
   - Set your target price
   - Click "Create Alert"

3. **Monitor Your Alerts**:
   - Use "Auto Check" to automatically monitor alerts every 5 minutes
   - Or click "Check Now" to manually check prices
   - View active and triggered alerts in the tabs below

### Using Advanced Charts

1. **Select a Symbol**:
   - Either pick from your scan results dropdown
   - Or manually type in any symbol

2. **Choose Chart Settings**:
   - **Timeframe**: How detailed you want (1D for daily, 1h for hourly, etc.)
   - **Period**: How far back to show (3mo, 6mo, 1y, etc.)

3. **Select Indicators**:
   - **EMAs**: Moving averages to show trends
   - **RSI**: Shows if something is overbought or oversold
   - **MACD**: Shows momentum changes
   - **Volume**: Shows trading activity

4. **Generate the Chart**:
   - Click "Generate Chart"
   - Review the technical analysis summary below

---

## Understanding the Results

### Scan Results Explained

**What the Scores Mean:**
- **75-100**: Very strong buy signal
- **25-75**: Moderate buy signal
- **0-25**: Weak buy signal
- **-25-0**: Weak sell signal
- **-75-25**: Moderate sell signal
- **Below -75**: Very strong sell signal

**Key Columns:**
- **Symbol**: The stock or crypto ticker
- **Score**: Overall strength rating
- **Direction**: Whether to buy (Bullish) or sell (Bearish)
- **Close**: Current price
- **RSI**: Momentum indicator (over 70 = overbought, under 30 = oversold)
- **Size**: How many shares/coins to buy with your risk settings
- **Stop**: Where to set your stop-loss order
- **Risk $**: Maximum amount you could lose
- **Notional $**: Total investment amount

### Chart Analysis

**Price Action Indicators:**
- 🟢 **Strong bullish momentum**: Price rising strongly
- 🔵 **Mild bullish momentum**: Price rising slowly
- 🟡 **Consolidation**: Price moving sideways
- 🔴 **Bearish momentum**: Price falling

**RSI Analysis:**
- 🔴 **Overbought (RSI > 70)**: May be due for a pullback
- 🟢 **Oversold (RSI < 30)**: May be due for a bounce
- 🔵 **Bullish momentum (RSI > 50)**: Upward momentum
- 🟡 **Bearish momentum (RSI < 50)**: Downward momentum

---

## Best Practices

### For Beginners
1. **Start Small**: Begin with 1% risk per trade until you're comfortable
2. **Diversify**: Don't put all your money in one investment
3. **Use Alerts**: Set price alerts instead of watching charts all day
4. **Follow the Scores**: Focus on investments with scores above 50
5. **Respect Stop Losses**: Use the calculated stop prices to limit losses

### For Advanced Users
1. **Combine Timeframes**: Use daily charts for trends, hourly for entries
2. **Watch Volume**: High volume confirms price movements
3. **Monitor Market Regime**: Bullish trends (price above EMA200) are safer
4. **Use Position Sizing**: Always use the calculated position sizes
5. **Review Performance**: Download CSV results to track your success

### Risk Management
1. **Never Risk More Than You Can Afford**: The 1% rule is there for a reason
2. **Use Stop Losses**: Always set stops at the calculated levels
3. **Don't Chase**: If you miss an opportunity, wait for the next one
4. **Stay Disciplined**: Follow your plan, don't trade emotionally

---

## Notification Setup

### Email Notifications
1. In the sidebar, expand "Price Alert Notifications"
2. Enter your email address
3. Choose "Email Only" for notification method
4. Click "Test Email" to verify it works
5. Click "Save Settings" to store your preferences

### Scan Result Notifications
1. In the sidebar, expand "Scan Result Notifications"  
2. Check "Email top picks" to get scan results emailed
3. Results will be sent to your configured email address

---

## Troubleshooting

### Common Issues
- **No scan results**: Check that your symbols are correct (AAPL not Apple)
- **Email not working**: Verify your email address and check spam folder
- **Charts not loading**: Try refreshing the page or using a different symbol
- **Slow performance**: Reduce the number of symbols you're scanning

### Getting Help
- Check the "Scoring Methodology" section for how rankings work
- Look at the error tables if some symbols don't load
- Make sure you have an internet connection for real-time data

---

## Data Download

You can download your scan results as CSV files:
- **Individual Results**: Download equity or crypto results separately
- **Combined Results**: Download all results in one file
- **Historical Tracking**: Use timestamps in filenames to track performance over time

---

## Mobile Usage

The Market Scanner works great on mobile devices:
- All features work the same way
- Charts are touch-friendly for zooming and panning
- You can install it as a mobile app for quick access
- Price alerts will notify you even when the app is closed (if using email notifications)

---

*Happy trading! Remember: This tool provides analysis, but you make the final investment decisions. Always do your own research and never invest more than you can afford to lose.*