import { createHash } from 'node:crypto';
import { atomicQueries, q } from '@/lib/db';
type Result = {
    status: number;
    body: unknown;
};
/** Flat, validated request fields only; object property order must not change request identity. */
export function manualOrderHash(input: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(Object.keys(input).sort().map(key => [key, input[key]]))).digest('hex');
}
/** Receipt, order and journal commit together. Never initializes schema at request time. */
export async function manualOrderRequest(workspaceId: string, key: string, input: Record<string, unknown>, run: () => Promise<Result>) {
    const hash = manualOrderHash(input);
    return atomicQueries(async () => {
        await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`admin-manual-order:${workspaceId}:${key}`]);
        const [receipt] = await q<{
            request_hash: string;
            response_status: number;
            response_body: unknown;
        }>('SELECT request_hash, response_status, response_body FROM admin_manual_order_requests WHERE workspace_id=$1 AND request_key=$2', [workspaceId, key]);
        if (receipt) {
            if (receipt.request_hash !== hash)
                return { status: 409, body: { error: 'Idempotency key already used with different input' }, replayed: false };
            return { status: receipt.response_status, body: receipt.response_body, replayed: true };
        }
        const result = await run();
        await q('INSERT INTO admin_manual_order_requests (workspace_id,request_key,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5::jsonb)', [workspaceId, key, hash, result.status, JSON.stringify(result.body)]);
        return { ...result, replayed: false };
    });
}
