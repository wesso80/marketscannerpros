import type { CountryCode, CountryFilter, Region } from './types';

export interface CountryMeta {
  code: CountryCode;
  /** ISO 3166-1 alpha-2 used for flag generation (UK -> GB, EU -> EU). */
  iso2: string;
  name: string;
  region: Region;
  currency: string;
  timezone: string;
  /** Standard / daylight abbreviations for the country's release timezone. */
  tzAbbr: { standard: string; daylight: string };
  centralBank: string;
  /** Provider (Trading Economics) country label. */
  providerName: string;
  tier: 'primary' | 'secondary';
}

export const COUNTRIES: Record<CountryCode, CountryMeta> = {
  US: { code: 'US', iso2: 'US', name: 'United States', region: 'Americas', currency: 'USD', timezone: 'America/New_York', tzAbbr: { standard: 'EST', daylight: 'EDT' }, centralBank: 'Federal Reserve', providerName: 'United States', tier: 'primary' },
  JP: { code: 'JP', iso2: 'JP', name: 'Japan', region: 'Asia-Pacific', currency: 'JPY', timezone: 'Asia/Tokyo', tzAbbr: { standard: 'JST', daylight: 'JST' }, centralBank: 'Bank of Japan', providerName: 'Japan', tier: 'primary' },
  EU: { code: 'EU', iso2: 'EU', name: 'Eurozone', region: 'Europe', currency: 'EUR', timezone: 'Europe/Brussels', tzAbbr: { standard: 'CET', daylight: 'CEST' }, centralBank: 'European Central Bank', providerName: 'Euro Area', tier: 'primary' },
  UK: { code: 'UK', iso2: 'GB', name: 'United Kingdom', region: 'Europe', currency: 'GBP', timezone: 'Europe/London', tzAbbr: { standard: 'GMT', daylight: 'BST' }, centralBank: 'Bank of England', providerName: 'United Kingdom', tier: 'primary' },
  CA: { code: 'CA', iso2: 'CA', name: 'Canada', region: 'Americas', currency: 'CAD', timezone: 'America/Toronto', tzAbbr: { standard: 'EST', daylight: 'EDT' }, centralBank: 'Bank of Canada', providerName: 'Canada', tier: 'primary' },
  AU: { code: 'AU', iso2: 'AU', name: 'Australia', region: 'Asia-Pacific', currency: 'AUD', timezone: 'Australia/Sydney', tzAbbr: { standard: 'AEST', daylight: 'AEDT' }, centralBank: 'Reserve Bank of Australia', providerName: 'Australia', tier: 'primary' },
  CN: { code: 'CN', iso2: 'CN', name: 'China', region: 'Asia-Pacific', currency: 'CNY', timezone: 'Asia/Shanghai', tzAbbr: { standard: 'CST', daylight: 'CST' }, centralBank: "People's Bank of China", providerName: 'China', tier: 'primary' },
  NZ: { code: 'NZ', iso2: 'NZ', name: 'New Zealand', region: 'Asia-Pacific', currency: 'NZD', timezone: 'Pacific/Auckland', tzAbbr: { standard: 'NZST', daylight: 'NZDT' }, centralBank: 'Reserve Bank of New Zealand', providerName: 'New Zealand', tier: 'primary' },
  CH: { code: 'CH', iso2: 'CH', name: 'Switzerland', region: 'Europe', currency: 'CHF', timezone: 'Europe/Zurich', tzAbbr: { standard: 'CET', daylight: 'CEST' }, centralBank: 'Swiss National Bank', providerName: 'Switzerland', tier: 'secondary' },
  KR: { code: 'KR', iso2: 'KR', name: 'South Korea', region: 'Asia-Pacific', currency: 'KRW', timezone: 'Asia/Seoul', tzAbbr: { standard: 'KST', daylight: 'KST' }, centralBank: 'Bank of Korea', providerName: 'South Korea', tier: 'secondary' },
  IN: { code: 'IN', iso2: 'IN', name: 'India', region: 'Asia-Pacific', currency: 'INR', timezone: 'Asia/Kolkata', tzAbbr: { standard: 'IST', daylight: 'IST' }, centralBank: 'Reserve Bank of India', providerName: 'India', tier: 'secondary' },
};

export const PRIMARY_COUNTRIES: CountryCode[] = ['US', 'JP', 'EU', 'UK', 'AU', 'CA', 'CN', 'NZ'];
export const SECONDARY_COUNTRIES: CountryCode[] = ['CH', 'KR', 'IN'];
export const ALL_COUNTRIES: CountryCode[] = [...PRIMARY_COUNTRIES, ...SECONDARY_COUNTRIES];
export const COUNTRY_FILTERS: CountryFilter[] = ['GLOBAL', ...ALL_COUNTRIES];

export function isCountryCode(value: string): value is CountryCode {
  return Object.prototype.hasOwnProperty.call(COUNTRIES, value);
}

/** Parse a comma-separated country query param. Empty / GLOBAL => all countries. */
export function parseCountryFilter(raw: string | null | undefined): CountryCode[] {
  if (!raw) return ALL_COUNTRIES;
  const parts = raw.split(',').map((p) => p.trim().toUpperCase()).filter(Boolean);
  if (parts.length === 0 || parts.includes('GLOBAL') || parts.includes('ALL')) return ALL_COUNTRIES;
  const codes = parts.map((p) => (p === 'GB' ? 'UK' : p)).filter(isCountryCode);
  return codes.length ? codes : ALL_COUNTRIES;
}

/**
 * Build a flag emoji from regional indicator symbols at runtime so no emoji
 * literals live in source (text-code visual identity rule).
 */
export function countryFlag(code: CountryCode): string {
  const iso2 = COUNTRIES[code]?.iso2 ?? code;
  return iso2
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}

export function providerCountryToCode(name: string): CountryCode | null {
  const normalized = name.trim().toLowerCase();
  for (const meta of Object.values(COUNTRIES)) {
    if (meta.providerName.toLowerCase() === normalized || meta.name.toLowerCase() === normalized) return meta.code;
  }
  if (normalized === 'euro zone' || normalized === 'eurozone' || normalized === 'european union') return 'EU';
  if (normalized === 'great britain' || normalized === 'britain') return 'UK';
  if (normalized === 'korea' || normalized === 'republic of korea') return 'KR';
  return null;
}
