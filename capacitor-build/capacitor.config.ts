export default {
  appId: "com.marketscanner.pro",
  appName: "Market Scanner Pro",
  server: { 
    url: "https://market-scanner-1-wesso80.replit.app", 
    cleartext: false,
    allowNavigation: ["market-scanner-1-wesso80.replit.app", "*.replit.app"]
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
    appendUserAgent: "MarketScannerPro/1.0"
  }
}