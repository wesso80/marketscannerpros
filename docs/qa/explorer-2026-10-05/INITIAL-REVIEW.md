# Job 8 initial review — before UI edits

Base: `3e43d9a2303bb23fb6f3463e7bac5a6f5701fdc2`. Isolated Pro API fixtures, not live acceptance. Equity and Crypto Deep-Dive are the default unrun search states; no symbol has been selected. Other tabs have populated shared market/news fixtures, with absent derivative feeds explicitly absent. All seven views have a repeated outer hero/custom tab strip. No application files changed in this checkpoint.

| View | Desktop screens | Phone screens | Finding |
|---|---:|---:|---|
| overview | 2.300 | 4.763 | 4.76 phone screens; open sectors, categories and four mover lists; no single verdict/source. |
| heatmap | 1.385 | 2.083 | 2.08 screens; open sector table and holdings; ETF_PROFILE leaks from holdings error. |
| cross | 1.308 | 1.956 | 1.96 screens; redundant hero and open static relationships; no single source line. |
| equity | 1.596 | 2.193 | Unrun search is 2.19 screens with duplicate Markets and Equity headings; loaded view still needs inspection. |
| crypto | 1.811 | 3.039 | Unrun search is 3.04 screens; Permission, Golden Egg, Unknown and Unavailable; duplicate market gate and headers. |
| crypto-command | 2.584 | 4.635 | 4.64 screens; duplicated verdict panels, raw Unavailable/Permission and Command Center branding; incomplete-feed fixture. |
| crypto-intel | 2.569 | 3.389 | 3.39 screens; 12 news rows and open treasuries; missing cost basis says Unavailable. |

All phone document widths are 390. No browser page errors. Full raw DOM, word hits, geometry, requests and observation times are in `initial-review.json`. Commodities content and Movers data remain out of scope; both will receive only the required shared tab shell change.
