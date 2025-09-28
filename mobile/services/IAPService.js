import {
  initConnection,
  purchaseProduct,
  getSubscriptions,
  validateReceiptIos,
  clearProductsIOS,
  endConnection,
  requestSubscription,
  finishTransaction,
  acknowledgePurchaseAndroid,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
} from 'react-native-iap';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Apple IAP Product IDs (must match App Store Connect configuration)
export const SUBSCRIPTION_SKUS = {
  PRO: 'market_scanner_pro_monthly',
  PRO_TRADER: 'market_scanner_pro_trader_monthly'
};

class IAPService {
  constructor() {
    this.purchaseUpdateSubscription = null;
    this.purchaseErrorSubscription = null;
    this.initialized = false;
    this.currentSubscription = null;
    this.currentFeatures = null;
  }

  async initialize() {
    try {
      if (this.initialized) return true;
      
      await initConnection();
      this.initialized = true;
      
      // Set up purchase listeners
      this.purchaseUpdateSubscription = purchaseUpdatedListener((purchase) => {
        this.handlePurchaseUpdate(purchase);
      });
      
      this.purchaseErrorSubscription = purchaseErrorListener((error) => {
        console.warn('IAP Purchase error:', error);
        this.onPurchaseError?.(error);
      });
      
      // Check subscription status on initialization
      await this.checkSubscriptionStatus();
      
      return true;
    } catch (error) {
      console.error('IAP initialization failed:', error);
      return false;
    }
  }

  async getAvailableSubscriptions() {
    try {
      const products = await getSubscriptions(Object.values(SUBSCRIPTION_SKUS));
      return products;
    } catch (error) {
      console.error('Failed to get subscriptions:', error);
      return [];
    }
  }

  async purchaseSubscription(productId) {
    try {
      return await requestSubscription(productId);
    } catch (error) {
      console.error('Subscription purchase failed:', error);
      throw error;
    }
  }

  async restorePurchases() {
    try {
      const purchases = await getAvailablePurchases();
      return purchases;
    } catch (error) {
      console.error('Restore purchases failed:', error);
      throw error;
    }
  }

  async validateReceiptWithServer(purchase) {
    try {
      const response = await fetch('https://market-scanner-1-wesso80.replit.app/api/iap/validate-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receipt: purchase.transactionReceipt,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          platform: 'ios',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server validation failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Receipt validation error:', error);
      return { success: false, error: error.message };
    }
  }

  async handlePurchaseUpdate(purchase) {
    try {
      // Validate receipt with backend
      const validationResult = await this.validateReceiptWithServer(purchase);
      
      if (validationResult.success) {
        // Finish the transaction
        await finishTransaction(purchase);
        
        // Update subscription status locally
        await this.checkSubscriptionStatus();
        
        // Notify success
        this.onPurchaseSuccess?.(purchase, validationResult);
      } else {
        throw new Error('Receipt validation failed');
      }
    } catch (error) {
      console.error('Purchase update handling failed:', error);
      this.onPurchaseError?.(error);
    }
  }

  setCallbacks(onSuccess, onError) {
    this.onPurchaseSuccess = onSuccess;
    this.onPurchaseError = onError;
  }

  async cleanup() {
    try {
      this.purchaseUpdateSubscription?.remove();
      this.purchaseErrorSubscription?.remove();
      
      if (this.initialized) {
        await endConnection();
        this.initialized = false;
      }
    } catch (error) {
      console.error('IAP cleanup failed:', error);
    }
  }

  // Helper method to get subscription tier from product ID
  getSubscriptionTier(productId) {
    switch (productId) {
      case SUBSCRIPTION_SKUS.PRO:
        return 'pro';
      case SUBSCRIPTION_SKUS.PRO_TRADER:
        return 'pro_trader';
      default:
        return 'free';
    }
  }

  // Helper method to check if product is a subscription
  isSubscriptionProduct(productId) {
    return Object.values(SUBSCRIPTION_SKUS).includes(productId);
  }

