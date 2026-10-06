# Portfolio load POST 409 — investigation (2026-10-06)

The fix described in “Proposed fix” is implemented on the client. `replacePortfolio` and the `/api/portfolio` route contract are unchanged. Line numbers below describe the pre-fix code.

Live symptom: signed-in load of `/tools/workspace?tab=portfolio` at 1280px sent `POST /api/portfolio` with no user action, the server returned 409, and the page showed “Your saved portfolio changed since this page loaded… changes here are kept on this device only.” An earlier load at 390px showed no POST and no banner.

## Root cause

One component owns the book: `PortfolioContent` in `app/tools/portfolio/page.tsx`, mounted by the workspace as `PortfolioV1` (`app/tools/workspace/page.tsx` line 88). There is no second portfolio hook, provider, or desktop-only copy.

On mount the page GETs `/api/portfolio`, then a save effect POSTs whenever local JSON differs from the last server snapshot. Nothing in that path waits for a click.

1. Load effect (`app/tools/portfolio/page.tsx` 933–1026) stores `syncRevision` and, only when `cashState` is present, `lastSyncedJson` of the loaded payload (974–980). Comment says no POST until something changes.
2. The same load calls `refreshAllPrices` immediately (983–985, and 1020–1022 on the localStorage fallback). A quote that differs from `currentPrice` calls `setPositions` (874–885).
3. A second effect (1113–1124) runs once `dataLoaded` is true and any open or closed row exists. It recomputes account equity and calls `setPerformanceHistory(updateTodaySnapshot(...))`. `updateTodaySnapshot` (`lib/portfolio/equitySnapshot.ts` 18–25) replaces or appends today’s row when value, P&L, or basis differs. A new timestamp alone does not count.
4. The save effect (1092–1110) writes `localStorage`, then if `shouldPostPortfolio` (`lib/portfolio/clientSync.ts` 78–80) is true — sync enabled, revision present, payload JSON `!== lastSyncedJson` — it POSTs one second later via `enqueuePortfolioSync` (1034–1046). The body is the full book plus `baseRevision`.

For the signed-in book in the screenshot (eight open positions, live crypto marks), step 3 or step 2 is enough to dirty state on load. The POST is that debounced sync, not a user save.

`PortfolioV2` (`app/tools/workspace/PortfolioV2.tsx` 218–234) POSTs with no `baseRevision`, which the server would 409 as `revision_required`. Nothing imports it. It is not this request.

## Why 1280 showed the POST and 390 did not

There is no width check on this path. `PortfolioContent` has no `matchMedia` or `innerWidth`. The overview’s `lg:grid-cols-4` is CSS only (`components/portfolio/PortfolioOverview.tsx` line 14). `TabBar` mounts only the active panel (`components/visual/TabBar.tsx` 78–88), so Journal, Alerts, and the other Track tabs are not mounted beside Portfolio. The journal mobile-cards / desktop-table split (`app/globals.css` 310–325, breakpoint 640px) is not in this tree. The empty-panel fix removed a client-only `dynamic()` import; workspace now inlines one `PortfolioContent` at every width (`test/workspaceTabPanels.test.tsx`). Header desktop nav switches at 1440px, not 1280, and does not mount a portfolio. `reactStrictMode: true` (`next.config.mjs` line 9) double-invokes effects in development only; the save timeout is cleared on that simulated unmount, so StrictMode does not by itself produce a 409.

The same effects run at 390 and 1280. A 390 look can show no POST because the write is delayed until quotes return and then one more second (1092–1109). Resizing does not remount the page, so a timer started at 390 still fires after the viewport is 1280.

A lone POST whose `baseRevision` is the revision just returned by GET is accepted and **written**. The 409 means the fingerprint changed between this document’s GET and its POST. The usual writer is another copy of this same auto-save: the earlier 390 load, another tab, or another device. Wipe-and-replace issues new row ids, so any successful save moves `syncRevision`. If that save lands after the 1280 GET and before the 1280 POST, the 1280 request is `stale_revision`. That matches “no POST visible yet at 390, then 409 at 1280” without a desktop-only component. If the 390 load truly finished with no POST and nothing else saved, a later 1280 POST of a changed book would be 200, not 409.

A single client can also 409 if the cash-ledger read fails on one side only: the revision is `v1.<rows>.<cashFp>` or `v1.<rows>.unavailable` (`lib/portfolio/serverSync.ts` 66–86). That is not width-specific.

The banner text is shared by `stale_revision` and `revision_required` (`lib/portfolio/clientSync.ts` 97–98). This page always sends `baseRevision` (1046), so this 409 is the stale fingerprint, not a missing one. It is not `empty_overwrite` — that string is a different banner (56–57).

## Overwrite risk when there is no conflict

**Yes.** A matching `baseRevision` is a full replace, not a field patch (`lib/portfolio/serverSync.ts` 113–186, `app/api/portfolio/route.ts` 327–342). On conflict the handler returns 409 and writes nothing (115–123, route 335–339). On a match it deletes every manual position, every manual closed row, every performance row, and the whole cash ledger, then inserts the client payload. Journal-linked rows are left in place and skipped on insert. New ids are assigned, so the revision moves even when the amounts are unchanged.

