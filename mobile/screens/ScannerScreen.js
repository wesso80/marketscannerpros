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

const ScannerScreen = () => {
  const [scanResults, setScanResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isFreeTier, setIsFreeTier] = useState(true); // TODO: Get from user subscription

  const defaultSymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN'];

  useEffect(() => {
    runScan();
  }, []);

  const runScan = async () => {
    try {
      setLoading(true);
      const symbols = isFreeTier ? defaultSymbols.slice(0, 10) : defaultSymbols;
      const results = await MarketDataService.getScanResults(symbols, '1D', isFreeTier);
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
      
      {isFreeTier && (
        <View style={styles.freeWarning}>
          <Text style={styles.freeText}>🔒 Upgrade for unlimited scans</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Market Scanner</Text>
        <TouchableOpacity
          style={[styles.scanButton, loading && styles.scanButtonDisabled]}
          onPress={runScan}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.scanButtonText}>🔎 Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {isFreeTier && (
        <View style={styles.tierBanner}>
          <Text style={styles.tierText}>Free Tier - Limited to 10 symbols</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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