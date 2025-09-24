/**
 * Apple IAP Subscription Products Configuration
 * These product IDs must exactly match those configured in App Store Connect
 */

export const IAP_PRODUCTS = {
  // Monthly Subscriptions
  PRO_MONTHLY: {
    id: 'market_scanner_pro_monthly',
    type: 'subscription',
    tier: 'pro',
    price: 4.99,
    currency: 'USD',
    period: 'monthly',
    title: 'Market Scanner Pro',
    description: 'Unlimited scans, alerts, advanced charts, and real-time data',
    features: [
      'Unlimited market scans',
      'Advanced charts & indicators',
      'Real-time price alerts', 
      'Portfolio tracking',
      'Priority data refresh'
    ]
  },
  
  PRO_TRADER_MONTHLY: {
    id: 'market_scanner_pro_trader_monthly',
    type: 'subscription',
    tier: 'pro_trader',
    price: 9.99,
    currency: 'USD',
    period: 'monthly',
    title: 'Market Scanner Pro Trader',
    description: 'Everything in Pro plus advanced backtesting and custom algorithms',
    features: [
      'Everything in Pro',
      'Advanced backtesting engine',
      'Custom trading algorithms',
      'Risk management tools',
      'Priority customer support',
      'Advanced portfolio analytics'
    ]
  }
};

// Product ID constants for easy reference
export const PRODUCT_IDS = {
  PRO: IAP_PRODUCTS.PRO_MONTHLY.id,
  PRO_TRADER: IAP_PRODUCTS.PRO_TRADER_MONTHLY.id
};

// Export both for backward compatibility
export const SUBSCRIPTION_SKUS = PRODUCT_IDS;

// Helper functions
export const getProductById = (productId) => {
  return Object.values(IAP_PRODUCTS).find(product => product.id === productId);
};

export const getAllProductIds = () => {
  return Object.values(IAP_PRODUCTS).map(product => product.id);
};

export const getProductTier = (productId) => {
  const product = getProductById(productId);
  return product ? product.tier : 'free';
};

export const formatPrice = (price, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(price);
};

/**
 * App Store Connect Configuration Instructions:
 * 
 * 1. Log in to App Store Connect
 * 2. Select your app
 * 3. Go to Features > In-App Purchases
 * 4. Create Auto-Renewable Subscriptions:
 * 
 *    Product ID: market_scanner_pro_monthly
 *    Reference Name: Market Scanner Pro Monthly
 *    Price: $4.99 USD
 *    Subscription Duration: 1 Month
 *    
 *    Product ID: market_scanner_pro_trader_monthly
 *    Reference Name: Market Scanner Pro Trader Monthly
 *    Price: $9.99 USD
 *    Subscription Duration: 1 Month
 * 
 * 5. Configure localized descriptions for each product
 * 6. Set up subscription groups if needed
 * 7. Submit for review along with your app
 * 
 * Note: These exact product IDs must be used in your app code
 * and match the configuration in App Store Connect.
 */