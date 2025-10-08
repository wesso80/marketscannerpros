import React, { useEffect } from 'react';
import { View, Button, Alert } from 'react-native';
import * as IAP from 'expo-in-app-purchases';

const PRODUCTS = [
  'com.wesso80.marketscanners.proplan.monthly',
  'com.wesso80.marketscanners.protrader.monthly',
];

export default function IosPurchaseButtons() {
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await IAP.connectAsync();
        IAP.setPurchaseListener(async ({ responseCode, results }) => {
          if (!mounted) return;
          if (responseCode === IAP.IAPResponseCode.OK && results) {
            for (const p of results) {
              if (!p.acknowledged) {
                try {
                  const r = await fetch('https://app.marketscannerpros.app/api/ios/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ receipt: p.transactionReceipt }),
                  });
                  const data = await r.json();
                  if (data.ok) {
                    Alert.alert('Success', 'Pro access activated.');
                  } else {
                    Alert.alert('Pending', 'Purchase received. Verification failed/queued.');
                  }
                } catch (e) {
                  Alert.alert('Network', 'Could not reach verification server.');
                }
                await IAP.finishTransactionAsync(p, true);
              }
            }
          }
        });
        // prefetch product metadata (optional for price display)
        try { await IAP.getProductsAsync(PRODUCTS); } catch {}
      } catch (e) {
        console.warn('IAP init error', e);
      }
    })();
    return () => { mounted = false; IAP.disconnectAsync(); };
  }, []);

  async function buy(idx: number) {
    try { await IAP.purchaseItemAsync(PRODUCTS[idx]); }
    catch (e:any) { Alert.alert('Purchase', e?.message || 'Failed'); }
  }
  return (
    <View style={{ gap: 12 }}>
      <Button title="🚀 Pro – $4.99/month" onPress={() => buy(0)} />
      <Button title="💎 Pro Trader – $9.99/month" onPress={() => buy(1)} />
      <Button title="Restore Purchases" onPress={() => IAP.getPurchaseHistoryAsync()} />
    </View>
  );
}
