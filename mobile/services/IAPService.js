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
}

export default new IAPService();