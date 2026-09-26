/**
 * Scalper volume read: latest bar volume vs the 20-bar average.
 *
 * If the bars carry no volume at all, there is no ratio (null), never a made-up 1.0x.
 */

export const SCALP_VOL_SPIKE_RATIO = 1.8;

export function scalpVolumeRatio(volumes: number[]): { volRatio: number | null; volSpike: boolean } {
  const recent = volumes.slice(-20).filter((v) => Number.isFinite(v));
  if (recent.length === 0) return { volRatio: null, volSpike: false };
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const latest = volumes[volumes.length - 1];
  if (!(avg > 0) || !Number.isFinite(latest)) return { volRatio: null, volSpike: false };
  const ratio = latest / avg;
  return { volRatio: Math.round(ratio * 100) / 100, volSpike: ratio > SCALP_VOL_SPIKE_RATIO };
}

/** Text and tooltip for the Vol column. */
export function scalpVolumeCell(
  volRatio: number | null | undefined,
  volSpike: boolean,
  spikeMarker = '🔥',
): { text: string; title: string } {
  if (volRatio == null || !Number.isFinite(volRatio)) {
    return {
      text: 'n/a',
      title: 'No volume in the source bars for this symbol, so volume is not scored.',
    };
  }
  const base = `Latest bar volume is ${volRatio.toFixed(2)}x the 20-bar average (spike above ${SCALP_VOL_SPIKE_RATIO}x).`;
  return volSpike
    ? { text: `${spikeMarker} ${volRatio.toFixed(1)}x`, title: `${base} Volume spike.` }
    : { text: `${volRatio.toFixed(1)}x`, title: `${base} No spike.` };
}
