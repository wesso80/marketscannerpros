/**
 * Reader ordinals. Presentation only — does not change the number, rank, or score.
 * 1st, 2nd, 3rd, 4th, 11th–13th, 21st, 22nd, 23rd, 101st, 111th.
 */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const m100 = v % 100;
  const m10 = v % 10;
  const suf = m100 >= 11 && m100 <= 13 ? 'th' : m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th';
  return `${v}${suf}`;
}

/** Correct a hand-rolled suffix already written into reader text ("92th" → "92nd"). Leaves a correct suffix alone. */
export function fixOrdinalSuffixes(text: string): string {
  return text.replace(/\b(\d+)(st|nd|rd|th)\b/g, (full, digits: string, suf: string) => {
    const corrected = ordinal(Number(digits));
    const expected = corrected.slice(digits.length);
    return suf === expected ? full : corrected;
  });
}
