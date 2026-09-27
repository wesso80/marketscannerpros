# Portfolio Lab review — 27 September 2026

All twelve existing pages were inspected in production: dashboard, positions, orders, trades, journal, performance, analytics, playbooks, risk, reports, edge packets and settings.

The ARCA ledger holds $200,000 simulated cash, no open positions, orders or closed trades. Dashboard, positions, orders, trades, performance and analytics agree. This is a separate book from saved personal holdings used by the account risk desk. Zero paper trades is not evidence of a profitable or validated strategy.

Journal and risk contain candidate rejections. Some otherwise passing research candidates request crypto exposure above the configured 25% asset-class cap (39–135% in inspected records). The exposure guard is performing its check. This release does not relax limits, change sizing or run a simulation cycle.

Changes:
- Add workspace-scoped read-only saved holdings feed and page, with saved price/record-time caveats and option multipliers. Unsupported futures valuation stays unavailable.
- Add navigation across every Portfolio Lab page, label paper positions separately, and point Decision Desk's Portfolio link to saved holdings.
- Do not show empty states alongside load failures. Mark performance and report API payloads as simulated.
- Equity position history requests full daily history with coherent adjusted OHLC, separate from compact scanner cache. Persist market-qualified position history for equities and crypto. Read-only Decision Desk can reuse it and retry previously unavailable legacy evidence.
- Explicit manual history repair uses five-symbol batches, existing provider rate controls, and six-hour reuse of saved history. No discovery scan, trades, orders, notification or bot activity.

Remaining distinctions:
- ARCA consumes its existing edge-packet engine; it is not yet a validated six-week strategy portfolio.
- Saved holdings are recorded portfolio data, not a live broker connection or current quote service.
- Missing/unsupported provider histories and short listings remain unavailable with reasons; the 26-week/6-month thresholds are unchanged.
