// Explicit provider-health vocabulary for the Global M2 pipeline. Replaces the
// flat "missing" boolean so diagnostics expose the ACTUAL cause of degradation.
export type ProviderHealth =
  | 'LIVE'                  // fetched live this run
  | 'STALE'                 // live fetch failed; serving persisted last-known-good
  | 'CREDENTIAL_REQUIRED'   // official API needs a key/app-id we don't have
  | 'PROVIDER_UNREACHABLE'  // network/HTTP failure (403, timeout, DNS, block)
  | 'DATA_UNAVAILABLE'      // provider reachable but no valid data
  | 'DEFINITION_UNAVAILABLE'; // no genuine national M2 exists to source

/** Classify a provider failure message into an explicit health state. Never
 *  invents data — this only labels WHY a bloc is unavailable. */
export function classifyProviderFailure(error?: string | null): ProviderHealth {
  const e = (error ?? '').toLowerCase();
  if (/credential|app[\s_-]?id|api[\s_-]?key|ecos_api_key|boj_api|series_code/.test(e)) return 'CREDENTIAL_REQUIRED';
  if (/discontinued|no genuine current m2|definition|not published/.test(e)) return 'DEFINITION_UNAVAILABLE';
  if (/http\s*[45]\d\d|\b403\b|\b429\b|\b5\d\d\b|timeout|timed out|abort|fetch failed|econn|enotfound|network|socket|no year pages parsed|money-supply-link-not-found|unresolved-year/.test(e)) {
    return 'PROVIDER_UNREACHABLE';
  }
  return 'DATA_UNAVAILABLE';
}
