# No Public Leakage

Do not leak:
- admin-only scores
- internal watchlists
- private webhook status
- internal risk commentary
- private model diagnostics

Any public-facing response must strip private admin fields.
