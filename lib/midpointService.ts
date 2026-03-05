/**
 * Midpoint Calculator & Storage Service
 * 
 * Processes closed candles and generates precise midpoint records for the Time Gravity Map.
 * 
 * Key Features:
 * - Calculates 50% midpoint from each closed candle
 * - Stores in database with full candle metadata
 * - Auto-tags midpoints when price crosses them
 * - Retrieves untagged midpoints for gravity calculations
 */

import { Pool, PoolClient } from 'pg';
import { q, tx } from '@/lib/db';
import type { MidpointRecord } from './time/midpointDebt';
import { TF_WEIGHTS } from './time/midpointDebt';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CandleData {
  symbol: string;
  timeframe: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StoredMidpoint {
  id: number;
  symbol: string;
  assetType: string;
  timeframe: string;
  candleOpenTime: Date;
  candleCloseTime: Date;
  high: number;
  low: number;
  midpoint: number;
  openPrice: number | null;
  closePrice: number | null;
  volume: number | null;
  tagged: boolean;
  taggedAt: Date | null;
  taggedPrice: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MidpointServiceConfig {
  pool?: Pool;
  databaseUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDPOINT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class MidpointService {
  private pool: Pool;
  
  constructor(config: MidpointServiceConfig = {}) {
    if (config.pool) {
      this.pool = config.pool;
    } else {
      const connectionString = config.databaseUrl || process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('Database URL required for MidpointService');
      }
      this.pool = new Pool({ connectionString });
    }
  }
  
  /**
   * Calculate midpoint from candle high/low
   */
  static calculateMidpoint(high: number, low: number): number {
    return (high + low) / 2;
  }
  
  /**
   * Store a closed candle's midpoint
   */
  async storeMidpoint(
    candle: CandleData,
    assetType: string = 'crypto'
  ): Promise<StoredMidpoint | null> {
    const midpoint = MidpointService.calculateMidpoint(candle.high, candle.low);
    
    const query = `
      INSERT INTO timeframe_midpoints (
        symbol, 
        asset_type, 
        timeframe,
        candle_open_time,
        candle_close_time,
        high,
        low,
        midpoint,
        open_price,
        close_price,
        volume
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (symbol, timeframe, candle_close_time) 
      DO UPDATE SET
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        midpoint = EXCLUDED.midpoint,
        open_price = EXCLUDED.open_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume,
        updated_at = NOW()
      RETURNING *
    `;
    
    try {
      const result = await this.pool.query(query, [
        candle.symbol,
        assetType,
        candle.timeframe,
        candle.openTime,
        candle.closeTime,
        candle.high,
        candle.low,
        midpoint,
        candle.open,
        candle.close,
        candle.volume || null,
      ]);
      
      return result.rows[0] ? this.mapToStoredMidpoint(result.rows[0]) : null;
    } catch (error) {
      console.error('Failed to store midpoint:', error);
      throw error;
    }
  }
  
  /**
   * Store multiple candles in a batch — uses multi-row INSERT for efficiency
   * (was O(n) individual INSERTs per candle → now single query)
   */
  async storeMidpointBatch(
    candles: CandleData[],
    assetType: string = 'crypto'
  ): Promise<number> {
    if (candles.length === 0) return 0;
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Build multi-row VALUES clause
      const values: any[] = [];
      const placeholders: string[] = [];
      
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const midpoint = MidpointService.calculateMidpoint(candle.high, candle.low);
        const offset = i * 11;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
        );
        values.push(
          candle.symbol, assetType, candle.timeframe,
          candle.openTime, candle.closeTime,
          candle.high, candle.low, midpoint,
          candle.open, candle.close, candle.volume || null
        );
      }
      
      const query = `
        INSERT INTO timeframe_midpoints (
          symbol, asset_type, timeframe, candle_open_time, candle_close_time,
          high, low, midpoint, open_price, close_price, volume
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (symbol, timeframe, candle_close_time) DO NOTHING
      `;
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to store midpoint batch:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Check if price has tagged any untagged midpoints and mark them
   */
  async checkAndTagMidpoints(
    symbol: string,
    currentHigh: number,
    currentLow: number
  ): Promise<number> {
    const query = `
      SELECT check_and_tag_midpoints($1, $2, $3)
    `;
    
    try {
      const result = await this.pool.query(query, [symbol, currentHigh, currentLow]);
      return result.rows[0]?.check_and_tag_midpoints || 0;
    } catch (error) {
      console.error('Failed to check and tag midpoints:', error);
      return 0;
    }
  }
  
  /**
   * Tag midpoints that price has clearly overshot.
   *
   * Logic: Every midpoint was created from a candle where price was AT that level.
   * If the current price is now >overshootPct away, price must have crossed through
   * the midpoint to get where it is. We tag these as "completed / overshot".
   *
   * Safety: only tags midpoints older than 60 min to avoid tagging fresh ones
   * from a candle that just closed (where price may still be nearby and oscillating).
   */
  async tagOvershootMidpoints(
    symbol: string,
    currentPrice: number,
    overshootPct: number = 0.005  // 0.5%
  ): Promise<number> {
    const query = `
      UPDATE timeframe_midpoints
      SET 
        tagged = TRUE,
        tagged_at = NOW(),
        tagged_price = $2,
        updated_at = NOW()
      WHERE 
        symbol = $1
        AND tagged = FALSE
        AND ABS((midpoint - $2) / NULLIF(midpoint, 0)) > $3
        AND candle_close_time < NOW() - INTERVAL '60 minutes'
      RETURNING id
    `;
    
    try {
      const result = await this.pool.query(query, [symbol, currentPrice, overshootPct]);
      const count = result.rows.length;
      if (count > 0) {
        console.log(`[MidpointService] Tagged ${count} overshot midpoints for ${symbol} (price=${currentPrice})`);
      }
      return count;
    } catch (error) {
      console.error('Failed to tag overshot midpoints:', error);
      return 0;
    }
  }
  
  /**
   * Get untagged midpoints for Time Gravity Map calculations
   */
  async getUntaggedMidpoints(
    symbol: string,
    currentPrice: number,
    options: {
      maxDistancePercent?: number;
      limit?: number;
      minAge?: number; // Minimum age in minutes
    } = {}
  ): Promise<MidpointRecord[]> {
    const {
      maxDistancePercent = 10.0,
      limit = 100,
      minAge = 0,
    } = options;
    
    const query = `
      SELECT 
        id,
        symbol,
        timeframe,
        midpoint,
        high,
        low,
        candle_open_time,
        candle_close_time,
        tagged,
        tagged_at,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - candle_close_time)) / 60 as age_minutes,
        ABS((midpoint - $2) / $2 * 100) as distance_percent
      FROM timeframe_midpoints
      WHERE 
        symbol = $1
        AND tagged = FALSE
        AND ABS((midpoint - $2) / $2 * 100) <= $3
        AND EXTRACT(EPOCH FROM (NOW() - candle_close_time)) / 60 >= $4
      ORDER BY candle_close_time DESC
      LIMIT $5
    `;
    
    try {
      const result = await this.pool.query(query, [
        symbol,
        currentPrice,
        maxDistancePercent,
        minAge,
        limit,
      ]);
      
      return result.rows.map(row => this.mapToMidpointRecord(row, currentPrice));
    } catch (error) {
      console.error('Failed to get untagged midpoints:', error);
      return [];
    }
  }
  
  /**
   * Get all midpoints for a symbol (tagged and untagged)
   */
  async getAllMidpoints(
    symbol: string,
    timeframe?: string,
    limit: number = 200
  ): Promise<MidpointRecord[]> {
    let query = `
      SELECT 
        id,
        symbol,
        timeframe,
        midpoint,
        high,
        low,
        candle_open_time,
        candle_close_time,
        tagged,
        tagged_at,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - candle_close_time)) / 60 as age_minutes
      FROM timeframe_midpoints
      WHERE symbol = $1
    `;
    
    const params: any[] = [symbol];
    
    if (timeframe) {
      query += ` AND timeframe = $2`;
      params.push(timeframe);
      query += ` ORDER BY candle_close_time DESC LIMIT $3`;
      params.push(limit);
    } else {
      query += ` ORDER BY candle_close_time DESC LIMIT $2`;
      params.push(limit);
    }
    
    try {
      const result = await this.pool.query(query, params);
      
      // We need current price for distance calculation, but if not provided, use 0
      return result.rows.map(row => this.mapToMidpointRecord(row, row.midpoint));
    } catch (error) {
      console.error('Failed to get all midpoints:', error);
      return [];
    }
  }
  
  /**
   * Get midpoint statistics for a symbol
   */
  async getMidpointStats(symbol: string): Promise<{
    timeframe: string;
    total: number;
    untagged: number;
    tagged: number;
    taggedPercent: number;
    latestCandle: Date | null;
    earliestCandle: Date | null;
  }[]> {
    const query = `
      SELECT * FROM midpoint_stats
      WHERE symbol = $1
      ORDER BY timeframe
    `;
    
    try {
      const result = await this.pool.query(query, [symbol]);
      return result.rows.map(row => ({
        timeframe: row.timeframe,
        total: parseInt(row.total_midpoints, 10),
        untagged: parseInt(row.untagged, 10),
        tagged: parseInt(row.tagged, 10),
        taggedPercent: parseFloat(row.tagged_percent),
        latestCandle: row.latest_candle ? new Date(row.latest_candle) : null,
        earliestCandle: row.earliest_candle ? new Date(row.earliest_candle) : null,
      }));
    } catch (error) {
      console.error('Failed to get midpoint stats:', error);
      return [];
    }
  }
  
  /**
   * Delete old tagged midpoints to keep database clean
   */
  async cleanupOldMidpoints(daysToKeep: number = 90): Promise<number> {
    // Parameterized query — no SQL interpolation (was B20: SQL injection)
    const query = `
      DELETE FROM timeframe_midpoints
      WHERE 
        tagged = TRUE
        AND tagged_at < NOW() - make_interval(days => $1)
    `;
    
    try {
      const result = await this.pool.query(query, [Math.floor(daysToKeep)]);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Failed to cleanup old midpoints:', error);
      return 0;
    }
  }
  
  /**
   * Reset (untag) all midpoints for a symbol so they become active again.
   * Useful after fixing tagging thresholds or re-backfilling.
   */
  async resetTaggedMidpoints(symbol?: string): Promise<number> {
    const query = symbol
      ? `UPDATE timeframe_midpoints SET tagged = FALSE, tagged_at = NULL, tagged_price = NULL, updated_at = NOW() WHERE tagged = TRUE AND symbol = $1 RETURNING id`
      : `UPDATE timeframe_midpoints SET tagged = FALSE, tagged_at = NULL, tagged_price = NULL, updated_at = NOW() WHERE tagged = TRUE RETURNING id`;
    
    try {
      const params = symbol ? [symbol] : [];
      const result = await this.pool.query(query, params);
      const count = result.rows.length;
      console.log(`[MidpointService] Reset ${count} tagged midpoints${symbol ? ` for ${symbol}` : ''}`);
      return count;
    } catch (error) {
      console.error('Failed to reset tagged midpoints:', error);
      return 0;
    }
  }
  
  /**
   * Map database row to StoredMidpoint
   */
  private mapToStoredMidpoint(row: any): StoredMidpoint {
    return {
      id: row.id,
      symbol: row.symbol,
      assetType: row.asset_type,
      timeframe: row.timeframe,
      candleOpenTime: new Date(row.candle_open_time),
      candleCloseTime: new Date(row.candle_close_time),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      midpoint: parseFloat(row.midpoint),
      openPrice: row.open_price ? parseFloat(row.open_price) : null,
      closePrice: row.close_price ? parseFloat(row.close_price) : null,
      volume: row.volume ? parseFloat(row.volume) : null,
      tagged: row.tagged,
      taggedAt: row.tagged_at ? new Date(row.tagged_at) : null,
      taggedPrice: row.tagged_price ? parseFloat(row.tagged_price) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  
  /**
   * Map database row to MidpointRecord (for Time Gravity Map)
   */
  private mapToMidpointRecord(row: any, currentPrice: number): MidpointRecord {
    const midpoint = parseFloat(row.midpoint);
    const high = parseFloat(row.high);
    const low = parseFloat(row.low);
    const range = high - low;
    const distanceFromPrice = ((midpoint - currentPrice) / currentPrice) * 100;
    
    return {
      timeframe: row.timeframe,
      midpoint,
      high,
      low,
      range,
      retrace30High: high - range * 0.3,
      retrace30Low: low + range * 0.3,
      createdAt: new Date(row.created_at),
      candleOpenTime: new Date(row.candle_open_time),
      candleCloseTime: new Date(row.candle_close_time),
      tagged: row.tagged,
      taggedAt: row.tagged_at ? new Date(row.tagged_at) : null,
      distanceFromPrice,
      ageMinutes: parseFloat(row.age_minutes || 0),
      weight: TF_WEIGHTS[row.timeframe] || 1,
      isAbovePrice: midpoint > currentPrice,
    };
  }
  
  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create singleton instance
 */
let midpointServiceInstance: MidpointService | null = null;

export function getMidpointService(config?: MidpointServiceConfig): MidpointService {
  if (!midpointServiceInstance) {
    midpointServiceInstance = new MidpointService(config);
  }
  return midpointServiceInstance;
}

/**
 * Example usage:
 * 
 * // Store a closed candle
 * const service = getMidpointService();
 * await service.storeMidpoint({
 *   symbol: 'BTCUSD',
 *   timeframe: '1H',
 *   openTime: new Date('2025-01-09T12:00:00Z'),
 *   closeTime: new Date('2025-01-09T13:00:00Z'),
 *   open: 67900,
 *   high: 68100,
 *   low: 67850,
 *   close: 68000,
 *   volume: 1234.56
 * }, 'crypto');
 * 
 * // Check if current price tagged any midpoints
 * await service.checkAndTagMidpoints('BTCUSD', 68150, 67950);
 * 
 * // Get untagged midpoints for Time Gravity Map
 * const midpoints = await service.getUntaggedMidpoints('BTCUSD', 68000, {
 *   maxDistancePercent: 5.0,
 *   limit: 50
 * });
 */
