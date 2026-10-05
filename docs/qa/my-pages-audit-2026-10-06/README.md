# My Pages — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

The saved-tool panel previously showed every card, four repeated metrics and a hover-only remove star. It now shows five shortcuts with Show all, a compact summary and permanently visible 40px remove buttons with separate link space. Manage pages keeps the existing catalogue, category filters and add/remove actions. Loading, signed-out, cached and failed states have clear copy; raw errors are hidden. One source line identifies personal preferences without inventing a sync timestamp.

Scope: FavoritesPanel only. Catalog, nav menus, Dashboard/Macro layout, favorite hook/API, access gates and saved alias resolution unchanged. Alias resolution/toggle block is byte-identical to base. This does not change the hook's pre-existing optimistic write/error handling.

Validation: 11 focused tests passed (myPagesCompact + phase2aCatalog), TypeScript and whitespace check passed. Tests verify original destinations/order, expansion/collapse, closed catalogue, alias removal, canonical add key, filtering, target classes and loading/cache/error/sign-in states. Hook is mocked; no provider requests or production writes.

Measured on `/tools/dashboard?tab=pages` with mocked fixtures. The screen count includes Dashboard chrome and the compact disclaimer. Details, PNG paths, and raw `scrollHeight` values are in [evidence.md](evidence.md) and [evidence.json](evidence.json).

| # | Hard layout gate | Status |
|---|---|---|
| 1 | One verdict above first fold | Pass. One `[data-my-pages-summary]`. Five-shortcut phone position is y 479–499 inside 844. |
| 2 | About two screens closed | **Pass.** Five shortcuts: 1.030 at 1280 and 1.495 at 390. Tallest closed state is cached copy at 1.519. Show all is 1.164 / 1.878, under 2.0. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390. Dashboard lens tabs do not overflow. |
| 4 | No fake/empty tool | Empty, cached, failed, and signed-out copy are distinct. |
| 5 | No banned/engine words | Not re-scanned beyond the visible fixture labels. Raw error text is not shown. |
| 6 | Readable numbers + one source line | One preferences source on populated, cached, and empty. Error and signed-out have zero. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Five shortcuts, Show all, cache, empty, error, and signed out. |
| 8 | Symbol / Overview / Track chrome | Unchanged by this evidence commit. Remove controls measure 40×40. Add/remove was not run on a signed-in account. |

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Keep draft. No merge or deploy.
