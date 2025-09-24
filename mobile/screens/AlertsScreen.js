import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MarketDataService from '../services/MarketDataService';
import IAPService from '../services/IAPService';

const AlertsScreen = () => {
  const [alerts, setAlerts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAlert, setNewAlert] = useState({
    symbol: '',
    alertType: 'above',
    targetPrice: '',
    notificationMethod: 'email'
  });
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  useEffect(() => {
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

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const alertData = await MarketDataService.getPriceAlerts();
      setAlerts(alertData?.alerts || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load alerts');
    }
  };

  const createAlert = async () => {
    if (!newAlert.symbol || !newAlert.targetPrice) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // NEW STRATEGY: All tiers get full alert functionality
    // Only symbol scanning is limited to 4 for free tier

    try {
      await MarketDataService.createPriceAlert(
        newAlert.symbol.toUpperCase(),
        newAlert.alertType,
        parseFloat(newAlert.targetPrice),
        newAlert.notificationMethod
      );
      
      setModalVisible(false);
      setNewAlert({
        symbol: '',
        alertType: 'above',
        targetPrice: '',
        notificationMethod: 'email'
      });
      
      loadAlerts();
      Alert.alert('Success', 'Alert created successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to create alert');
    }
  };

  const renderAlert = ({ item }) => (
    <View style={styles.alertItem}>
      <View style={styles.alertHeader}>
        <Text style={styles.alertSymbol}>{item.symbol}</Text>
        <View style={[
          styles.statusBadge,
          item.is_active ? styles.activeBadge : styles.inactiveBadge
        ]}>
          <Text style={[
            styles.statusText,
            item.is_active ? styles.activeText : styles.inactiveText
          ]}>
            {item.is_active ? 'Active' : 'Triggered'}
          </Text>
        </View>
      </View>
      
      <View style={styles.alertDetails}>
        <Text style={styles.alertCondition}>
          {item.alert_type === 'above' ? '📈' : '📉'} {item.alert_type} ${item.target_price}
        </Text>
        <Text style={styles.alertMethod}>📧 {item.notification_method}</Text>
      </View>
      
      {item.is_triggered && item.current_price && (
        <Text style={styles.triggeredPrice}>
          Triggered at ${item.current_price}
        </Text>
      )}
      
      {subscriptionLoaded && isFreeTier && (
        <View style={styles.freeWarning}>
          <Text style={styles.freeText}>🚀 Free tier: All features • 4 symbols only</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚨 Price Alerts</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {subscriptionLoaded && isFreeTier && (
        <View style={styles.tierBanner}>
          <Text style={styles.tierText}>Free tier: Unlimited alerts • 4 symbols only • Upgrade for more!</Text>
          <TouchableOpacity style={styles.upgradeButton}>
            <Text style={styles.upgradeText}>Upgrade Pro</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={alerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>📱 No alerts set</Text>
            <Text style={styles.emptySubtext}>Create your first price alert</Text>
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Price Alert</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Symbol</Text>
              <TextInput
                style={styles.input}
                value={newAlert.symbol}
                onChangeText={(text) => setNewAlert({...newAlert, symbol: text})}
                placeholder="e.g., AAPL"
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Alert Type</Text>
              <View style={styles.switchRow}>
                <Text>Below</Text>
                <Switch
                  value={newAlert.alertType === 'above'}
                  onValueChange={(value) => 
                    setNewAlert({...newAlert, alertType: value ? 'above' : 'below'})
                  }
                />
                <Text>Above</Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Price</Text>
              <TextInput
                style={styles.input}
                value={newAlert.targetPrice}
                onChangeText={(text) => setNewAlert({...newAlert, targetPrice: text})}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.createButton}
                onPress={createAlert}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
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
  list: {
    flex: 1,
    padding: 16,
  },
  alertItem: {
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
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadge: {
    backgroundColor: '#d4edda',
  },
  inactiveBadge: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeText: {
    color: '#155724',
  },
  inactiveText: {
    color: '#721c24',
  },
  alertDetails: {
    gap: 4,
  },
  alertCondition: {
    fontSize: 16,
    color: '#333',
  },
  alertMethod: {
    fontSize: 14,
    color: '#666',
  },
  triggeredPrice: {
    fontSize: 14,
    color: '#dc3545',
    marginTop: 8,
    fontStyle: 'italic',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 14,
    borderRadius: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
  createButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  createButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
});

export default AlertsScreen;