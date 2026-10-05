/** Display labels only: identifiers, strategy inputs and measured scores stay unchanged. */
export function learningText(value: string | null | undefined): string {
  if (!value) return 'Not collected';
  return value.replace(/dealers short gamma/gi, 'dealer negative gamma positioning').replace(/Golden Egg/g, 'Symbol').replace(/Command Center/g, 'Overview')
    .replace(/\bBullish\/bearish\b/gi, 'Upward/downward')
    .replace(/\bbullish\b/gi, 'upward').replace(/\bbearish\b/gi, 'downward')
    .replace(/\blongs?\b/gi, 'upside cases').replace(/\bshorts?\b/gi, 'downside cases')
    .replace(/\bBuy\b/gi, 'Upside').replace(/\bSell\b/gi, 'Downside')
    .replace(/\btarget\b/gi, 'reference level').replace(/\bplaybooks?\b/gi, 'framework')
    .replace(/\b(?:unknown|unavailable|N\/A)\b/gi, 'Not collected')
    .replace(/alpha_vantage/gi, 'Alpha Vantage')
    .replace(/\b[A-Z]+_[A-Z_]+\b/g, code => code.toLowerCase().replace(/_/g, ' '));
}
