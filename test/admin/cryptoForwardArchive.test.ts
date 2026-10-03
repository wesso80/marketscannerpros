import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
import {q} from '@/lib/db';
import {FORWARD_ARCHIVE_MARGIN_DAYS,FORWARD_ARCHIVE_PRUNE_BATCH,FORWARD_ARCHIVE_WINDOW_DAYS,archiveForwardRows,forwardArchiveCutoff,loadArchivedForwardRows,pruneForwardArchive} from '@/lib/admin/cryptoForwardArchive';
const row={id:'bitcoin',symbol:'BTC',bucket:'VOLUME_WATCH',signalAt:'2026-10-01T01:00:00.000Z',signalPrice:1,next4h:{status:'waiting' as const},day:{status:'filled' as const,changePct:1}};
afterEach(()=>{vi.unstubAllEnvs();vi.mocked(q).mockReset();});
it('loads the calibration window and prunes older rows in one bounded batch',async()=>{
 vi.stubEnv('DATABASE_URL','postgres://example');
 const now=Date.parse('2026-10-03T00:00:00.000Z');
 vi.mocked(q).mockResolvedValueOnce([]);
 vi.mocked(q).mockResolvedValueOnce([{payload:row}]);
 const loaded=await loadArchivedForwardRows(now);
 expect(loaded).toEqual([row]);
 const [pruneSql,pruneParams]=vi.mocked(q).mock.calls[0];
 const [loadSql,loadParams]=vi.mocked(q).mock.calls[1];
 expect(String(pruneSql)).toMatch(/DELETE FROM crypto_forward_outcome_archive WHERE row_key IN \(SELECT row_key FROM crypto_forward_outcome_archive WHERE signal_day < \$1::date ORDER BY signal_day ASC LIMIT \$2\)/);
 expect(pruneParams).toEqual([forwardArchiveCutoff(now,FORWARD_ARCHIVE_WINDOW_DAYS+FORWARD_ARCHIVE_MARGIN_DAYS),FORWARD_ARCHIVE_PRUNE_BATCH]);
 expect(String(loadSql)).toBe('SELECT payload FROM crypto_forward_outcome_archive WHERE signal_day >= $1::date');
 expect(loadParams).toEqual([forwardArchiveCutoff(now,FORWARD_ARCHIVE_WINDOW_DAYS)]);
 expect(FORWARD_ARCHIVE_WINDOW_DAYS).toBe(180);
 expect(FORWARD_ARCHIVE_MARGIN_DAYS).toBe(30);
});
it('updates an archive row only when the payload or symbol changed',async()=>{
 vi.stubEnv('DATABASE_URL','postgres://example');
 vi.mocked(q).mockResolvedValue([]);
 await archiveForwardRows([row]);
 const sql=String(vi.mocked(q).mock.calls[0][0]);
 expect(sql).toMatch(/ON CONFLICT \(row_key\) DO UPDATE SET payload=EXCLUDED.payload, symbol=EXCLUDED.symbol, archived_at=NOW\(\) WHERE crypto_forward_outcome_archive.payload IS DISTINCT FROM EXCLUDED.payload OR crypto_forward_outcome_archive.symbol IS DISTINCT FROM EXCLUDED.symbol/);
 expect(String(vi.mocked(q).mock.calls[1][0])).toMatch(/DELETE FROM crypto_forward_outcome_archive/);
});
it('ignores a failed prune and still returns the windowed rows',async()=>{
 vi.stubEnv('DATABASE_URL','postgres://example');
 vi.mocked(q).mockRejectedValueOnce(Error('missing table'));
 await expect(pruneForwardArchive()).resolves.toBeUndefined();
 vi.mocked(q).mockRejectedValueOnce(Error('missing table'));
 vi.mocked(q).mockResolvedValueOnce([{payload:row}]);
 await expect(loadArchivedForwardRows(Date.parse('2026-10-03T00:00:00.000Z'))).resolves.toEqual([row]);
});
it('adds a signal_day index without touching trading tables',()=>{
 const sql=readFileSync('migrations/113_crypto_forward_outcome_archive_signal_day_idx.sql','utf8');
 expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS crypto_forward_outcome_archive_signal_day_idx/);
 expect(sql).toMatch(/ON crypto_forward_outcome_archive \(signal_day\)/);
 expect(sql).not.toMatch(/DROP |ALTER |arca_|crypto_paper|REFERENCES/i);
});
