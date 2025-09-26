// App.js — Bottom tabs: App | Docs
import React from "react";
import { SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

const TARGET_URL = "https://market-scanner-1-wesso80.replit.app?mobile=true";
const DOCS_URL   = "https://market-scanner-1-wesso80.replit.app/static_site/docs.html";

const INJECT = `
(function () {
  document.documentElement.setAttribute('data-mobile-dark', 'true');
  document.documentElement.style.colorScheme = 'dark';
  var style = document.createElement('style');
  style.textContent = \`
    .stApp { background: var(--background-gradient) !important; }
    .main .block-container { background: transparent !important; }
    .stSidebar { background: #0b0b0d !important; }
    .stSidebar .stButton button { background: #2a2a2d !important; color: #e8e8ea !important; }
    div[data-testid="stMetric"] { background: var(--metric-card-bg) !important; }
    div[data-testid="stAlert"] { background: var(--card-bg) !important; color: var(--text-color) !important; }
    .stMarkdown, .stText, p, span, div { color: var(--text-color) !important; }
  \`;
  document.head.appendChild(style);
})();
true;
`;

function AppWeb() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <WebView
        source={{ uri: TARGET_URL }}
        style={{ flex: 1, backgroundColor: "#000" }}
        containerStyle={{ backgroundColor: "#000" }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        injectedJavaScript={INJECT}
      />
    </SafeAreaView>
  );
}

function DocsWeb() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <WebView
        source={{ uri: DOCS_URL }}
        style={{ flex: 1, backgroundColor: "#000" }}
        containerStyle={{ backgroundColor: "#000" }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        injectedJavaScript={`document.documentElement.style.colorScheme='dark'; true;`}
      />
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: "#7dd3fc",
          tabBarInactiveTintColor: "#94a3b8",
          tabBarStyle: { backgroundColor: "#0b0b0d", borderTopColor: "#111827" },
          tabBarIcon: ({ color, size }) => {
            const name = route.name === "App" ? "apps" : "book";
            return <Ionicons name={name} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="App" component={AppWeb} />
        <Tab.Screen name="Docs" component={DocsWeb} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
