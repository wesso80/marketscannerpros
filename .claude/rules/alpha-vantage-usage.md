# Alpha Vantage Usage Rule

- Respect provider rate limits.
- Cache with explicit TTL and stale markers.
- Handle partial payloads and quota failures explicitly.
- Never backfill missing fields silently with hardcoded values.
