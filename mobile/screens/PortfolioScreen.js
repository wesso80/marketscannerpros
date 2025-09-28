import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MarketDataService from '../services/MarketDataService';

const PortfolioScreen = () => {
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFreeTier, setIsFreeTier] = useState(true); // TODO: Get from user subscription

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    try {
      setLoading(true);
      const portfolioData = await MarketDataService.getPortfolio();
      setPortfolio(portfolioData?.overview || null);
      setPositions(portfolioData?.positions || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  const renderPosition = ({ item }) => (
    <View style={styles.positionItem}>
      <View style={styles.positionHeader}>
        <Text style={styles.positionSymbol}>{item.symbol}</Text>
        <Text style={[
          styles.pnl,
          item.unrealized_pnl >= 0 ? styles.profit : styles.loss
        ]}>
          {item.unrealized_pnl >= 0 ? '+' : ''}${item.unrealized_pnl?.toFixed(2)}
        </Text>
      </View>
      
      <View style={styles.positionDetails}>
        <Text style={styles.positionText}>
          {item.quantity} shares @ ${item.average_cost?.toFixed(2)}
        </Text>
        <Text style={styles.positionText}>
          Current: ${item.current_price?.toFixed(2)}
        </Text>
      </View>
      
      <View style={styles.positionFooter}>
        <Text style={styles.positionText}>
          Total Value: ${item.market_value?.toFixed(2)}
        </Text>
        <Text style={[
          styles.pnlPercent,
          item.pnl_percent >= 0 ? styles.profit : styles.loss
        ]}>
          {item.pnl_percent >= 0 ? '+' : ''}{item.pnl_percent?.toFixed(2)}%
        </Text>
      </View>
      
      {isFreeTier && (
        <View style={styles.freeWarning}>
          <Text style={styles.freeText}>🔒 Upgrade for advanced portfolio analytics</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading portfolio...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💼 Portfolio</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadPortfolio}
        >
          <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {isFreeTier && (
        <View style={styles.tierBanner}>
          <Text style={styles.tierText}>Free Tier - Limited to 5 positions</Text>
          <TouchableOpacity style={styles.upgradeButton}>
            <Text style={styles.upgradeText}>Upgrade Pro</Text>
          </TouchableOpacity>
        </View>
      )}

      {portfolio && (
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Value</Text>
            <Text style={styles.summaryValue}>${portfolio.total_value?.toFixed(2)}</Text>
          </View>
          
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total P&L</Text>
            <Text style={[
              styles.summaryValue,
              portfolio.total_pnl >= 0 ? styles.profit : styles.loss
            ]}>
              {portfolio.total_pnl >= 0 ? '+' : ''}${portfolio.total_pnl?.toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Day Change</Text>
            <Text style={[
              styles.summaryValue,
              portfolio.day_change >= 0 ? styles.profit : styles.loss
            ]}>
              {portfolio.day_change >= 0 ? '+' : ''}${portfolio.day_change?.toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={positions}
        renderItem={renderPosition}
        keyExtractor={(item) => item.symbol}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>📊 No positions</Text>
            <Text style={styles.emptySubtext}>Start trading to see your portfolio</Text>
          </View>
        }
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
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
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
  summary: {
    backgroundColor: 'white',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  profit: {
    color: '#28a745',
  },
  loss: {
    color: '#dc3545',
  },
  list: {
    flex: 1,
    padding: 16,
  },
  positionItem: {
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
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  positionSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  pnl: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  positionDetails: {
    marginBottom: 8,
  },
  positionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  positionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pnlPercent: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  freeWarning: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
  },
  freeText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 24,
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
  },
});

export default PortfolioScreen;