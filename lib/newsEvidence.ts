/** Alpha Vantage compact timestamps are UTC, not browser-local dates. */
export function newsPublishedAt(value: string): number {
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  const parsed = compact ? Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}
export function isRecentNews(value: string, now = Date.now(), hours = 24): boolean {
  const age = now - newsPublishedAt(value);
  return Number.isFinite(age) && age >= 0 && age <= hours * 3_600_000;
}
export function newsTopicFlags(text: string) {
  return {
    macro: /\b(fomc|cpi|nfp|payrolls?|interest rates?|fed|federal reserve|inflation|yields?|treasur(?:y|ies))\b/i.test(text),
    crypto: /\b(btc|bitcoin|eth|ethereum|crypto|solana|altcoins?)\b/i.test(text),
    ai: /\b(ai|artificial intelligence|semiconductors?|gpu|nvidia|openai|large language models?)\b/i.test(text),
    earnings: /\b(earnings|guidance|eps|revenue|beat|miss)\b/i.test(text),
    geo: /\b(wars?|geopolitic\w*|sanctions?|taiwan|middle east|opec|oil shock)\b/i.test(text),
    commodities: /\b(oil|gold|silver|copper|wti|commodit(?:y|ies))\b/i.test(text),
  };
}
