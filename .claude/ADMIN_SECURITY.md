# Admin Security Baseline

## Access
- Admin terminal is private-only.
- Enforce server-side auth checks for all admin APIs.
- Deny access by default.

## Secrets
- Never expose webhook URLs client-side.
- Never expose API keys in browser bundles.
- Keep env-scoped secrets server-only.

## Logging
- Log admin actions and failed validations.
- Log outbound webhook responses and failures.
- Avoid logging sensitive credentials.

## Data Leakage Controls
- No admin-only payloads in public routes.
- No mixed caching between admin and public surfaces.
- Enforce workspace and tenant scoping on all queries.
