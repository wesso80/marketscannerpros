import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import * as IAP from 'expo-in-app-purchases';

const PRODUCTS = [
  'com.wesso80.marketscanners.proplan.monthly',
  'com.wesso80.marketscanners.protrader.monthly',
];

export default function IosPurchaseButtons() {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await IAP.connectAsync();
        
        IAP.setPurchaseListener(async ({ responseCode, results }) => {
          if (!mounted) return;
          if (responseCode === IAP.IAPResponseCode.OK && results) {
            for (const p of results) {
              if (!p.acknowledged) {
                try {
                  const r = await fetch('https://app.marketscannerpros.app/api/ios/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ receipt: p.transactionReceipt }),
                  });
                  const data = await r.json();
                  if (data.ok) {
                    Alert.alert('Success', 'Pro access activated.');
                  } else {
                    Alert.alert('Pending', 'Purchase received. Verification in progress.');
                  }
                } catch (e) {
                  Alert.alert('Network', 'Could not reach verification server.');
                }
                await IAP.finishTransactionAsync(p, true);
              }
            }
          }
        });
        
        // Load product details
        const prods = await IAP.getProductsAsync(PRODUCTS);
        if (mounted && prods.results) {
          setProducts(prods.results);
        }
      } catch (e) {
        console.warn('IAP init error', e);
      }
    })();
    return () => { 
      mounted = false; 
      IAP.disconnectAsync();
    };
  }, []);

  async function buy(productId: string) {
    setLoading(true);
    try {
      await IAP.purchaseItemAsync(productId);
    } catch (e: any) {
      Alert.alert('Purchase', e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function restore() {
    setLoading(true);
    try {
      await IAP.getPurchaseHistoryAsync();
      Alert.alert('Restore', 'Purchase history restored');
    } catch (e: any) {
      Alert.alert('Restore', 'No purchases found');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pro Plan */}
      <TouchableOpacity 
        style={styles.button}
        onPress={() => buy(PRODUCTS[0])}
      >
        <Text style={styles.buttonTitle}>🚀 Pro Plan</Text>
        <Text style={styles.buttonPrice}>$4.99/month</Text>
        <Text style={styles.buttonTrial}>7-day free trial</Text>
      </TouchableOpacity>

      {/* Pro Trader */}
      <TouchableOpacity 
        style={[styles.button, styles.proTraderButton]}
        onPress={() => buy(PRODUCTS[1])}
      >
        <Text style={styles.buttonTitle}>💎 Pro Trader</Text>
        <Text style={styles.buttonPrice}>$9.99/month</Text>
        <Text style={styles.buttonTrial}>5-day free trial</Text>
      </TouchableOpacity>

      {/* Restore */}
      <TouchableOpacity 
        style={styles.restoreButton}
        onPress={restore}
      >
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>

      {/* Apple Required Disclaimers */}
      <View style={styles.disclaimerContainer}>
        <Text style={styles.disclaimer}>
          • Payment charged to iTunes Account at confirmation of purchase{'\n'}
          • Subscription auto-renews unless turned off 24hrs before period ends{'\n'}
          • Account charged for renewal within 24hrs prior to end of current period{'\n'}
          • Manage subscriptions in Account Settings after purchase{'\n'}
          • Any unused trial forfeited when purchasing a subscription
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  proTraderButton: {
    backgroundColor: '#5856D6',
  },
  buttonTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  buttonPrice: {
    color: 'white',
    fontSize: 18,
    marginBottom: 4,
  },
  buttonTrial: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  restoreButton: {
    padding: 16,
    alignItems: 'center',
  },
  restoreText: {
    color: '#007AFF',
    fontSize: 16,
  },
  disclaimerContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  disclaimer: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
});
