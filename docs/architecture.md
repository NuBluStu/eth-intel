# Architecture Document

## 1. Runtime
Node 20+, TypeScript, local LLM at http://127.0.0.1:11434/v1 (Ollama or llama.cpp), tool-calling loop in runtime.ts.

## 2. Modes
- Mode A – no-DB: RPC only
- Mode B – DuckDB: single file, rolling partitions

## 3. Data Model (DuckDB)
- erc20_transfers(block, ts, token, from, to, value, tx_hash, log_index)
- pools(dex, pool, token0, token1, fee_tier, first_block, first_ts)
- dex_events(block, ts, dex, pool, event, tx_hash, log_index, sender, recipient, amount0, amount1)
- Views: wallet_day_inout, project_trending, wallet_links

## 4. Tools API
- eth.rpc: eth_blockNumber, eth_getLogs, eth_getBlockByNumber, eth_getTransactionReceipt
- wallet.top_profit(days, limit)
- dex.scan_new_pools(days)
- project.trending(window_days)
- wallet.related(addr, days)
- token.founders(token_addr, days)
- sql.query(queryName, params) read-only

## 5. Ingestion
Backfill last N days via eth_getLogs (ERC-20 Transfer, UniV2 PairCreated, UniV3 PoolCreated, Swap/Mint/Burn).
Tail via WS head subscription. Retention tasks.

## 6. Dev/Run
Environment variables:
- MODE=duckdb
- RPC_HTTP=http://127.0.0.1:8545
- RPC_WS=ws://127.0.0.1:8546
- DUCKDB_PATH=~/eth-index/eth.duckdb
- RETENTION_DAYS=14
- LLM_BASE_URL=http://127.0.0.1:11434/v1
- LLM_MODEL=llama3.1:8b

Commands:
- ollama pull llama3.1:8b
- npm run start