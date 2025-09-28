const config = {
  appId: 'com.wesso80.marketscanner',
  appName: 'MarketScanner Pro',
  webDir: 'out',
  server: {
    url: 'https://marketscannerpros.app',
    cleartext: true
  },
  android: {
    buildOptions: {
      keystorePath: 'android/app/my-upload-key.keystore',
      keystorePassword: '',
      keystoreAlias: 'my-key-alias',
      keystoreAliasPassword: '',
      releaseType: 'APK'
    }
  },
  ios: {
    scheme: 'MarketScanner Pro'
  }
};

export default config;