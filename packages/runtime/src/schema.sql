-- Core tables for Ethereum intelligence

CREATE TABLE IF NOT EXISTS erc20_transfers (
  block BIGINT,
  ts TIMESTAMP,
  token TEXT,
  "from" TEXT,
  "to" TEXT,
  value VARCHAR,
  tx_hash BLOB,
  log_index BIGINT
);

CREATE INDEX IF NOT EXISTS idx_erc20_transfers_block ON erc20_transfers(block);
CREATE INDEX IF NOT EXISTS idx_erc20_transfers_ts ON erc20_transfers(ts);
CREATE INDEX IF NOT EXISTS idx_erc20_transfers_from ON erc20_transfers("from");
CREATE INDEX IF NOT EXISTS idx_erc20_transfers_to ON erc20_transfers("to");
CREATE INDEX IF NOT EXISTS idx_erc20_transfers_token ON erc20_transfers(token);

CREATE TABLE IF NOT EXISTS pools (
  dex TEXT,
  pool TEXT PRIMARY KEY,
  token0 TEXT,
  token1 TEXT,
  fee_tier INTEGER,
  first_block BIGINT,
  first_ts TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pools_dex ON pools(dex);
CREATE INDEX IF NOT EXISTS idx_pools_token0 ON pools(token0);
CREATE INDEX IF NOT EXISTS idx_pools_token1 ON pools(token1);
CREATE INDEX IF NOT EXISTS idx_pools_first_block ON pools(first_block);

CREATE TABLE IF NOT EXISTS dex_events (
  block BIGINT,
  ts TIMESTAMP,
  dex TEXT,
  pool TEXT,
  event TEXT,
  tx_hash BLOB,
  log_index BIGINT,
  sender TEXT,
  recipient TEXT,
  amount0 VARCHAR,
  amount1 VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_dex_events_block ON dex_events(block);
CREATE INDEX IF NOT EXISTS idx_dex_events_ts ON dex_events(ts);
CREATE INDEX IF NOT EXISTS idx_dex_events_pool ON dex_events(pool);
CREATE INDEX IF NOT EXISTS idx_dex_events_event ON dex_events(event);
CREATE INDEX IF NOT EXISTS idx_dex_events_sender ON dex_events(sender);

-- View for wallet daily in/out flows
CREATE OR REPLACE VIEW wallet_day_inout AS
SELECT 
  DATE_TRUNC('day', ts) as day,
  "to" as wallet,
  token,
  SUM(value) as inflow,
  0 as outflow
FROM erc20_transfers
GROUP BY 1, 2, 3
UNION ALL
SELECT 
  DATE_TRUNC('day', ts) as day,
  "from" as wallet,
  token,
  0 as inflow,
  SUM(value) as outflow
FROM erc20_transfers
GROUP BY 1, 2, 3;

-- View for wallet profit/loss calculation
CREATE OR REPLACE VIEW wallet_profit AS
WITH flows AS (
  SELECT 
    wallet,
    SUM(inflow) as total_inflow,
    SUM(outflow) as total_outflow,
    SUM(inflow) - SUM(outflow) as net_flow
  FROM wallet_day_inout
  GROUP BY wallet
)
SELECT 
  wallet,
  total_inflow,
  total_outflow,
  net_flow,
  CASE 
    WHEN total_outflow > 0 THEN (net_flow::DOUBLE / total_outflow::DOUBLE) * 100
    ELSE 0
  END as profit_percentage
FROM flows
WHERE total_inflow > 0 OR total_outflow > 0;

-- View for trending projects (based on unique wallet interactions)
CREATE OR REPLACE VIEW project_trending AS
WITH wallet_interactions AS (
  SELECT 
    token as project,
    DATE_TRUNC('day', ts) as day,
    COUNT(DISTINCT "from") + COUNT(DISTINCT "to") as unique_wallets,
    COUNT(*) as tx_count
  FROM erc20_transfers
  GROUP BY 1, 2
)
SELECT 
  project,
  day,
  unique_wallets,
  tx_count,
  AVG(unique_wallets) OVER (
    PARTITION BY project 
    ORDER BY day 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as wallet_7d_avg,
  AVG(tx_count) OVER (
    PARTITION BY project 
    ORDER BY day 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as tx_7d_avg
FROM wallet_interactions;

-- View for wallet relationships (co-occurrence in transactions)
CREATE OR REPLACE VIEW wallet_links AS
WITH wallet_pairs AS (
  SELECT 
    LEAST("from", "to") as wallet1,
    GREATEST("from", "to") as wallet2,
    token,
    COUNT(*) as interaction_count
  FROM erc20_transfers
  WHERE "from" != "to"
  GROUP BY 1, 2, 3
)
SELECT 
  wallet1,
  wallet2,
  COUNT(DISTINCT token) as common_tokens,
  SUM(interaction_count) as total_interactions
FROM wallet_pairs
GROUP BY 1, 2
HAVING SUM(interaction_count) > 1;