# Product Requirements Document

## 1. Problem & Goals
Build a local-only Ethereum intelligence layer on macOS using TypeScript + DuckDB + local Llama (Ollama or llama.cpp) that answers arbitrary Ethereum mainnet questions via direct tool-calling. 

Data sources:
- Geth at http://127.0.0.1:8545 and ws://127.0.0.1:8546
- DuckDB file ~/eth-index/eth.duckdb (rolling window)

Must answer questions like:
1. Most profitable wallets in last 5 days
2. Monitor new liquidity pools + assess safety
3. New safe projects attracting wallets
4. Related wallets for an address
5. Wallet groups in trustworthy projects
6. Foundational wallets launching a token

## 2. Users
Local power users, traders, analysts.

## 3. Constraints
One store only: DuckDB (or no-DB mode). No REST. No remote infra. Local LLM.

## 4. Success Metrics
- P95 ≤ 3s for indexed queries on 5–14 day windows
- Freshness ≤ 1 block behind head
- Accuracy ≥ 99.9% for supported decoders

## 5. Features
- Optional indexer: backfill last N days; tail into DuckDB
- Minimal schema: erc20_transfers, pools, dex_events
- Views for PnL, trending, links
- LLM-callable tools:
  - eth.rpc(method, params) allowlist
  - dex.scan_new_pools(window)
  - wallet.top_profit(days, limit)
  - wallet.related(addr, days)
  - project.trending(window_days)
  - token.founders(token_addr, days)
  - sql.query(name, params) read-only
- Guardrails: time caps, LIMITs

## 6. Non-Goals
No archival data, multi-DB stacks, or remote servers.

## 7. Risks
- Disk pressure → retention
- ABI gaps → registry
- Slow no-DB → default to DuckDB

## 8. Epics
- Epic A: Runtime & LLM loop
- Epic B: Ingestion (DuckDB)
- Epic C: Analytics (six flagship Qs)
- Epic D: ETH traces add-on
- Epic E: Packaging & scripts