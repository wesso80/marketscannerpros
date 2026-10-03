export const GLOBAL_API_WINDOW_MS = 60_000;
export const GLOBAL_API_MAX = 300;
export type ApiQuotaStore = Map<string, { count:number; windowStart:number }>;
export function consumeApiQuota(store:ApiQuotaStore, ip:string, now=Date.now()) {
  let entry=store.get(ip);
  if (!entry || now-entry.windowStart >= GLOBAL_API_WINDOW_MS) {
    entry={count:0,windowStart:now}; store.set(ip,entry);
  }
  entry.count++;
  return { limited:entry.count>GLOBAL_API_MAX, retryAfter:Math.max(1,Math.ceil((entry.windowStart+GLOBAL_API_WINDOW_MS-now)/1000)) };
}
