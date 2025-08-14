# Claude.md – Ethereum High-Level Question Orchestration (BMAD-Ready)

## Goal
Upgrade `eth-intel-ingest` into a **local Ethereum research assistant** that:
1. Accepts plain-English questions.
2. Breaks them into solvable sub-tasks.
3. Calls every available local blockchain API and data source.
4. Aggregates intermediate results into final answers.

---

## 1. Core Principles
- **Local First**: Runs entirely on your Mac with Geth + Lighthouse.
- **Expose All Methods**: Every JSON-RPC and Lighthouse endpoint accessible.
- **Max Reasoning**: Enable multi-step planning and long context for LLM.
- **Composable Tools**: Each blockchain capability is a discrete callable function.
- **Intermediate Memory**: Store intermediate results in RAM for step chaining.

---

## 2. Architecture
Local LLM (Llama3 / Claude Code)
|
v
orchestrator.ts
|
+–> data/ethRpc.ts        # Geth JSON-RPC client
+–> data/beaconApi.ts     # Lighthouse REST client
+–> data/db.ts            # DuckDB + Parquet for historical queries
|
+–> analysis/utils.ts     # math, stats, graphs, simulations

---

## 3. Required Components

### 3.1 Orchestrator (`src/orchestrator.ts`)
- Input: natural language.
- Output: orchestrated tool calls + aggregated answer.
- Logic:
  1. Parse question → sub-tasks.
  2. Sequence or parallelize tool calls.
  3. Store intermediate results in memory.
  4. Produce aggregated answer.

**Example**:
> Q: “Which wallets bought tokens that later 10x’d, and what are they buying now?”
1. Identify 10x tokens (price/history lookup).
2. Find buyers before pump (Geth logs).
3. Fetch current holdings (ERC-20 balances).
4. Sort and return wallet list + token list.

---

### 3.2 Tool Layer (`src/tools/`)
- **Geth JSON-RPC**:
  - `getBlock(number|hash)`
  - `getTransaction(hash)`
  - `getTransactionReceipt(hash)`
  - `getLogs(filter)`
  - `traceTransaction(hash)`
  - `ethCall(data)`
  - `getBalance(address)`
  - `getCode(address)`

- **Lighthouse Beacon API**:
  - `getValidatorDuties()`
  - `getAttestations()`
  - `getProposals()`

- **DuckDB + Parquet**:
  - Export blocks, tx, receipts, logs into Parquet.
  - Query with:
    ```ts
    const rows = await duckdb.query(`
      SELECT * FROM txs WHERE to = '${address}' AND value > 1e18
    `)
    ```

- **Analysis Utils**:
  - Pattern detection
  - Hypothesis testing
  - Relationship mapping
  - Portfolio analysis
  - Backtesting

---

## 4. Data Storage Layer

### Why DuckDB + Parquet?
- Reads directly from disk (no server).
- Handles billions of blockchain rows.
- Append-only structure fits Ethereum.
- Perfect for LLM iterative queries.

**Pipeline**:
Raw Node Data → JSON → Parquet
Parquet → DuckDB Virtual Table
LLM → SQL → Results

---

## 5. LLM Integration
- **System Prompt**:
You are an Ethereum analyst.
For any high-level question:
	1.	Break it into smaller tasks.
	2.	Call blockchain tools to get raw data.
	3.	Store intermediate results.
	4.	Analyze and combine.
	5.	Return clear, complete answers.

  - Allow multiple tool calls per turn.
- Support chaining of Geth, Beacon, and DuckDB queries.

---

## 6. Example Capabilities
- “Find wallets consistently buying profitable tokens early.”
- “Predict validator slashing risk based on 90 days of performance.”
- “Map wallets trading together in the same blocks.”
- “Compare LP returns vs holding over the last 6 months.”

---

## 7. BMAD Implementation Steps
1. **Tool Wrappers**  
   - Implement all JSON-RPC + Lighthouse methods in `src/tools`.
2. **Orchestrator**  
   - Accept NL → plan → tool call sequence → aggregate.
3. **Intermediate Result Store**  
   - Keep results in a session object.
4. **Parquet Export**  
   - Batch Geth/Lighthouse data to Parquet; register in DuckDB.
5. **Testing**  
   - Use sample questions to validate multi-step reasoning.
6. **Local LLM Bind**  
   - Connect orchestrator + tools to local Llama3/Claude Code runtime.

---

## 8. Benefits
- **No API limits** — fully local.
- **Full data access** — every method exposed.
- **High complexity support** — LLM can chain many steps.
- **Extensible** — add new data sources/tools anytime.