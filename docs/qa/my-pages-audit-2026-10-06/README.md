# My Pages — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

The saved-tool panel previously showed every card, four repeated metrics and a hover-only remove star. It now shows five shortcuts with Show all, a compact summary and permanently visible 40px remove buttons with separate link space. Manage pages keeps the existing catalogue, category filters and add/remove actions. Loading, signed-out, cached and failed states have clear copy; raw errors are hidden. One source line identifies personal preferences without inventing a sync timestamp.

Scope: FavoritesPanel only. Catalog, nav menus, Dashboard/Macro layout, favorite hook/API, access gates and saved alias resolution unchanged. Alias resolution/toggle block is byte-identical to base. This does not change the hook's pre-existing optimistic write/error handling.

Validation: 11 focused tests passed (myPagesCompact + phase2aCatalog), TypeScript and whitespace check passed. Tests verify original destinations/order, expansion/collapse, closed catalogue, alias removal, canonical add key, filtering, target classes and loading/cache/error/sign-in states. Hook is mocked; no provider requests or production writes.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One summary tested; position for Pip |
| About two screens closed | Pending Pip |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Empty/loading/cache/error states explicit |
| No banned/engine words | Raw error hidden; populated copy for Pip |
| Readable numbers + one source line | Simple counts; one preferences source |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | Existing canonical catalogue names; nav unchanged |

**Pip to check:** `/tools/dashboard?tab=pages`, before/after at 1280×800 and 390×844. Capture five saved tools, closed browser, first-fold summary, page-height/screen counts and overflow. Check long labels, always-visible removal targets, Show all/five, Manage pages, category filters, keyboard focus, empty archive and signed-out/cache/error states. Add/remove only on a disposable test account; verify shortcuts retain exact destinations. Check combined Dashboard chrome and disclaimer height.

User assigned visual acceptance to Pip. Keep draft/HOLD pending that evidence. No merge/deploy.