Concrete cases, highest likelihood first:

1. **Derived snapshot or marks on load (high on this account).** Today’s equity doesn’t match the stored snapshot, or a quote moves `currentPrice`. No click. POST replaces manual rows, all performance history (today’s row updated), and the cash ledger. Likely whenever this eight-position book is opened and the revision is still current.
2. **Two loads racing (high, and this is the 409).** Both GET revision R. The first POST commits (case 1). The second gets 409 and writes nothing. The server book is whatever the first auto-save wrote, including new ids and refreshed marks. The banner appears on the loser.
3. **Stale `localStorage` uploaded onto an empty server book (medium).** Keys `portfolio_positions`, `portfolio_closed`, `portfolio_performance`, `portfolio_starting_capital`, `portfolio_cash_ledger` are not scoped to user or workspace. If GET is 200, the book is empty, and the revision is present, a non-empty device copy is posted (995–1017). `lastSyncedJson` is set only when that local payload is empty, so a leftover device book is treated as a migration. A shared browser or an old signed-out session can create rows on a workspace that had none.
4. **Server positions with `cashState: null` (lower, sharper if the cash read failed).** `lastSyncedJson` stays null (974–980), so the save effect POSTs. Cash in the body is device storage or the default `10000` and an empty ledger (961–966). A matching revision deletes the server cash ledger and writes that. The cash read used for `cashState` and the read used for the fingerprint are separate; a failed state read with a successful fingerprint read still allows the replace.
5. **Partial book.** An empty payload is refused while the server has manual rows, snapshots, or cash flows, unless `confirmClear` is set (`serverSync.ts` 121–123). A non-empty but incomplete payload is not refused. The mount path does not drop manual positions; it can omit journal-linked closed rows from the body (`splitClosedBook`, 956–968) and those rows stay on the server because deletes ignore `journal_entry_id`. Stops and targets are not columns; a replace does not store them. They are reattached from `localStorage` on the next GET (`positionLevels.ts` 121–140).

Failed GET disables POST (`clientSync.ts` 63–64). Signed-out `localOnly` does too.

## What the 409 banner does to data

The 409 request does not write. `blockPortfolioSync` (1028–1030, 1059–1060) sets `enabled: false` for the rest of the session and shows `CONFLICT_MESSAGE` (`clientSync.ts` 54–55, rendered at `page.tsx` 1894–1898). Later edits still update React state and `localStorage` (1095–1100 runs before the POST check) and are not sent.

That device copy is not a durable fork:

- Reload (`window.location.reload` on the banner button) loads the server book again. When the server has data, that load replaces state and then overwrites the same `localStorage` keys. Edits made after the banner are dropped, except manual stop/target fields merged back onto matching rows, and cash only when the server sent no `cashState`.
- The server copy may already be the other load’s auto-save (new ids, new marks, rewritten cash and today’s snapshot), not the book from before either page opened.
- “Kept on this device only” is true until the next successful load. It does not merge back.

## Proposed fix (do not implement here)

Stop treating derived mount updates as a save.

- POST only from explicit actions: add, close, delete, cash edit, clear. Do not call `enqueuePortfolioSync` from the load/save effect.
- Keep `refreshAllPrices` and `updateTodaySnapshot` as display updates, or ignore those fields in the dirty check. Do not let them schedule a wipe-and-replace.
- Set the synced snapshot only after those derived updates have been applied, and compare the fields the server actually stores. `lastSyncedJson === null` must not mean “post whatever is on the device.”
- Do not POST a `localStorage` book on load, including the empty-server migration. If a one-time import is still wanted, make it a button.
- Leave `PortfolioV2` unwired, or delete it, so a later import cannot POST without `baseRevision`.
- On 409, keep the current “write nothing” server behavior. Say that reload shows the server copy and drops unsynced edits on this device. Do not describe that as a saved device fork.

Tests that would prove it:

- Render `PortfolioContent` against a GET fixture whose today’s snapshot value differs from computed equity. Advance timers past one second. Assert no `POST /api/portfolio`. Repeat with quote responses that change `currentPrice`.
- Assert the same fixture does POST after add, close, cash apply, delete, and clear, and that clear is the only empty body with `confirmClear`.
- Assert a 200 GET with positions and `cashState: null`, plus non-empty `localStorage` cash, does not POST. Assert a 200 GET with an empty book plus non-empty `localStorage` positions does not POST.
- Two mounted copies with the same revision: neither POSTs on load, so the second cannot 409.
- Existing server tests stay: matching `baseRevision` replaces; stale or missing revision and empty-over-data write nothing (`test/portfolioServerSync.test.ts`, `test/portfolioPersistence.test.ts`).
- After a 409, a further state change does not POST. A reload-style GET does not send the forked payload.
- Width is not part of the fix. The existing workspace test that one active panel mounts one `PortfolioContent` is enough to lock that.
