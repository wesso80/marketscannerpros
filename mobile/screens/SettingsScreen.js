import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SettingsScreen = () => {
  const [isFreeTier, setIsFreeTier] = useState(true); // TODO: Get from user subscription
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    autoRefresh: true,
    soundAlerts: true,
  });

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const upgradeToProTier = () => {
    Alert.alert(
      '🚀 Upgrade to Pro',
      'Get unlimited scans, alerts, advanced charts, and premium indicators for $9.99/month',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade Now', onPress: () => {
          // TODO: Integrate with payment system
          Alert.alert('Success', 'Payment integration coming soon!');
        }}
      ]
    );
  };

  const upgradeToProTrader = () => {
    Alert.alert(
      '💎 Upgrade to Pro Trader',
      'Get everything in Pro plus advanced backtesting, custom algorithms, and priority support for $29.99/month',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade Now', onPress: () => {
          // TODO: Integrate with payment system
          Alert.alert('Success', 'Payment integration coming soon!');
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
                  style={styles.upgradeCard}
                  onPress={upgradeToProTier}
                >
                  <Text style={styles.upgradeTitle}>🚀 Pro ($9.99/mo)</Text>
                  <Text style={styles.upgradeFeatures}>
                    • Unlimited scans & alerts{'\n'}
                    • Advanced charts{'\n'}
                    • Real-time data{'\n'}
                    • Full portfolio tracking
                  </Text>
                  <View style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>Upgrade</Text>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.upgradeCard}
                  onPress={upgradeToProTrader}
                >
                  <Text style={styles.upgradeTitle}>💎 Pro Trader ($29.99/mo)</Text>
                  <Text style={styles.upgradeFeatures}>
                    • Everything in Pro{'\n'}
                    • Advanced backtesting{'\n'}
                    • Custom algorithms{'\n'}
                    • Priority support
                  </Text>
                  <View style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>Upgrade</Text>
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
});

export default SettingsScreen;