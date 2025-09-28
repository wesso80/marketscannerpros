import React from 'react';
import { SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

const TARGET_URL = 'https://market-scanner-1-wesso80.replit.app?mobile=true';

const INJECT = `
(function () {
  // Set dark mode flag for CSS custom properties
  document.documentElement.setAttribute('data-mobile-dark', 'true');
  document.documentElement.style.colorScheme = 'dark';
  
  // Force Streamlit container backgrounds to dark
  var style = document.createElement('style');
  style.textContent = \`
    /* Force Streamlit containers to use dark theme */
    .stApp { background: var(--background-gradient) !important; }
    .main .block-container { background: transparent !important; }
    .stSidebar { background: #0b0b0d !important; }
    .stSidebar .stButton button { background: #2a2a2d !important; color: #e8e8ea !important; }
    
    /* Override any stubborn light backgrounds */
    div[data-testid="stMetric"] { background: var(--metric-card-bg) !important; }
    div[data-testid="stAlert"] { background: var(--card-bg) !important; color: var(--text-color) !important; }
    
    /* Ensure text is readable */
    .stMarkdown, .stText, p, span, div { color: var(--text-color) !important; }
  \`;
  document.head.appendChild(style);
})();
true;
`;

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      <WebView
        source={{ uri: TARGET_URL }}
        style={{ flex: 1, backgroundColor: '#000' }}
        containerStyle={{ backgroundColor: '#000' }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        injectedJavaScript={INJECT}
      />
    </SafeAreaView>
  );
}