  // Check subscription status with server
  async checkSubscriptionStatus() {
    try {
      const deviceId = await this.getDeviceId();
      const response = await fetch(`https://market-scanner-1-wesso80.replit.app/api/iap/entitlement?device_id=${deviceId}`);
      
      if (response.ok) {
        const entitlement = await response.json();
        this.currentSubscription = entitlement;
        this.currentFeatures = entitlement.features;
        
        // Store locally for offline access
        await AsyncStorage.setItem('@subscription_status', JSON.stringify(entitlement));
        
        return entitlement;
      }
    } catch (error) {
      console.warn('Failed to check subscription status:', error);
      // Fallback to stored subscription
      const stored = await AsyncStorage.getItem('@subscription_status');
      if (stored) {
        const entitlement = JSON.parse(stored);
        this.currentSubscription = entitlement;
        this.currentFeatures = entitlement.features;
        return entitlement;
      }
    }
    
    // Default to free tier
    const freeEntitlement = {
      tier: 'free',
      status: 'none',
      features: {
        market_scans: 5,
        watchlists: 1,
        alerts: false,
        advanced_charts: false,
        backtesting: false,
        custom_algorithms: false,
        portfolio_tracking: false
      }
    };
    
    this.currentSubscription = freeEntitlement;
    this.currentFeatures = freeEntitlement.features;
    return freeEntitlement;
  }

  // Get current subscription tier
  getCurrentTier() {
    return this.currentSubscription?.tier || 'free';
  }

  // Check if feature is available in current tier
  hasFeature(feature) {
    if (!this.currentFeatures) return false;
    return !!this.currentFeatures[feature];
  }

  // Get feature limit (returns -1 for unlimited)
  getFeatureLimit(feature) {
    if (!this.currentFeatures) return 0;
    return this.currentFeatures[feature] || 0;
  }

  // Get unique device identifier
  async getDeviceId() {
    let deviceId = await AsyncStorage.getItem('@device_id');
    if (!deviceId) {
      // Generate a unique device ID
      deviceId = `ios_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('@device_id', deviceId);
    }
    return deviceId;
  }

  // Restore purchases and update entitlements
  async restorePurchasesWithValidation() {
    try {
      const purchases = await this.restorePurchases();
      
      if (purchases && purchases.length > 0) {
        // Find the most recent subscription purchase
        const subscriptionPurchase = purchases
          .filter(p => this.isSubscriptionProduct(p.productId))
          .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))[0];
        
        if (subscriptionPurchase) {
          // Validate the most recent subscription
          const validationResult = await this.validateReceiptWithServer(subscriptionPurchase);
          
          if (validationResult.success) {
            // Update subscription status
            await this.checkSubscriptionStatus();
            Alert.alert('Success', 'Your subscription has been restored!');
            return true;
          }
        }
      }
      
      Alert.alert('No Subscriptions', 'No active subscriptions found to restore.');
      return false;
    } catch (error) {
      console.error('Restore purchases with validation failed:', error);
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
      return false;
    }
  }
}

// Feature gating utility functions
export const FeatureGate = {
  // Check if user can create more watchlists
  canCreateWatchlist: (currentCount) => {
    const limit = IAPService.getFeatureLimit('watchlists');
    return limit === -1 || currentCount < limit;
  },

  // Check if user can perform market scans
  canPerformScan: (currentCount) => {
    const limit = IAPService.getFeatureLimit('market_scans');
    return limit === -1 || currentCount < limit;
  },

  // Check if advanced features are available
  hasAdvancedCharts: () => IAPService.hasFeature('advanced_charts'),
  hasBacktesting: () => IAPService.hasFeature('backtesting'),
  hasAlerts: () => IAPService.hasFeature('alerts'),
  hasPortfolioTracking: () => IAPService.hasFeature('portfolio_tracking'),
  hasCustomAlgorithms: () => IAPService.hasFeature('custom_algorithms'),

  // Get subscription upgrade prompt
  getUpgradePrompt: (feature) => {
    const prompts = {
      'alerts': 'Upgrade to Pro to enable real-time price alerts',
      'advanced_charts': 'Unlock advanced charting with Pro subscription',
      'backtesting': 'Backtesting requires Pro Trader subscription',
      'custom_algorithms': 'Custom algorithms available with Pro Trader',
      'portfolio_tracking': 'Track your portfolio with Pro subscription'
    };
    return prompts[feature] || 'Upgrade to unlock this feature';
  }
};

const IAPService = new IAPService();
export default IAPService;