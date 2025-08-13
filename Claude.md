# BMAD-Compatible Plan: Local Ethereum Intelligence System (TypeScript + DuckDB + Local Llama)

## Repo Layout
eth-intel/
  docs/
    prd.md
    architecture.md
  bmad-core/
    core-config.yaml
  packages/
    runtime/
      src/
        runtime.ts
        tools.eth.ts
        tools.sql.ts
        tools.dex.ts
        indexer.ts
        schema.sql
      package.json
      tsconfig.json
      .env.example
  scripts/
    run-local.sh

## bmad-core/core-config.yaml
markdownExploder: true
prd:
  prdFile: docs/prd.md
  prdVersion: v4
  prdSharded: true
  prdShardedLocation: docs/prd
  epicFilePattern: epic-{n}*.md
architecture:
  architectureFile: docs/architecture.md
  architectureVersion: v4
  architectureSharded: true
  architectureShardedLocation: docs/architecture
dev:
  alwaysLoad:
    - packages/runtime/src/runtime.ts
    - packages/runtime/src/tools.eth.ts
    - packages/runtime/src/tools.sql.ts
    - packages/runtime/src/tools.dex.ts
    - packages/runtime/src/indexer.ts
    - packages/runtime/src/schema.sql
debug:
  enabled: true
  level: info

## docs/prd.md
### 1. Problem & Goals
Build a local-only Ethereum intelligence layer on macOS using TypeScript + DuckDB + local Llama (Ollama or llama.cpp) that answers arbitrary Ethereum mainnet questions via direct tool-calling. Data sources:
- Geth at http://127.0.0.1:8545 and ws://127.0.0.1:8546
- DuckDB file ~/eth-index/eth.duckdb (rolling window)
Must answer questions like:
1) Most profitable wallets in last 5 days
2) Monitor new liquidity pools + assess safety
3) New safe projects attracting wallets
4) Related wallets for an address
5) Wallet groups in trustworthy projects
6) Foundational wallets launching a token

### 2. Users
Local power users, traders, analysts.

### 3. Constraints
One store only: DuckDB (or no-DB mode). No REST. No remote infra. Local LLM.

### 4. Success Metrics
P95 ≤ 3s for indexed queries on 5–14 day windows. Freshness ≤ 1 block behind head. Accuracy ≥ 99.9% for supported decoders.

### 5. Features
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

### 6. Non-Goals
No archival data, multi-DB stacks, or remote servers.

### 7. Risks
Disk pressure → retention; ABI gaps → registry; slow no-DB → default to DuckDB.

### 8. Epics
Epic A: Runtime & LLM loop  
Epic B: Ingestion (DuckDB)  
Epic C: Analytics (six flagship Qs)  
Epic D: ETH traces add-on  
Epic E: Packaging & scripts

## docs/architecture.md
### 1. Runtime
Node 20+, TypeScript, local LLM at http://127.0.0.1:11434/v1 (Ollama or llama.cpp), tool-calling loop in runtime.ts.

### 2. Modes
Mode A – no-DB: RPC only  
Mode B – DuckDB: single file, rolling partitions

### 3. Data Model (DuckDB)
- erc20_transfers(block, ts, token, from, to, value, tx_hash, log_index)
- pools(dex, pool, token0, token1, fee_tier, first_block, first_ts)
- dex_events(block, ts, dex, pool, event, tx_hash, log_index, sender, recipient, amount0, amount1)
- Views: wallet_day_inout, project_trending, wallet_links

### 4. Tools API
- eth.rpc: eth_blockNumber, eth_getLogs, eth_getBlockByNumber, eth_getTransactionReceipt
- wallet.top_profit(days, limit)
- dex.scan_new_pools(days)
- project.trending(window_days)
- wallet.related(addr, days)
- token.founders(token_addr, days)
- sql.query(queryName, params) read-only

### 5. Ingestion
Backfill last N days via eth_getLogs (ERC-20 Transfer, UniV2 PairCreated, UniV3 PoolCreated, Swap/Mint/Burn).
Tail via WS head subscription. Retention tasks.

### 6. Dev/Run
.env:
MODE=duckdb
RPC_HTTP=http://127.0.0.1:8545
RPC_WS=ws://127.0.0.1:8546
DUCKDB_PATH=~/eth-index/eth.duckdb
RETENTION_DAYS=14
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=llama3.1:8b

run-local.sh:
ollama pull llama3.1:8b
npm run start

## packages/runtime/src/schema.sql
CREATE TABLE IF NOT EXISTS erc20_transfers (
  block BIGINT,
  ts TIMESTAMP,
  token TEXT,
  "from" TEXT,
  "to"   TEXT,
  value DECIMAL(38,0),
  tx_hash BLOB,
  log_index INTEGER
);
CREATE TABLE IF NOT EXISTS pools (
  dex TEXT,
  pool TEXT,
  token0 TEXT,
  token1 TEXT,
  fee_tier INTEGER,
  first_block BIGINT,
  first_ts TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dex_events (
  block BIGINT,
  ts TIMESTAMP,
  dex TEXT,
  pool TEXT,
  event TEXT,
  tx_hash BLOB,
  log_index INTEGER,
  sender TEXT,
  recipient TEXT,
  amount0 DECIMAL(38,0),
  amount1 DECIMAL(38,0)
);

## packages/runtime/src (story targets)
runtime.ts:
- OpenAI-compatible client to LLM_BASE_URL
- Register tools.eth, tools.sql, tools.dex
- Enforce guardrails

tools.eth.ts:
- viem client, allowlist RPC
- getLogsWindow with chunking/retries

tools.sql.ts:
- duckdb bindings (read-only)
- Named queries: top_profit, new_pools, related_wallets, project_trending, token_founders

tools.dex.ts:
- Decoders: ERC-20 Transfer, UniV2 PairCreated, UniV3 PoolCreated
- Safety heuristics

indexer.ts:
- Backfill N days
- WS tail into DuckDB
- Retention

.env.example:
See Dev/Run section

package.json:
{
  "name": "@onchain-intel/runtime",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node --enable-source-maps dist/runtime.js",
    "dev": "tsx src/runtime.ts"
  },
  "dependencies": {
    "duckdb": "^1.0.0",
    "viem": "^2.9.0",
    "zod": "^3.23.8",
    "openai": "^4.57.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.2"
  }
}

tsconfig.json:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}

## BMAD Execution Steps
1. Planning: Save this PRD + Architecture to docs/.
2. Switch to IDE & Shard: PO shards per core-config.yaml.
3. SM/Dev/QA: One story at a time.

### First Three Stories
Story A1: LLM tool-calling runtime
Story B1: RPC & log windowing helper
Story C1: DuckDB schema + top-profit query