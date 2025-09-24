import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
} from 'react-native-iap';

import { PRODUCT_IDS } from '../config/IAPProducts';

const SettingsScreen = () => {
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    autoRefresh: true,
    soundAlerts: true,
  });

  // Initialize Apple IAP connection
  useEffect(() => {
    initializeIAP();
    return () => {
      endConnection();
    };
  }, []);

  const initializeIAP = async () => {
    try {
      setIsLoading(true);
      await initConnection();
      
      // Get available subscription products
      const products = await getSubscriptions(Object.values(PRODUCT_IDS));
      setSubscriptions(products);
      
      // Check current subscription status
      await checkSubscriptionStatus();
      
      // Set up purchase listeners
      const purchaseUpdateSubscription = purchaseUpdatedListener((purchase) => {
        handlePurchaseUpdate(purchase);
      });
      
      const purchaseErrorSubscription = purchaseErrorListener((error) => {
        console.warn('Purchase error:', error);
        Alert.alert('Purchase Error', 'Unable to complete purchase. Please try again.');
        setIsLoading(false);
      });
      
      return () => {
        purchaseUpdateSubscription?.remove();
        purchaseErrorSubscription?.remove();
      };
    } catch (error) {
      console.error('IAP initialization error:', error);
      Alert.alert('Setup Error', 'Unable to initialize payment system.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    // TODO: Check subscription status from backend
    // This would typically involve validating receipts with your server
    console.log('Checking subscription status...');
  };

  const handlePurchaseUpdate = async (purchase) => {
    try {
      setIsLoading(true);
      
      // Validate receipt with backend
      const validationResult = await validateReceiptWithBackend(purchase);
      
      if (validationResult.success) {
        // Update local subscription state
        const planType = purchase.productId === PRODUCT_IDS.PRO ? 'pro' : 'pro_trader';
        setCurrentSubscription(planType);
        setIsFreeTier(false);
        
        // Finish the transaction
        await finishTransaction(purchase);
        
        Alert.alert(
          '🎉 Purchase Successful!',
          `Welcome to Market Scanner ${planType === 'pro' ? 'Pro' : 'Pro Trader'}! Your subscription is now active.`,
          [{ text: 'OK', onPress: () => setIsLoading(false) }]
        );
      } else {
        throw new Error('Receipt validation failed');
      }
    } catch (error) {
      console.error('Purchase update error:', error);
      Alert.alert('Purchase Error', 'Unable to validate purchase. Please contact support.');
      setIsLoading(false);
    }
  };

  const validateReceiptWithBackend = async (purchase) => {
    try {
      // TODO: Replace with actual backend API call
      const response = await fetch('https://market-scanner-1-wesso80.replit.app/api/validate-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receipt: purchase.transactionReceipt,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
        }),
      });
      
      return await response.json();
    } catch (error) {
      console.error('Receipt validation error:', error);
      return { success: false, error: error.message };
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const upgradeToProTier = async () => {
    try {
      setIsLoading(true);
      await requestSubscription(PRODUCT_IDS.PRO);
    } catch (error) {
      console.error('Pro subscription error:', error);
      Alert.alert('Subscription Error', 'Unable to start Pro subscription. Please try again.');
      setIsLoading(false);
    }
  };

  const upgradeToProTrader = async () => {
    try {
      setIsLoading(true);
      await requestSubscription(PRODUCT_IDS.PRO_TRADER);
    } catch (error) {
      console.error('Pro Trader subscription error:', error);
      Alert.alert('Subscription Error', 'Unable to start Pro Trader subscription. Please try again.');
      setIsLoading(false);
    }
  };

  const restorePurchases = async () => {
    try {
      setIsLoading(true);
      Alert.alert('Restore Purchases', 'Restoring your previous purchases...', [], { cancelable: false });
      
      // TODO: Implement restore purchases logic
      // This would typically involve checking with Apple's servers
      // and validating any existing subscriptions
      
      setTimeout(() => {
        setIsLoading(false);
        Alert.alert('Restore Complete', 'Previous purchases have been restored.');
      }, 2000);
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert('Restore Error', 'Unable to restore purchases. Please try again.');
      setIsLoading(false);
    }
  };

  const manageSubscriptions = () => {
    Alert.alert(
      'Manage Subscriptions',
      'To manage your subscriptions, go to Settings > [Your Name] > Subscriptions on your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => {
          // In a real app, this would open iOS subscription settings
          // Linking.openURL('App-Prefs:APPLE_ID&path=SUBSCRIPTIONS');
          console.log('Would open iOS subscription settings');
        }}
      ]
    );
  };

  const SettingItem = ({ title, value, onValueChange, disabled = false }) => (
    <View style={[styles.settingItem, disabled && styles.disabledSetting]}>
      <Text style={[styles.settingText, disabled && styles.disabledText]}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#767577', true: '#007AFF' }}
        thumbColor={value ? '#ffffff' : '#f4f3f4'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          
          {isFreeTier ? (
            <View style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <Text style={styles.tierTitle}>📱 Free Tier</Text>
                <Text style={styles.tierStatus}>Active</Text>
              </View>
              <Text style={styles.tierDescription}>Limited features</Text>
              
              <View style={styles.upgradeOptions}>
                <TouchableOpacity
                  style={[styles.upgradeCard, isLoading && styles.disabledCard]}
                  onPress={upgradeToProTier}
                  disabled={isLoading}
                >
                  <Text style={styles.upgradeTitle}>🍎 Pro ($4.99/mo)</Text>
                  <Text style={styles.upgradeFeatures}>
                    • Unlimited scans & alerts{'\n'}
                    • Advanced charts{'\n'}
                    • Real-time data{'\n'}
                    • Full portfolio tracking
                  </Text>
                  <View style={[styles.upgradeButton, isLoading && styles.disabledButton]}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.upgradeButtonText}>Subscribe via Apple</Text>
                    )}
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.upgradeCard, isLoading && styles.disabledCard]}
                  onPress={upgradeToProTrader}
                  disabled={isLoading}
                >
                  <Text style={styles.upgradeTitle}>🍎 Pro Trader ($9.99/mo)</Text>
                  <Text style={styles.upgradeFeatures}>
                    • Everything in Pro{'\n'}
                    • Advanced backtesting{'\n'}
                    • Custom algorithms{'\n'}
                    • Priority support
                  </Text>
                  <View style={[styles.upgradeButton, isLoading && styles.disabledButton]}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.upgradeButtonText}>Subscribe via Apple</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <Text style={styles.tierTitle}>🚀 Pro Tier</Text>
                <Text style={styles.tierStatus}>Active</Text>
              </View>
              <Text style={styles.tierDescription}>All features unlocked</Text>
            </View>
          )}
        </View>

        {/* Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <SettingItem
            title="Push Notifications"
            value={settings.notifications}
            onValueChange={(value) => updateSetting('notifications', value)}
          />
          <SettingItem
            title="Sound Alerts"
            value={settings.soundAlerts}
            onValueChange={(value) => updateSetting('soundAlerts', value)}
            disabled={isFreeTier}
          />
          {isFreeTier && (
            <Text style={styles.upgradeNote}>🔒 Sound alerts require Pro subscription</Text>
          )}
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <SettingItem
            title="Dark Mode"
            value={settings.darkMode}
            onValueChange={(value) => updateSetting('darkMode', value)}
          />
          <SettingItem
            title="Auto Refresh"
            value={settings.autoRefresh}
            onValueChange={(value) => updateSetting('autoRefresh', value)}
          />
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          {!isFreeTier && (
            <TouchableOpacity style={styles.actionItem} onPress={manageSubscriptions}>
              <Text style={styles.actionText}>⚙️ Manage Subscription</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.actionItem} onPress={restorePurchases}>
            <Text style={styles.actionText}>🔄 Restore Purchases</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem}>
            <Text style={styles.actionText}>📧 Support</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem}>
            <Text style={styles.actionText}>📋 Terms of Service</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem}>
            <Text style={styles.actionText}>🔒 Privacy Policy</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.actionItem, styles.dangerAction]}>
            <Text style={styles.dangerText}>🚪 Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>Version: 1.0.0</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>Build: 2025.01.01</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginVertical: 8,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tierCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tierStatus: {
    backgroundColor: '#28a745',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tierDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  upgradeOptions: {
    gap: 12,
  },
  upgradeCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  upgradeFeatures: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  upgradeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  disabledSetting: {
    opacity: 0.5,
  },
  settingText: {
    fontSize: 16,
    color: '#333',
  },
  disabledText: {
    color: '#999',
  },
  upgradeNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  actionItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionText: {
    fontSize: 16,
    color: '#333',
  },
  dangerAction: {
    borderBottomWidth: 0,
  },
  dangerText: {
    fontSize: 16,
    color: '#dc3545',
  },
  infoItem: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
  },
  disabledCard: {
    opacity: 0.6,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default SettingsScreen;