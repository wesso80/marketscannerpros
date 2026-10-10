-- Split and dividend facts for raw daily bars in ohlcv_bars.
-- Readers adjust on read. The worker records these from a payload it already downloaded.
-- Apply by hand. A missing table is treated as no actions. Does not alter ohlcv_bars.
CREATE TABLE IF NOT EXISTS equity_corporate_actions (
  symbol varchar(20) NOT NULL,
  session date NOT NULL,
  split_coefficient numeric(18, 8) NOT NULL DEFAULT 1,
  dividend_amount numeric(18, 8) NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, session)
);
