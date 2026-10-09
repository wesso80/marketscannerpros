import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const {q}=vi.hoisted(()=>({q:vi.fn(async()=>[])}));vi.mock('@/lib/db',()=>({q}));vi.mock('@/lib/adminAuth',()=>({requireAdmin:async()=>({ok:false})}));
it('rejects an invalid date before querying',async()=>{
 const {GET}=await import('@/app/api/scanner/daily-picks/route');
 const r=await GET(new NextRequest('https://test/api/scanner/daily-picks?date=2026-02-31'));
 expect(r.status).toBe(400);expect(q).not.toHaveBeenCalled();
});
it('reads retained history using a bound date rather than only the latest snapshot',async()=>{
 const {GET}=await import('@/app/api/scanner/daily-picks/route');
 await GET(new NextRequest('https://test/api/scanner/daily-picks?date=2026-10-02'));
 // Public path: the date is the only bound parameter (no score-based row limit in SQL).
 expect(q).toHaveBeenCalledWith(expect.stringContaining('daily_picks_history'),['2026-10-02']);
});
