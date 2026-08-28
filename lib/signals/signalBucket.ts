/**
 * Compute the deduplication bucket for a fired signal based on timeframe.
 *
 * Matches the bucketing logic described in migrations/003_signals_learning.sql
 * and is shared by both signal-recording paths (signalService + signalRecorder)
 * so their dedup keys stay identical. The bucket is one component of the
 * unique index idx_signals_dedup
 * (symbol, signal_type, direction, timeframe, scanner_version, signal_bucket).
 */
export function computeSignalBucket(signalAt: Date, timeframe: string): Date {
  const tf = (timeframe || 'daily').toLowerCase();

  switch (tf) {
    case '15m': {
      // Bucket to 15-minute intervals
      const bucket = new Date(signalAt);
      bucket.setSeconds(0, 0);
      bucket.setMinutes(Math.floor(bucket.getMinutes() / 15) * 15);
      return bucket;
    }
    case '1h':
    case '60min': {
      // Bucket to hour
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      return bucket;
    }
    case '4h': {
      // Bucket to 4-hour intervals
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      bucket.setHours(Math.floor(bucket.getHours() / 4) * 4);
      return bucket;
    }
    case '1d':
    case 'd':
    case 'daily': {
      // Bucket to day
      const bucket = new Date(signalAt);
      bucket.setHours(0, 0, 0, 0);
      return bucket;
    }
    default: {
      // Default to hourly
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      return bucket;
    }
  }
}
