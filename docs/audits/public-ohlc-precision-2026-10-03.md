# F11: precision investigation
Two public CoinGecko BTC /ohlc?days=1 responses were compared on 3 Oct 2026. At close timestamp 1791021600000, the default close was 84582, while precision=full returned 84582.08109475873. The responses had different latest timestamps, so only matching candle timestamps were compared. Full precision demonstrably removes provider rounding for /ohlc.

The production daily adapter calls /ohlc/range. Its current official documentation does not expose precision. No authorised CoinGecko Pro credential was available locally for a matched range experiment. No claim is made that this fixes the reported 4–7% daily ATR difference. The adapter now discloses its aggregate venue basis. Compare identical 14-day completed candle intervals, quote currencies and Wilder ATR warm-up with a specific exchange before asserting parity.

Sources: https://docs.coingecko.com/reference/coins-id-ohlc and https://docs.coingecko.com/reference/coins-id-ohlc-range

Live verification after deploy: confirm /ohlc requests carry precision=full; compare matching timestamps, not differently cached latest candles. Daily range ATR parity remains an evidence-dependent follow-up, not a proven numerical defect.
