// Market Data Service to connect with Python backend
class MarketDataService {
  constructor() {
    this.baseUrl = 'http://localhost:5000'; // Streamlit backend
  }

  // Get scan results from backend
  async getScanResults(symbols, timeframe = '1D', isFreeTier = true) {
    try {
      const params = new URLSearchParams({
        symbols: symbols.join(','),
        timeframe: timeframe,
        free_tier: isFreeTier
      });

      const response = await fetch(`${this.baseUrl}/api/scan?${params}`);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching scan results:', error);
      throw error;
    }
  }

  // Get price alerts
  async getPriceAlerts() {
    try {
      const response = await fetch(`${this.baseUrl}/api/alerts`);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      throw error;
    }
  }

  // Create price alert
  async createPriceAlert(symbol, alertType, targetPrice, notificationMethod) {
    try {
      const response = await fetch(`${this.baseUrl}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          alert_type: alertType,
          target_price: targetPrice,
          notification_method: notificationMethod
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  }

  // Get portfolio data
  async getPortfolio() {
    try {
      const response = await fetch(`${this.baseUrl}/api/portfolio`);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      throw error;
    }
  }

  // Get chart data
  async getChartData(symbol, timeframe = '1D') {
    try {
      const params = new URLSearchParams({
        symbol: symbol,
        timeframe: timeframe
      });

      const response = await fetch(`${this.baseUrl}/api/chart?${params}`);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching chart data:', error);
      throw error;
    }
  }
}

export default new MarketDataService();