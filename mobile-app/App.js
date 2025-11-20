import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

const APP_URL = 'https://app.marketscannerpros.app';

export default function App() {
  return (
    <>
      <StatusBar style="auto" />
      <WebView
        source={{ uri: APP_URL }}
        style={styles.container}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
