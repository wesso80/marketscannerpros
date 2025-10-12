import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Platform,
  Linking,
  TouchableOpacity 
} from 'react-native';
import IosPurchaseButtons from '../components/IosPurchaseButtons';

export default function HomeScreen() {
  const openWebApp = () => {
    Linking.openURL('https://app.marketscannerpros.app');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Market Scanner Pro</Text>
        <Text style={styles.subtitle}>Professional Market Analysis</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choose Your Plan</Text>
        <Text style={styles.sectionDescription}>
          Unlock powerful market scanning and analysis tools
        </Text>
      </View>

      {Platform.OS === 'ios' && <IosPurchaseButtons />}

      <View style={styles.featuresSection}>
        <Text style={styles.featuresTitle}>Features Include:</Text>
        <FeatureItem icon="📊" text="Real-time market scanning" />
        <FeatureItem icon="📈" text="Technical indicators (RSI, MACD, ATR)" />
        <FeatureItem icon="💼" text="Portfolio tracking" />
        <FeatureItem icon="📝" text="Trade journal (Pro Trader)" />
        <FeatureItem icon="🔄" text="Backtesting (Pro Trader)" />
        <FeatureItem icon="📱" text="Multi-platform access" />
      </View>

      <TouchableOpacity 
        style={styles.webAppButton}
        onPress={openWebApp}
      >
        <Text style={styles.webAppButtonText}>
          Open Web App →
        </Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Terms of Service • Privacy Policy • Support
        </Text>
      </View>
    </ScrollView>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
  },
  section: {
    padding: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  featuresSection: {
    padding: 20,
    marginTop: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
  },
  webAppButton: {
    margin: 20,
    padding: 16,
    backgroundColor: '#34C759',
    borderRadius: 12,
    alignItems: 'center',
  },
  webAppButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});
