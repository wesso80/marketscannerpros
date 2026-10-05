import { humanizeEnum, humanizeText } from '@/lib/presentation/labels';
/** Display labels only; never alter an input, score or stored reading. */
export function volatilityText(value: string): string {
  return humanizeText(humanizeEnum(value, 'Not collected'))
    .replace(/\bbullish\b/gi, 'upward')
    .replace(/\bbearish\b/gi, 'downward')
    .replace(/\b(?:unavailable|unknown|n\/a)\b/gi, 'not collected')
    .replace(/\bmissing\b/gi, 'not collected')
    .replace(/\bDVE\b/g, 'Volatility');
}
