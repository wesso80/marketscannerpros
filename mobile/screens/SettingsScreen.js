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

import IAPService, { SUBSCRIPTION_SKUS, FeatureGate } from '../services/IAPService';

const SettingsScreen = () => {
  const [subscriptionStatus, setSubscriptionStatus] = useState('free');
  const [subscriptionFeatures, setSubscriptionFeatures] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    autoRefresh: true,
    soundAlerts: true,
  });

  useEffect(() => {
    initializeIAP();
  }, []);

  const initializeIAP = async () => {
    try {
      setLoading(true);
      await IAPService.initialize();
      await checkSubscriptionStatus();
    } catch (error) {
      console.error('IAP initialization error:', error);
      Alert.alert('Setup Error', 'Unable to initialize payment system.');
    } finally {
      setLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    console.log('Checking subscription status...');
    
    try {
      const entitlement = await IAPService.checkSubscriptionStatus();
      setSubscriptionStatus(entitlement.tier);
      setSubscriptionFeatures(entitlement.features);
      console.log('Current subscription:', entitlement);
    } catch (error) {
      console.error('Failed to check subscription:', error);
      // Fallback to free tier
      setSubscriptionStatus('free');
      setSubscriptionFeatures({
        market_scans: 5,
        watchlists: 1,
        alerts: false,
        advanced_charts: false,
        backtesting: false,
        custom_algorithms: false,
        portfolio_tracking: false
      });
    }
  };

  const restorePurchases = async () => {
    console.log('Restore purchases...');
    
    try {
      setLoading(true);
      
      const success = await IAPService.restorePurchasesWithValidation();
      
      if (success) {
        await checkSubscriptionStatus();
      }
    } catch (error) {
      console.error('Restore failed:', error);
      Alert.alert('Error', 'Failed to restore purchases');
    } finally {
      setLoading(false);
    }
  };

  const purchaseSubscription = async (productId) => {
    try {
      setLoading(true);
      console.log('Purchasing subscription:', productId);
      
      const purchase = await IAPService.purchaseSubscription(productId);
      console.log('Purchase result:', purchase);
      
      // The purchase will be handled by the purchase listener
      // which will validate the receipt and update subscription status
      
    } catch (error) {
      console.error('Purchase failed:', error);
      Alert.alert('Purchase Failed', error.message || 'Unable to complete purchase');
      setLoading(false);
    }
  };

  // Set up IAP callbacks
  useEffect(() => {
    IAPService.setCallbacks(
      async (purchase, validationResult) => {
        console.log('Purchase successful:', purchase);
        Alert.alert('Success!', 'Subscription activated!');
        await checkSubscriptionStatus();
        setLoading(false);
      },
      (error) => {
        console.error('Purchase error:', error);
        Alert.alert('Purchase Error', error.message || 'Purchase failed');
        setLoading(false);
      }
    );
    
    return () => {
      // Cleanup is handled by IAPService
    };
  }, []);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
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

  const isFreeTier = subscriptionStatus === 'free';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 Subscription</Text>
          
          <View style={styles.subscriptionCard}>
            <Text style={styles.currentPlanText}>
              Current Plan: {subscriptionStatus.toUpperCase()}
            </Text>
            
            {subscriptionFeatures && (
              <View style={styles.featuresList}>
                <Text style={styles.featuresTitle}>Your Features:</Text>
                <Text style={styles.featureItem}>
                  📊 Market Scans: {isFreeTier ? '4 symbols' : 'Unlimited'}
                </Text>
                <Text style={styles.featureItem}>
                  📁 Watchlists: ✅ Unlimited
                </Text>
                <Text style={styles.featureItem}>
                  🚨 Alerts: ✅ Unlimited
                </Text>
                <Text style={styles.featureItem}>
                  📈 Advanced Charts: ✅ All features
                </Text>
                <Text style={styles.featureItem}>
                  📊 Backtesting: ✅ Full access
                </Text>
                <Text style={styles.featureItem}>
                  💼 Portfolio: ✅ Complete tracking
                </Text>
              </View>
            )}

            {isFreeTier && (
              <View style={styles.upgradeSection}>
                <TouchableOpacity
                  style={[styles.upgradeButton, loading && styles.disabledButton]}
                  onPress={() => purchaseSubscription(SUBSCRIPTION_SKUS.PRO)}
                  disabled={loading}
                >
                  <Text style={styles.upgradeButtonText}>
                    {loading ? '...' : '🚀 Upgrade to Pro - $4.99/month'}
                  </Text>
                  <Text style={styles.upgradeButtonDesc}>Unlimited symbols (vs 4 symbol limit)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.upgradeButton, styles.proTraderButton, loading && styles.disabledButton]}
                  onPress={() => purchaseSubscription(SUBSCRIPTION_SKUS.PRO_TRADER)}
                  disabled={loading}
                >
                  <Text style={styles.upgradeButtonText}>
                    {loading ? '...' : '💎 Upgrade to Pro Trader - $9.99/month'}
                  </Text>
                  <Text style={styles.upgradeButtonDesc}>Unlimited symbols + priority support</Text>
                </TouchableOpacity>

                <View style={styles.appleNotice}>
                  <Text style={styles.appleNoticeText}>
                    🍎 Subscriptions must be purchased through the iOS app using Apple's In-App Purchase system.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <SettingItem
            title="Push Notifications"
            value={settings.notifications}
            onValueChange={(value) => updateSetting('notifications', value)}
          />
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
          <SettingItem
            title="Sound Alerts"
            value={settings.soundAlerts}
            onValueChange={(value) => updateSetting('soundAlerts', value)}
            disabled={false}
          />
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity
            style={styles.actionItem}
            onPress={restorePurchases}
            disabled={loading}
          >
            <Text style={styles.actionText}>
              {loading ? '🔄 Restoring...' : '🔄 Restore Purchases'}
            </Text>
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

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        )}
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
  subscriptionCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  currentPlanText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  featuresList: {
    backgroundColor: '#F8F9FA',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  featureItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    paddingLeft: 5,
  },
  upgradeSection: {
    marginTop: 15,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  proTraderButton: {
    backgroundColor: '#8B5CF6',
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  upgradeButtonDesc: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
  },
  disabledButton: {
    opacity: 0.6,
  },
  appleNotice: {
    backgroundColor: '#FFE4E1',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  appleNoticeText: {
    fontSize: 12,
    color: '#D73502',
    textAlign: 'center',
    lineHeight: 16,
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
  infoItem: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
});

export default SettingsScreen;