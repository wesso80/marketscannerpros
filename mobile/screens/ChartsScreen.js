import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IAPService from '../services/IAPService';

const ChartsScreen = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [timeframe, setTimeframe] = useState('1D');
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  React.useEffect(() => {
    checkSubscriptionTier();
  }, []);

  const checkSubscriptionTier = async () => {
    try {
      const entitlement = await IAPService.checkSubscriptionStatus();
      setIsFreeTier(entitlement.tier === 'free');
      setSubscriptionLoaded(true);
    } catch (error) {
      console.error('Failed to check subscription:', error);
      setIsFreeTier(true);
      setSubscriptionLoaded(true);
    }
  };

  const timeframes = ['1D', '1H', '30M', '15M', '5M'];
  const popularSymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];

  const loadChart = async () => {
    // NEW STRATEGY: All chart features work for everyone

    try {
      // TODO: Load chart data from backend
      Alert.alert('Chart Loading', `Loading ${selectedSymbol} ${timeframe} chart...`);
    } catch (error) {
      Alert.alert('Error', 'Failed to load chart data');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📈 Charts</Text>
        <TouchableOpacity
          style={styles.loadButton}
          onPress={loadChart}
        >
          <Text style={styles.loadButtonText}>Load</Text>
        </TouchableOpacity>
      </View>

      {subscriptionLoaded && isFreeTier && (
        <View style={styles.tierBanner}>
          <Text style={styles.tierText}>Free Tier: All features • 4 symbols only • Upgrade for more!</Text>
          <TouchableOpacity style={styles.upgradeButton}>
            <Text style={styles.upgradeText}>Upgrade Pro</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.symbolSection}>
          <Text style={styles.sectionLabel}>Symbol</Text>
          <TextInput
            style={styles.symbolInput}
            value={selectedSymbol}
            onChangeText={setSelectedSymbol}
            placeholder="Enter symbol"
            autoCapitalize="characters"
          />
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.popularSymbols}>
            {popularSymbols.map((symbol) => (
              <TouchableOpacity
                key={symbol}
                style={[
                  styles.symbolChip,
                  selectedSymbol === symbol && styles.selectedSymbolChip
                ]}
                onPress={() => setSelectedSymbol(symbol)}
              >
                <Text style={[
                  styles.symbolChipText,
                  selectedSymbol === symbol && styles.selectedSymbolChipText
                ]}>
                  {symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.timeframeSection}>
          <Text style={styles.sectionLabel}>Timeframe</Text>
          <View style={styles.timeframeButtons}>
            {timeframes.map((tf) => (
              <TouchableOpacity
                key={tf}
                style={[
                  styles.timeframeButton,
                  timeframe === tf && styles.selectedTimeframe,
                  false && styles.disabledButton
                ]}
                onPress={() => setTimeframe(tf)}
                disabled={false}
              >
                <Text style={[
                  styles.timeframeButtonText,
                  timeframe === tf && styles.selectedTimeframeText,
                  false && styles.disabledText
                ]}>
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <View style={styles.placeholderChart}>
          <Text style={styles.placeholderText}>📊</Text>
          <Text style={styles.placeholderSubtext}>
            {selectedSymbol} {timeframe} Chart
          </Text>
          <Text style={styles.placeholderNote}>
            Chart will display here
          </Text>
          
          {subscriptionLoaded && isFreeTier && (
            <View style={styles.featureList}>
              <Text style={styles.featureTitle}>🚀 You have ALL features!</Text>
              <Text style={styles.featureItem}>• Intraday charts (5m, 15m, 30m) ✓</Text>
              <Text style={styles.featureItem}>• Advanced technical indicators ✓</Text>
              <Text style={styles.featureItem}>• Volume analysis ✓</Text>
              <Text style={styles.featureItem}>• Bollinger Bands & MACD ✓</Text>
              <Text style={styles.featureItem}>• Only limited to 4 symbols • Upgrade for unlimited!</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.indicatorsSection}>
        <Text style={styles.sectionLabel}>Technical Indicators</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {['RSI', 'MACD', 'EMA', 'BB', 'Volume'].map((indicator) => (
            <TouchableOpacity
              key={indicator}
              style={[
                styles.indicatorChip,
                false && styles.disabledChip
              ]}
              disabled={false}
            >
              <Text style={[
                styles.indicatorChipText,
                false && styles.disabledText
              ]}>
                {indicator}
                {''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
  loadButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  loadButtonText: {
    color: 'white',
    fontWeight: 'bold',
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
  controls: {
    backgroundColor: 'white',
    padding: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  symbolSection: {
    marginBottom: 20,
  },
  symbolInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  popularSymbols: {
    flexDirection: 'row',
  },
  symbolChip: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  selectedSymbolChip: {
    backgroundColor: '#007AFF',
  },
  symbolChipText: {
    color: '#666',
    fontWeight: 'bold',
  },
  selectedSymbolChipText: {
    color: 'white',
  },
  timeframeSection: {
    marginBottom: 20,
  },
  timeframeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timeframeButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedTimeframe: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    backgroundColor: '#e9ecef',
    opacity: 0.5,
  },
  timeframeButtonText: {
    color: '#666',
    fontWeight: 'bold',
  },
  selectedTimeframeText: {
    color: 'white',
  },
  disabledText: {
    color: '#aaa',
  },
  chartContainer: {
    flex: 1,
    margin: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  placeholderChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderSubtext: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  placeholderNote: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  featureList: {
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    width: '100%',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  featureItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  indicatorsSection: {
    backgroundColor: 'white',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  indicatorChip: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  disabledChip: {
    backgroundColor: '#e9ecef',
    opacity: 0.5,
  },
  indicatorChipText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ChartsScreen;