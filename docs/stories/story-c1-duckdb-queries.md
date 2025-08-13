# Story C1: DuckDB Schema & Top-Profit Query

## Story Details
**Epic**: C - Analytics  
**Status**: ✅ COMPLETED  
**Points**: 2  
**Type**: Technical Implementation  
**Files**: `packages/runtime/src/schema.sql`, `packages/runtime/src/tools.sql.ts`

## User Story
As an **analyst**, I want to **query for the most profitable wallets**, so that **I can identify successful trading strategies**.

## Acceptance Criteria

### Schema Requirements
- [x] Three core tables: erc20_transfers, pools, dex_events
- [x] Proper data types (BIGINT, TIMESTAMP, TEXT, DECIMAL)
- [x] Indexes on frequently queried columns
- [x] Views for complex calculations

### Query Requirements
- [x] Top profitable wallets by net flow
- [x] Time-windowed queries (N days)
- [x] Parameterized to prevent SQL injection
- [x] Read-only access enforced
- [x] Results limited for performance

### Tool Implementation
- [x] `wallet_top_profit(days, limit)`
- [x] `dex_scan_new_pools(days)`
- [x] `wallet_related(address, days)`
- [x] `project_trending(window_days)`
- [x] `token_founders(token_address, days)`
- [x] `sql_query(queryName, params)` for named queries

## Definition of Done
- [x] Schema created in DuckDB
- [x] All views functioning correctly
- [x] Named queries return accurate results
- [x] Performance < 3s for 14-day queries
- [x] Tools integrated with runtime

## Test Scenarios

### Scenario 1: Profit Calculation
**Given**: Wallet with 100 ETH in, 50 ETH out  
**When**: wallet_profit view queried  
**Then**: Net flow = 50 ETH, profit % = 100%

### Scenario 2: Time Window
**Given**: 30 days of data  
**When**: top_profit(days=5, limit=10)  
**Then**: Only last 5 days analyzed

### Scenario 3: Related Wallets
**Given**: Address A traded with B and C  
**When**: wallet_related(A, days=7)  
**Then**: Returns B and C with interaction counts

### Scenario 4: SQL Injection Prevention
**Given**: Malicious input with SQL  
**When**: Parameters passed to query  
**Then**: Parameterized query prevents injection

## Implementation Notes

### Views Created
1. **wallet_day_inout**: Daily in/out flows per wallet
2. **wallet_profit**: PnL calculation with percentages
3. **project_trending**: 7-day moving averages
4. **wallet_links**: Relationship graph data

### Query Performance
- Indexes on: block, ts, from, to, token, pool
- Views pre-aggregate common calculations
- LIMIT clauses prevent runaway queries

## SQL Examples

```sql
-- Top profitable wallets
SELECT wallet, net_flow, profit_percentage
FROM wallet_profit
WHERE EXISTS (
  SELECT 1 FROM wallet_day_inout
  WHERE wallet = wallet_profit.wallet
    AND day >= CURRENT_DATE - INTERVAL 5 DAY
)
ORDER BY net_flow DESC
LIMIT 10;
```

## Configuration
```env
DUCKDB_PATH=~/eth-index/eth.duckdb
RETENTION_DAYS=14
```

## Risks & Mitigations
- **Risk**: Slow queries on large datasets
  - **Mitigation**: Proper indexing and limits
- **Risk**: SQL injection
  - **Mitigation**: Parameterized queries only
- **Risk**: Disk space growth
  - **Mitigation**: 14-day retention policy