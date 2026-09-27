/**
 * Position (weekly/daily) levels: daily ATR, weekly-swing stop, weekly/monthly targets, daily-close entry trigger,
 * long/short symmetry, and "unavailable" when daily data is missing (never a 15m fallback).
 */
import { describe, expect, it } from "vitest";
import {
  EXPECTED_HOLD,
  POSITION_LEVELS_LABEL,
  POSITION_LEVELS_UNAVAILABLE,
  computePositionLevels,
  dailyToMonthly,
  dailyToWeekly,
  findSwings,
  positionFlags,
  positionLevelView,
  type DailyBarLike,
  type PositionLevels,
} from "../../lib/admin/positionLevels";
import { edgePacketPrice, projectEdgePacket } from "../../lib/admin/edgePacket";
import { memoizeProvider } from "../../lib/operator/market-data";
import type { MarketDataProvider } from "../../lib/operator/orchestrator";
import type { Bar } from "../../types/operator";

void edgePacketPrice;
const DAY = 86_400_000;

/** Weekday daily bars from Mon 1 Jun 2026: each week has a flat close, high = close + 1, low = close - 1. */
function weeklyShapedBars(weekCloses: number[], start = "2026-06-01"): DailyBarLike[] {
  const bars: DailyBarLike[] = [];
  let ms = Date.parse(`${start}T00:00:00Z`);
  for (const c of weekCloses) {
    for (let d = 0; d < 5; d++) {
      bars.push({ timestamp: new Date(ms).toISOString().slice(0, 10), open: c, high: c + 1, low: c - 1, close: c, volume: 1000 });
      ms += DAY;
    }
    ms += 2 * DAY; // weekend
  }
  return bars;
}

