// Page-load and share-card reads. Live central-bank calls stay on the ingest cron.
import type { Wave3Deps } from './globalM2Pipeline';
import type { ProviderFxRaw, ProviderM2Raw } from './providers/globalM2ProviderTypes';
import type { PersistedM2Store } from './globalM2Store';

const offlineM2 = (id: string) => async (): Promise<ProviderM2Raw> => ({
  ok: false, id, provider: 'persisted', sourceSeries: '', nativeCurrency: '', nativeUnit: '', m2: [],
  latestObservationMonth: null, retrievedAt: new Date().toISOString(), error: 'page load reads persisted data only',
});
const offlineFx = (pair: string) => async (): Promise<ProviderFxRaw> => ({
  ok: false, pair, daily: [], retrievedAt: new Date().toISOString(), error: 'page load reads persisted data only',
});

/** Deps that make buildWave3Bundle read only the persisted store. */
export function persistedOnlyDeps(): Wave3Deps {
  return {
    us: offlineM2('US'), china: offlineM2('CN'), swiss: offlineM2('CH'), euro: offlineM2('EU'), uk: offlineM2('GB'),
    japan: offlineM2('JP'), canada: offlineM2('CA'), australia: offlineM2('AU'), india: offlineM2('IN'), korea: offlineM2('KR'),
    brazil: offlineM2('BR'),
    usdcny: offlineFx('USDCNY'), usdchf: offlineFx('USDCHF'), eurusd: offlineFx('EURUSD'), gbpusd: offlineFx('GBPUSD'),
    usdjpy: offlineFx('USDJPY'), usdcad: offlineFx('USDCAD'), audusd: offlineFx('AUDUSD'), usdinr: offlineFx('USDINR'),
    usdkrw: offlineFx('USDKRW'), usdbrl: offlineFx('USDBRL'),
  };
}

/** Reads pass through. Writes return 0 so a page load cannot insert macro_series rows. */
export function readOnlyM2Store(store: PersistedM2Store): PersistedM2Store {
  return { read: (id) => store.read(id), write: async () => 0 };
}
