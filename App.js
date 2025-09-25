import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const TARGET_URL = 'http://localhost:5000?mobile=true';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <WebView
        source={{ uri: TARGET_URL }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsBackForwardNavigationGestures={true}
      />
    </View>
  );
}