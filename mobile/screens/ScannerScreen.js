import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MarketDataService from '../services/MarketDataService';
import IAPService from '../services/IAPService';

const ScannerScreen = () => {
  const [scanResults, setScanResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    const tierData = await checkSubscriptionTier();
    await runScan(tierData.isFreeTier, 'equity'); // Default to equity scan
  };

  const checkSubscriptionTier = async () => {
    try {
      const entitlement = await IAPService.checkSubscriptionStatus();
      const isFreeTierValue = entitlement.tier === 'free';
      setIsFreeTier(isFreeTierValue);
      setSubscriptionLoaded(true);
      return { isFreeTier: isFreeTierValue };
    } catch (error) {
      console.error('Failed to check subscription:', error);
      setIsFreeTier(true);
      setSubscriptionLoaded(true);
      return { isFreeTier: true };
    }
  };

  // Note: No need for re-scan effect - initializeApp handles first scan
  // If subscription changes (upgrades), it should be handled in upgrade flow

  const defaultEquitySymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN'];
  const defaultCryptoSymbols = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD'];
  
  const [scanType, setScanType] = useState('equity'); // 'equity' or 'crypto'

  const runScan = async (freeTierOverride = null, scanTypeOverride = null) => {
    try {
      setLoading(true);
      const isFree = freeTierOverride !== null ? freeTierOverride : isFreeTier;
      const currentScanType = scanTypeOverride || scanType;
      
      const allSymbols = currentScanType === 'crypto' ? defaultCryptoSymbols : defaultEquitySymbols;
      const symbols = isFree ? allSymbols.slice(0, 4) : allSymbols;
      const timeframe = currentScanType === 'crypto' ? '1h' : '1D'; // Crypto uses 1h, equity uses 1D
      
      const results = await MarketDataService.getScanResults(symbols, timeframe, isFree);
      setScanResults(results?.results || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to run market scan');
      console.error('Scan error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await runScan();
    setRefreshing(false);
  };

  const renderScanItem = ({ item }) => (
    <TouchableOpacity style={styles.scanItem} onPress={() => {}}>
      <View style={styles.scanItemHeader}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={[styles.score, item.score >= 0 ? styles.bullish : styles.bearish]}>
          {item.score > 0 ? '+' : ''}{item.score}
        </Text>
      </View>
      
      <View style={styles.scanItemContent}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>${item.close}</Text>
          <Text style={[styles.direction, item.direction === 'Bullish' ? styles.bullish : styles.bearish]}>
            {item.direction}
          </Text>
        </View>
        
        <View style={styles.indicatorsRow}>
          <Text style={styles.indicator}>RSI: {item.rsi}</Text>
          <Text style={styles.indicator}>ATR: {item.atr}</Text>
        </View>
        
        <View style={styles.positionRow}>
          <Text style={styles.positionText}>Size: {item.size}</Text>
          <Text style={styles.positionText}>Risk: ${item.risk_$}</Text>
        </View>
      </View>
      
      {subscriptionLoaded && isFreeTier && (
        <View style={styles.freeWarning}>
          <Text style={styles.freeText}>🚀 Free tier: 4 symbols • Upgrade for unlimited!</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>📊 Market Scanner</Text>
          <TouchableOpacity
            style={[styles.scanButton, loading && styles.scanButtonDisabled]}
            onPress={() => runScan(null, scanType)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.scanButtonText}>🔎 Scan {scanType === 'crypto' ? 'Crypto' : 'Stocks'}</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Scan Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, scanType === 'equity' && styles.toggleButtonActive]}
            onPress={() => setScanType('equity')}
          >
            <Text style={[styles.toggleText, scanType === 'equity' && styles.toggleTextActive]}>📈 Stocks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, scanType === 'crypto' && styles.toggleButtonActive]}
            onPress={() => setScanType('crypto')}
          >
            <Text style={[styles.toggleText, scanType === 'crypto' && styles.toggleTextActive]}>₿ Crypto</Text>
          </TouchableOpacity>
        </View>
      </View>

      {subscriptionLoaded && isFreeTier && (
        <View style={styles.tierBanner}>
          <Text style={styles.tierText}>Free tier: All features • 4 symbols only • Upgrade for unlimited!</Text>
          <TouchableOpacity style={styles.upgradeButton} onPress={() => {}}>
            <Text style={styles.upgradeText}>Upgrade Pro</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={scanResults}
        renderItem={renderScanItem}
        keyExtractor={(item) => item.symbol}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
    marginBottom: 15,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: 'white',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scanButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
  },
  scanButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  scanButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tierBanner: {
    backgroundColor: '#fff3cd',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tierText: {
    color: '#856404',
    fontSize: 14,
  },
  upgradeButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  upgradeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  scanItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scanItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  score: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bullish: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  bearish: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  scanItemContent: {
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  direction: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  indicatorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  indicator: {
    fontSize: 14,
    color: '#666',
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  positionText: {
    fontSize: 14,
    color: '#666',
  },
  freeWarning: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
  },
  freeText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
  },
});

export default ScannerScreen;