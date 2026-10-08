import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { tx } from '@/lib/db';
import { publicDailyLimit, type PublicPlan, type PublicQuotaKind } from './publicPlans';
type Transaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
export type QuotaRequest = { subject: string; plan: PublicPlan; kind: PublicQuotaKind; resource: string; fingerprint: string };
export type QuotaReservation = { subject: string; day: string; kind: PublicQuotaKind; resource: string; token: string };
/** All inputs are server-owned: authenticated subject, verified plan, canonical resource and request hash.
 * AI resource is a caller-stable request ID and fingerprint binds it to the actual question/context.
 * A completed retry must replay a stored answer, never run the model again. */
export function createPublicDailyQuota(transaction: Transaction = tx) {
  return {
    async reserve(request: QuotaRequest) {
      const limit = publicDailyLimit(request.plan, request.kind);
      for (const value of [request.subject,request.resource,request.fingerprint]) if (!value || value.length > 256) throw new Error('Invalid quota identity');
      return transaction(async client => {
        // DB clock is authoritative. PostgreSQL handles both Eastern DST transitions.
        const { rows: [clock] } = await client.query(`SELECT to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
          (((now() AT TIME ZONE 'America/New_York')::date + 1)::timestamp AT TIME ZONE 'America/New_York') AS reset_at`);
        const keys = [request.subject, clock.day, request.kind];
        await client.query('INSERT INTO public_daily_quota_buckets(subject_key,quota_day,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',keys);
        await client.query('SELECT 1 FROM public_daily_quota_buckets WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 FOR UPDATE',keys);
        const { rows: [existing] } = await client.query('SELECT status, fingerprint FROM public_daily_quota_entries WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 AND resource_key=$4',[...keys,request.resource]);
        const { rows: [count] } = await client.query(`SELECT count(*)::int AS used FROM public_daily_quota_entries WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 AND status IN ('reserved','completed')`,keys);
        const base = { day: clock.day as string, resetsAt: new Date(clock.reset_at).toISOString(), limit, used: Number(count.used) };
        if (existing && existing.fingerprint !== request.fingerprint) return { ...base, status: 'conflict' as const };
        // Completed Symbol reports are revisitable; completed AI requests require cached replay.
        if (existing?.status === 'completed') return { ...base, status: 'completed' as const };
        if (existing?.status === 'reserved') return { ...base, status: 'pending' as const };
        if (limit !== null && base.used >= limit) return { ...base, status: 'limited' as const };
        const token = randomUUID();
        await client.query(`INSERT INTO public_daily_quota_entries(subject_key,quota_day,kind,resource_key,fingerprint,token,status)
          VALUES($1,$2,$3,$4,$5,$6,'reserved') ON CONFLICT(subject_key,quota_day,kind,resource_key)
          DO UPDATE SET token=EXCLUDED.token,status='reserved',updated_at=now()`,[...keys,request.resource,request.fingerprint,token]);
        return { ...base, used: base.used+1, status: 'reserved' as const, reservation: { subject: request.subject, day: clock.day, kind: request.kind, resource: request.resource, token } as QuotaReservation };
      });
    },
    /** Complete only after usable output is durably stored; release only confirmed unsuccessful work.
     * Unknown/interrupted outcomes stay reserved. Token fencing prevents an old worker completing a retry. */
    async settle(reservation: QuotaReservation, outcome: 'completed' | 'released') {
      if (!['completed','released'].includes(outcome)) throw new Error('Invalid quota outcome');
      return transaction(async client => {
        const keys = [reservation.subject,reservation.day,reservation.kind];
        await client.query('SELECT 1 FROM public_daily_quota_buckets WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 FOR UPDATE',keys);
        const result = await client.query(`UPDATE public_daily_quota_entries SET status=$6,updated_at=now()
          WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 AND resource_key=$4 AND token=$5 AND status='reserved' RETURNING status`,[...keys,reservation.resource,reservation.token,outcome]);
        if (result.rowCount) return true;
        const { rows: [row] } = await client.query('SELECT status FROM public_daily_quota_entries WHERE subject_key=$1 AND quota_day=$2 AND kind=$3 AND resource_key=$4 AND token=$5',[...keys,reservation.resource,reservation.token]);
        return row?.status === outcome;
      });
    },
  };
}
