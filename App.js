import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import screens
import ScannerScreen from './mobile/screens/ScannerScreen';
import AlertsScreen from './mobile/screens/AlertsScreen';
import PortfolioScreen from './mobile/screens/PortfolioScreen';
import ChartsScreen from './mobile/screens/ChartsScreen';
import SettingsScreen from './mobile/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: '#007AFF',
            tabBarInactiveTintColor: '#8E8E93',
            headerShown: false,
          }}
        >
          <Tab.Screen 
            name="Scanner" 
            component={ScannerScreen}
            options={{
              tabBarLabel: 'Scan',
            }}
          />
          <Tab.Screen 
            name="Charts" 
            component={ChartsScreen}
            options={{
              tabBarLabel: 'Charts',
            }}
          />
          <Tab.Screen 
            name="Alerts" 
            component={AlertsScreen}
            options={{
              tabBarLabel: 'Alerts',
            }}
          />
          <Tab.Screen 
            name="Portfolio" 
            component={PortfolioScreen}
            options={{
              tabBarLabel: 'Portfolio',
            }}
          />
          <Tab.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{
              tabBarLabel: 'Settings',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});