function nextWeekday(ts: string): string {
  let ms = Date.parse(`${ts}T00:00:00Z`) + DAY;
  while ([0, 6].includes(new Date(ms).getUTCDay())) ms += DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

function mirror(bars: DailyBarLike[], axis = 200): DailyBarLike[] {
  return bars.map((b) => ({ ...b, open: axis - b.open, high: axis - b.low, low: axis - b.high, close: axis - b.close }));
}

const A = [100, 104, 108, 104, 100, 104, 110, 106, 102, 106, 108, 109]; // TP1 < 1.5R case
const B = [100, 110, 130, 110, 100, 90, 95, 92, 97, 100, 99, 100]; // TP1 >= 1.5R case
const NOW = Date.parse("2026-08-22T12:00:00Z"); // Sat after the last bar (Fri 21 Aug)

describe("weekly / monthly aggregation from daily bars", () => {
  it("builds Monday-keyed weeks and calendar months", () => {
    const bars = weeklyShapedBars(A);
    const weeks = dailyToWeekly(bars);
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toMatchObject({ key: "2026-06-01", high: 101, low: 99, close: 100 });
    expect(weeks[6]).toMatchObject({ key: "2026-07-13", high: 111, low: 109 });
    const months = dailyToMonthly(bars);
    expect(months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(months[1].high).toBe(111);
  });

  it("finds swing lows / highs that beat 2 bars either side", () => {
    const weeks = dailyToWeekly(weeklyShapedBars(A));
    expect(findSwings(weeks, "low", weeks.length, 2).map((i) => weeks[i].key)).toEqual(["2026-06-29", "2026-07-27"]);
    expect(findSwings(weeks, "high", weeks.length, 2).map((i) => weeks[i].key)).toEqual(["2026-06-15", "2026-07-13"]);
  });
});

describe("computePositionLevels: long", () => {
  const res = computePositionLevels({ dailyBars: weeklyShapedBars(B), price: 100, completedThrough: "2026-08-21", nowMs: NOW });

  it("is labelled weekly/daily with the expected hold and a daily ATR", () => {
    expect(res.status).toBe("ok");
    expect(res.label).toBe(POSITION_LEVELS_LABEL);
    expect(res.label).toBe("Position (weekly/daily)");
    expect(res.expectedHold).toBe(EXPECTED_HOLD);
    expect(res.expectedHold).toMatch(/6\+ weeks/);
    expect(res.weeklyBars).toBe(12);
    expect(res.atr).toBeGreaterThan(2); // flat-week range is 2; weekly gaps add to it
  });

  it("puts the stop beyond the latest weekly swing low with a 0.5 x daily ATR buffer", () => {
    const l = res.long!;
    expect(l.stopSource).toBe("weekly swing low");
    expect(l.stopLevel).toBe(89); // week of 6 Jul, close 90
    expect(l.stopWeekOf).toBe("2026-07-06");
    expect(l.stop).toBeCloseTo(89 - 0.5 * res.atr!, 3);
  });

  it("uses a daily close through the trigger, with an entry zone of 0.5 x ATR", () => {
    const l = res.long!;
    expect(l.trigger).toBe(101); // 20-day high (no strict daily swing in flat weeks)
    expect(l.entryZoneLow).toBe(101);
    expect(l.entryZoneHigh).toBeCloseTo(101 + 0.5 * res.atr!, 3);
    expect(l.entryStatus).toBe("waiting");
    expect(l.entryNote).toMatch(/daily close above 101/);
  });

  it("targets the next weekly/monthly level (>= 1.5R here) then R projections", () => {
    const l = res.long!;
    const risk = 101 - l.stop;
    expect(l.riskPerUnit).toBeCloseTo(risk, 3);
    expect(l.tp1).toBe(131); // week-of-15-Jun swing high = June monthly high
    expect(l.targets[0].timeframe).toBe("monthly");
    expect(l.tp1R).toBeCloseTo(30 / risk, 2);
    expect(l.tp1R!).toBeGreaterThanOrEqual(1.5);
    expect(l.belowMinR).toBe(false);
    expect(l.targets.slice(1).map((t) => t.timeframe)).toEqual(["projection", "projection"]);
    expect(l.tp2).toBeCloseTo(101 + 3 * risk, 3);
    expect(l.tp3).toBeCloseTo(101 + 4 * risk, 3);
  });

  it("skips nearer levels to the first one with >= 1.5R room, listing them as obstacles", () => {
    const C = [100, 110, 130, 110, 100, 90, 106, 92, 97, 100, 99, 100];
    const c = computePositionLevels({ dailyBars: weeklyShapedBars(C), price: 100, completedThrough: "2026-08-21", nowMs: NOW });
    const l = c.long!;
    expect(l.stopLevel).toBe(89);
    expect(l.obstacles.map((o) => o.price)).toEqual([107]);
    expect(l.obstacles[0].r).toBeLessThan(1.5);
    expect(l.tp1).toBe(131);
    expect(l.tp1R!).toBeGreaterThanOrEqual(1.5);
    expect(l.belowMinR).toBe(false);
  });

  it("flags 'below 1.5R' when no weekly/monthly level gives 1.5R", () => {
    const a = computePositionLevels({ dailyBars: weeklyShapedBars(A), price: 109, completedThrough: "2026-08-21", nowMs: NOW });
    const l = a.long!;
    expect(l.trigger).toBe(110);
    expect(l.stopLevel).toBe(101); // latest weekly swing low (week of 27 Jul)
    expect(l.tp1).toBe(111);
    expect(l.belowMinR).toBe(true);
    expect(l.targetTooClose).toBe(true);
    const v = positionLevelView(a, "LONG");
    expect(positionFlags(v)).toContain("below 1.5R");
  });
});

describe("computePositionLevels: long and short are mirrors", () => {
  for (const [name, closes] of [["A", A], ["B", B]] as const) {
    it(`series ${name}: short levels of the mirrored chart = long levels mirrored`, () => {
      const bars = weeklyShapedBars(closes);
      const price = closes[closes.length - 1];
      const up = computePositionLevels({ dailyBars: bars, price, completedThrough: "2026-08-21", nowMs: NOW });
      const down = computePositionLevels({ dailyBars: mirror(bars), price: 200 - price, completedThrough: "2026-08-21", nowMs: NOW });
      expect(down.atr).toBeCloseTo(up.atr!, 6);
      for (const [l, s] of [[up.long!, down.short!], [up.short!, down.long!]]) {
        expect(s.trigger).toBeCloseTo(200 - l.trigger, 3);
        expect(s.stop).toBeCloseTo(200 - l.stop, 3);
        expect(s.stopLevel).toBeCloseTo(200 - l.stopLevel, 3);
        expect(s.entryZoneLow).toBeCloseTo(200 - l.entryZoneHigh, 3);
        expect(s.entryStatus).toBe(l.entryStatus);
        expect(s.targets.map((t) => t.r)).toEqual(l.targets.map((t) => t.r));
        expect(s.targets.map((t) => t.price)).toEqual(l.targets.map((t) => expect.closeTo(200 - t.price, 3)));
        expect(s.belowMinR).toBe(l.belowMinR);
        expect(s.stopWeekOf).toBe(l.stopWeekOf);
      }
    });
  }

  it("short stop sits above the latest weekly swing high", () => {
    const res = computePositionLevels({ dailyBars: weeklyShapedBars(A), price: 109, completedThrough: "2026-08-21", nowMs: NOW });
    const s = res.short!;
    expect(s.trigger).toBe(101);
    expect(s.stopSource).toBe("weekly swing high");
    expect(s.stopLevel).toBe(111);
    expect(s.stop).toBeCloseTo(111 + 0.5 * res.atr!, 3);
    expect(s.tp1).toBe(99);
    expect(s.tp1! < s.trigger).toBe(true);
  });
});

describe("computePositionLevels: entry status", () => {
  const bars = weeklyShapedBars(B);
  const extra = nextWeekday(bars[bars.length - 1].timestamp); // Mon 24 Aug
  const withBreak = [...bars, { timestamp: extra, open: 100, high: 102.5, low: 100.5, close: 101.5, volume: 1000 }];
  const now = Date.parse(`${extra}T22:00:00Z`);

  it("in zone after a daily close through the trigger", () => {
    const r = computePositionLevels({ dailyBars: withBreak, price: 101.8, completedThrough: extra, nowMs: now });
    expect(r.long!.trigger).toBe(101);
    expect(r.long!.entryStatus).toBe("in_zone");
  });

  it("past the zone = don't chase", () => {
    const r = computePositionLevels({ dailyBars: withBreak, price: 110, completedThrough: extra, nowMs: now });
    expect(r.long!.entryStatus).toBe("past_zone");
    expect(positionFlags(positionLevelView(r, "LONG"))).toContain("past entry zone: don't chase");
  });

  it("a forming daily bar is not a daily close", () => {
    const r = computePositionLevels({ dailyBars: withBreak, price: 101.5, completedThrough: bars[bars.length - 1].timestamp, nowMs: now });
    expect(r.lastDailyCloseDate).toBe("2026-08-21");
    expect(r.long!.entryStatus).toBe("waiting");
  });

  it("price through the stop", () => {
    const r = computePositionLevels({ dailyBars: withBreak, price: 80, completedThrough: extra, nowMs: now, params: { maxPriceDivergence: 0.5 } });
    expect(r.long!.entryStatus).toBe("beyond_stop");
  });
});

describe("computePositionLevels: missing data (never a 15m fallback)", () => {
  it("no daily bars", () => {
    const r = computePositionLevels({ dailyBars: [], price: 568, nowMs: NOW });
    expect(r.status).toBe("unavailable");
    expect(r.reason).toBe("no daily data");
    expect(r.long).toBeNull();
    expect(r.short).toBeNull();
    const v = positionLevelView(r, "LONG");
    expect(v.status).toBe("unavailable");
    expect(v.message).toBe(POSITION_LEVELS_UNAVAILABLE);
    expect(v.message).toBe("Position levels unavailable (no daily data)");
    expect(v.stop).toBeNull();
    expect(v.tp1).toBeNull();
  });

  it("null input is treated as no daily data", () => {
    expect(computePositionLevels({ dailyBars: null, nowMs: NOW }).reason).toBe("no daily data");
  });

  it("too few daily bars for ATR(14)", () => {
    const r = computePositionLevels({ dailyBars: weeklyShapedBars(B).slice(0, 10), nowMs: Date.parse("2026-06-13T00:00:00Z") });
    expect(r.status).toBe("unavailable");
    expect(r.reason).toMatch(/only 10 daily bars/);
  });

  it("too few weeks for weekly structure", () => {
    const r = computePositionLevels({ dailyBars: weeklyShapedBars([100, 101, 102, 103]), nowMs: Date.parse("2026-06-27T00:00:00Z") });
    expect(r.status).toBe("unavailable");
    expect(r.reason).toMatch(/only 4 weeks/);
  });

  it("stale daily bars", () => {
    const r = computePositionLevels({ dailyBars: weeklyShapedBars(B), nowMs: NOW + 30 * DAY });
    expect(r.status).toBe("unavailable");
    expect(r.reason).toMatch(/stale daily data/);
  });

  it("daily bars that disagree with the price (e.g. unadjusted split)", () => {
    const r = computePositionLevels({ dailyBars: weeklyShapedBars(B), price: 25, nowMs: NOW });
    expect(r.status).toBe("unavailable");
    expect(r.reason).toMatch(/disagree/);
  });

  it("ignores junk bars", () => {
    const bars = [...weeklyShapedBars(B), { timestamp: "2026-08-20", open: 0, high: Number.NaN, low: 0, close: 0 }];
    expect(computePositionLevels({ dailyBars: bars, price: 100, nowMs: NOW }).status).toBe("ok");
  });
});

describe("positionLevelView", () => {
  const levels = computePositionLevels({ dailyBars: weeklyShapedBars(B), price: 100, completedThrough: "2026-08-21", nowMs: NOW });

  it("matches the bias", () => {
    expect(positionLevelView(levels, "LONG")).toMatchObject({ status: "ok", direction: "LONG", stop: levels.long!.stop, entryTrigger: 101 });
    expect(positionLevelView(levels, "SHORT")).toMatchObject({ status: "ok", direction: "SHORT", stop: levels.short!.stop });
    expect(positionLevelView(levels, "BEARISH_RESEARCH").direction).toBe("SHORT");
  });

  it("neutral bias has no directional levels", () => {
    const v = positionLevelView(levels, "NEUTRAL");
    expect(v.status).toBe("no_direction");
    expect(v.stop).toBeNull();
  });

  it("packets saved before the levels existed say so", () => {
    expect(positionLevelView(undefined, "LONG").status).toBe("not_computed");
    const old = { ...levels, version: 1 } as unknown as PositionLevels;
    expect(positionLevelView(old, "LONG").status).toBe("not_computed");
  });

  it("carries the label, timeframe and expected hold for bots", () => {
    const v = positionLevelView(levels, "LONG");
    expect(v.label).toBe("Position (weekly/daily)");
    expect(v.timeframe).toBe("1W/1D");
    expect(v.expectedHold).toMatch(/6\+ weeks/);
  });
});

describe("edge packet carries the position levels next to the 15m levels", () => {
  it("projectEdgePacket adds positionLevels and levelsTimeframe", () => {
    const levels = computePositionLevels({ dailyBars: weeklyShapedBars(B), price: 100, completedThrough: "2026-08-21", nowMs: NOW });
    const packet = {
      packetId: "p1", createdAt: new Date().toISOString(), symbol: "MA", market: "EQUITIES", assetClass: "equity", timeframe: "15m",
      quote: { price: 100, changePercent: 0, lastScanAt: new Date().toISOString() },
      snapshot: {
        symbol: "MA", timeframe: "15m", price: 100, bias: "LONG",
        indicators: { ema20: 1, ema50: 1, ema200: null, vwap: 0, atr: 0, bbwpPercentile: 50, adx: 0, rvol: 0 },
        dve: { state: "NEUTRAL", direction: "NEUTRAL", persistence: 0, breakoutReadiness: 0, trap: false, exhaustion: false },
        timeConfluence: { score: 0, hotWindow: false, alignmentCount: 0, nextClusterAt: "" },
        levels: { pdh: 0, pdl: 0, weeklyHigh: 0, weeklyLow: 0, monthlyHigh: 0, monthlyLow: 0, midpoint: 0, vwap: 0 },
        targets: { entry: 99.73, invalidation: 98.65, target1: 101.35, target2: 0, target3: 0 },
        positionLevels: levels,
      },
      dataTruth: { status: "LIVE", trustScore: 80 },
      internalResearchScore: { score: 60, lifecycle: "READY", axes: {}, dominantAxis: null },
      trustAdjustedScore: 60,
      setup: { type: "TREND_CONTINUATION" },
      invalidationConditions: [],
      nextResearchChecks: [],
    } as unknown as Parameters<typeof projectEdgePacket>[0];
    const ep = projectEdgePacket(packet);
    expect(ep.levelsTimeframe).toBe("15m");
    expect(ep.stopLoss.level).toBe(98.65); // the 15m level is kept
    expect(ep.positionLevels).toMatchObject({ status: "ok", direction: "LONG", stop: levels.long!.stop, tp1: 131 });
  });
});

describe("memoizeProvider shares one equity daily-bar fetch", () => {
  function fakeProvider() {
    const calls = { daily: 0, levels: 0 };
    const bars = weeklyShapedBars(B).map((b) => ({ ...b, symbol: "MA", market: "EQUITIES", timeframe: "1D", volume: 1 })) as Bar[];
    const base: MarketDataProvider = {
      getBars: async () => [],
      getKeyLevels: async () => { calls.levels += 1; return []; },
      getDailyBars: async () => { calls.daily += 1; return bars; },
      getCrossMarketState: async () => ({ dxyState: "neutral", vixState: "unknown", breadthState: "neutral" }),
      getEventWindow: async () => ({ isActive: false, severity: null, nextEventAt: null }),
    };
    return { base, calls };
  }

  it("equities: key levels and position levels use the same memoised daily bars", async () => {
    const { base, calls } = fakeProvider();
    const p = memoizeProvider(base);
    const levels = await p.getKeyLevels("MA", "EQUITIES");
    const daily = await p.getDailyBars!("MA", "EQUITIES");
    await p.getDailyBars!("MA", "EQUITIES");
    expect(daily.length).toBe(60);
    expect(levels.find((l) => l.category === "PDH")).toBeTruthy();
    expect(calls).toEqual({ daily: 1, levels: 0 });
  });

  it("crypto keeps its own key-level path", async () => {
    const { base, calls } = fakeProvider();
    const p = memoizeProvider(base);
    await p.getKeyLevels("BTC", "CRYPTO");
    await p.getDailyBars!("BTC", "CRYPTO");
    expect(calls).toEqual({ daily: 1, levels: 1 });
  });

  it("providers without getDailyBars are unchanged", async () => {
    const { base, calls } = fakeProvider();
    const { getDailyBars: _omit, ...rest } = base;
    void _omit;
    const p = memoizeProvider(rest as MarketDataProvider);
    expect(p.getDailyBars).toBeUndefined();
    await p.getKeyLevels("MA", "EQUITIES");
    expect(calls.levels).toBe(1);
  });
});
