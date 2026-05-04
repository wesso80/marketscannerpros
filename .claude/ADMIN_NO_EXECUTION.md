# No Execution Policy (Hard Rule)

The private Admin Terminal must not:
- place orders
- connect to brokers for order placement
- route orders to external execution venues
- automate live trade execution
- simulate successful fills as if they were real

Allowed:
- setup research
- signal discovery
- risk context overlays
- backtest and journal analytics
- alerting and monitoring

Any request that implies live order execution must be refused and redirected to research-only workflows.
