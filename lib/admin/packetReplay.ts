/**
 * lib/admin/packetReplay.ts — Stage 5 packet-replay backtest.
 *
 * Reads historical AdminMarketPackets from admin_market_packets and joins
 * them with the corresponding edge_ledger_setups + outcomes (where the
 * packet drove a surfaced setup). Produces aggregate stats per packet
 * type / scope so the operator can answer "is the data pipeline producing
 * setups that actually work?".
 *
 * Boundary: read-only. No external API calls. Idempotent.
 */

import { q } from '@/lib/db';

export interface PacketReplayBucket {
  packetType: string;
  packetsBuilt: number;
  setupsLinked: number;       // setups whose packet_id matches a packet in window
  setupsTaken: number;
  setupsSkipped: number;
  setupsResolved: number;     // have an outcome row
  winsR5d: number;
  avgRealisedR5d: number | null;
  avgEvidenceQuality: number | null;
  avgOpportunityScore: number | null;
}

export interface PacketReplayReport {
  workspaceId: string;
  windowDays: number;
  generatedAt: string;
  buckets: PacketReplayBucket[];
  totals: {
    packetsBuilt: number;
    setupsLinked: number;
    setupsResolved: number;
    winsR5d: number;
  };
}

export async function buildPacketReplayReport(
  workspaceId: string,
  windowDays = 90,
): Promise<PacketReplayReport> {
  // 1. Count packets per type in window
  const packetCounts = await q<{ packet_type: string; n: number }>(
    `SELECT packet_type, COUNT(*)::int AS n
       FROM admin_market_packets
      WHERE workspace_id = $1
        AND built_at >= NOW() - ($2 || ' days')::interval
      GROUP BY packet_type`,
    [workspaceId, String(windowDays)],
  );

  // 2. Join setups → packets → outcomes in window
  //    `packet_id` on edge_ledger_setups stores the back-ref (may be NULL for
  //    pre-Stage-3 setups).
  const setupRows = await q<{
    packet_type: string | null;
    status: string;
    has_outcome: boolean;
    realised_r_5d: string | null;
    evidence_quality: string | null;
    opportunity_score: string | null;
  }>(
    `SELECT p.packet_type,
            s.status,
            (o.setup_id IS NOT NULL) AS has_outcome,
            o.realised_r_5d::text AS realised_r_5d,
            s.evidence_quality::text AS evidence_quality,
            s.opportunity_score::text AS opportunity_score
       FROM edge_ledger_setups s
  LEFT JOIN admin_market_packets p
         ON p.id = s.packet_id
        AND p.workspace_id = s.workspace_id
  LEFT JOIN edge_ledger_outcomes o
         ON o.setup_id = s.id
      WHERE s.workspace_id = $1
        AND s.surfaced_at >= NOW() - ($2 || ' days')::interval`,
    [workspaceId, String(windowDays)],
  );

  // 3. Bucket by packet_type
  const byType = new Map<string, PacketReplayBucket>();
  for (const pc of packetCounts) {
    byType.set(pc.packet_type, {
      packetType: pc.packet_type,
      packetsBuilt: pc.n,
      setupsLinked: 0, setupsTaken: 0, setupsSkipped: 0, setupsResolved: 0,
      winsR5d: 0,
      avgRealisedR5d: null, avgEvidenceQuality: null, avgOpportunityScore: null,
    });
  }
  const rSum: Record<string, { rTotal: number; rN: number; evTotal: number; evN: number; oppTotal: number; oppN: number }> = {};

  for (const row of setupRows) {
    const key = row.packet_type ?? '(unlinked)';
    if (!byType.has(key)) {
      byType.set(key, {
        packetType: key,
        packetsBuilt: 0,
        setupsLinked: 0, setupsTaken: 0, setupsSkipped: 0, setupsResolved: 0,
        winsR5d: 0,
        avgRealisedR5d: null, avgEvidenceQuality: null, avgOpportunityScore: null,
      });
    }
    const bucket = byType.get(key)!;
    if (row.packet_type) bucket.setupsLinked++;
    if (row.status === 'taken') bucket.setupsTaken++;
    if (row.status === 'skipped') bucket.setupsSkipped++;
    if (row.has_outcome) bucket.setupsResolved++;

    const r5 = row.realised_r_5d === null ? null : Number(row.realised_r_5d);
    const ev = row.evidence_quality === null ? null : Number(row.evidence_quality);
    const op = row.opportunity_score === null ? null : Number(row.opportunity_score);

    if (!rSum[key]) rSum[key] = { rTotal: 0, rN: 0, evTotal: 0, evN: 0, oppTotal: 0, oppN: 0 };
    if (r5 !== null && Number.isFinite(r5)) { rSum[key].rTotal += r5; rSum[key].rN++; if (r5 > 0) bucket.winsR5d++; }
    if (ev !== null && Number.isFinite(ev)) { rSum[key].evTotal += ev; rSum[key].evN++; }
    if (op !== null && Number.isFinite(op)) { rSum[key].oppTotal += op; rSum[key].oppN++; }
  }

  for (const [key, sums] of Object.entries(rSum)) {
    const b = byType.get(key)!;
    b.avgRealisedR5d = sums.rN > 0 ? sums.rTotal / sums.rN : null;
    b.avgEvidenceQuality = sums.evN > 0 ? sums.evTotal / sums.evN : null;
    b.avgOpportunityScore = sums.oppN > 0 ? sums.oppTotal / sums.oppN : null;
  }

  const buckets = Array.from(byType.values())
    .sort((a, b) => b.setupsLinked + b.packetsBuilt - (a.setupsLinked + a.packetsBuilt));

  const totals = buckets.reduce(
    (acc, b) => ({
      packetsBuilt: acc.packetsBuilt + b.packetsBuilt,
      setupsLinked: acc.setupsLinked + b.setupsLinked,
      setupsResolved: acc.setupsResolved + b.setupsResolved,
      winsR5d: acc.winsR5d + b.winsR5d,
    }),
    { packetsBuilt: 0, setupsLinked: 0, setupsResolved: 0, winsR5d: 0 },
  );

  return {
    workspaceId,
    windowDays,
    generatedAt: new Date().toISOString(),
    buckets,
    totals,
  };
}
