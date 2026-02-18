export function clampConfidence(value: number, fallback = 50): number {
  const source = Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(99, Math.round(source)));
}

export function candidateOutcomeFromConfidence(confidence: number): 'pass' | 'watch' | 'fail' {
  if (confidence >= 70) return 'pass';
  if (confidence >= 55) return 'watch';
  return 'fail';
}

export function qualityTierFromConfidence(confidence: number): 'A' | 'B' | 'C' | 'D' {
  if (confidence >= 75) return 'A';
  if (confidence >= 62) return 'B';
  if (confidence >= 48) return 'C';
  return 'D';
}
