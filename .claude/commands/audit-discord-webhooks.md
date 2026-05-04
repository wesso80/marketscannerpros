# audit-discord-webhooks

Audit Discord webhook delivery.

Check:
- env variable exists
- webhook URL is not exposed client-side
- server route can access webhook
- payload shape is valid
- Discord response is logged
- failed responses are captured
- rate limits are handled
- alerts are not swallowed silently
- test route exists for admin-only webhook validation

Return:
1. Findings
2. Severity
3. Fix order
