# BMAD Plan: Minimal Maximally-Open Ethereum Planner (TypeScript)

## Intent
Let a local LLM (Llama 3 via Ollama/llama.cpp) accept high-level questions, think deeply, produce a small JSON plan (1–8 steps), execute plan steps against a **local Geth/Lighthouse**, and synthesize an answer. Expose all practical **read-only** node capabilities via a single `chain.*` tool namespace + light SQL helpers.

## Assumptions (aligns to existing codebase)
- Node 20+, TypeScript.
- You already run: Geth (HTTP 8545, WS 8546) + Lighthouse.
- Project has a `packages/runtime/src` with a `runtime.ts` entry (we’ll keep it).
- Optional DuckDB file for materializing intermediate datasets.
- Local LLM exposes OpenAI-compatible endpoint (e.g., `http://127.0.0.1:11434/v1`).

## Repo Layout (create/extend these files)
packages/runtime/
  src/
    runtime.ts                # entrypoint (wire orchestration)
    orchestrator.ts           # planner → execute → synthesize
    tools.chain.ts            # all read-side RPC, WS, traces; transparent chunking + timeouts
    tools.sql.ts              # minimal SQL helpers (query + materialize)
  package.json
  tsconfig.json
.env.example
docs/
  prd.md
  architecture.md
bmad-core/
  core-config.yaml

## bmad-core/core-config.yaml
markdownExploder: true
prd:
  prdFile: docs/prd.md
  prdVersion: v1
  prdSharded: false
architecture:
  architectureFile: docs/architecture.md
  architectureVersion: v1
  architectureSharded: false
dev:
  alwaysLoad:
    - packages/runtime/src/runtime.ts
    - packages/runtime/src/orchestrator.ts
    - packages/runtime/src/tools.chain.ts
    - packages/runtime/src/tools.sql.ts
debug:
  enabled: true
  level: info

## docs/prd.md
### Goal
Answer complex, high-level questions about Ethereum mainnet locally. The model must: (1) think/plan, (2) call tools to fetch/derive data, (3) synthesize a clear result. No REST servers, one process, local privacy.

### Users
Local power user on macOS with Geth/Lighthouse running.

### Scope
- Expose all **read-only** JSON-RPC for analysis: `eth_*`, `net_*`, `web3_*`, `txpool_*`, `debug_*`, `trace_*` (+ client read methods).
- Deny only node/key-control: `personal_*`, `account_*`, `admin_*`, `miner_*`, `engine_*`.
- Helpers: `getLogsWindow`, `traceBlockRange`, `traceTxBatch`.
- Optional SQL: `sql.query`, `sql.materialize(name, SELECT ...)` to store intermediates in DuckDB for fast joins/aggregations.

### Success Metrics
- Can decompose a question into a JSON plan and complete ≤ 8 steps.
- Typical Q returns within ~90s with concrete numbers + “what I did”.
- Supports example Qs (profitable wallets 5d, new pools safety, founders, related wallets, etc.) without changing code.

### Non-Goals
- No write-side or node control actions. No remote infra.

## docs/architecture.md
### Runtime
- OpenAI-compatible client pointed at local LLM (Ollama/llama.cpp).
- `orchestrator.ts` prompts model for a **Plan JSON**: `{goal, steps:[{id,tool,args,why?,saveAs?}]}`.
- Tools execute sequentially; large results can be materialized as DuckDB tables (optional).
- Final synthesis call generates the human answer + short provenance.

### Tools
- `chain.rpc(method, params[])`: forwards read-side RPC to `http://127.0.0.1:8545`; rejects `personal_*|account_*|admin_*|miner_*|engine_*`. Per-call timeout (e.g., 60s).
- `chain.getLogsWindow({fromBlock,toBlock,address?,topics?})`: auto-chunks long ranges (e.g., 5k blocks/chunk), merges results.
- `chain.traceBlockRange({start,end})`: iterates `debug_traceBlockByNumber`/`trace_block` per block.
- `chain.traceTxBatch({txHashes:[]})`: runs `debug_traceTransaction` over a small explicit set.
- `sql.query(sql, params?)`: read-only; injects LIMIT 10k if missing.
- `sql.materialize(name, selectSql)`: creates/overwrites a table/view; returns row count.

### Planner Prompts (system)
- Plan: “You are a planner. Think carefully. Output ONLY JSON: {goal, steps[ {id,tool,args,why?,saveAs?} ]}. Tools: chain.rpc, chain.getLogsWindow, chain.traceBlockRange, chain.traceTxBatch, sql.query, sql.materialize. Prefer small, verifiable steps. Keep ‘why’ short.”
- Synthesis: “You are an Ethereum analyst. Given step summaries (counts, samples, block windows), produce a concise answer with concrete numbers and a short ‘what I did’ section. Note if data is partial.”

## .env.example
RPC_HTTP=http://127.0.0.1:8545
RPC_WS=ws://127.0.0.1:8546
DUCKDB_PATH=~/eth-index/eth.duckdb
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=llama3.1:8b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=2048
LLM_NUM_CTX=8192

## packages/runtime/package.json
{
  "name": "@onchain-open/runtime",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node --enable-source-maps dist/runtime.js",
    "dev": "tsx src/runtime.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "openai": "^4.57.0",
    "viem": "^2.9.0",
    "duckdb": "^1.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.2"
  }
}

## packages/runtime/tsconfig.json
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

## packages/runtime/src/tools.chain.ts (skeleton)
import { z } from "zod";

// Deny dangerous namespaces; allow all practical read methods.
const DENY = /^(personal_|account_|admin_|miner_|engine_)/;
const RPC = process.env.RPC_HTTP || "http://127.0.0.1:8545";

export async function rpc(method: string, params: any[] = []) {
  if (DENY.test(method)) throw new Error(`Method ${method} is not allowed`);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

// Helper: auto-chunk eth_getLogs for long spans
export async function getLogsWindow(args: {
  fromBlock: number | string;
  toBlock: number | string;
  address?: string;
  topics?: (string | null)[];
}) {
  const span = 5000;
  const start = typeof args.fromBlock === "string" ? parseInt(args.fromBlock) : args.fromBlock;
  const end = args.toBlock === "latest" ? await latestBlock() :
              (typeof args.toBlock === "string" ? parseInt(args.toBlock) : args.toBlock);
  const out: any[] = [];
  for (let a = start; a <= end; a += span) {
    const b = Math.min(a + span - 1, end);
    const chunk = await rpc("eth_getLogs", [{
      fromBlock: "0x" + a.toString(16),
      toBlock:   "0x" + b.toString(16),
      address: args.address,
      topics: args.topics
    }]);
    out.push(...chunk);
  }
  return out;
}

export async function traceBlockRange(args: { start: number; end: number }) {
  const out: any[] = [];
  for (let n = args.start; n <= args.end; n++) {
    const traces = await rpc("debug_traceBlockByNumber", ["0x" + n.toString(16), {}]);
    out.push({ blockNumber: n, traces });
  }
  return out;
}

export function traceTxBatch(args: { txHashes: string[] }) {
  return Promise.all(args.txHashes.map(tx => rpc("debug_traceTransaction", [tx, {}])));
}

async function latestBlock() {
  const hex = await rpc("eth_blockNumber", []);
  return parseInt(hex, 16);
}

## packages/runtime/src/tools.sql.ts (skeleton)
import duckdb from "duckdb";

const db = new duckdb.Database(process.env.DUCKDB_PATH || ":memory:");

export async function query(sqlText: string, params?: Record<string, any>) {
  const text = /\blimit\b/i.test(sqlText) ? sqlText : `${sqlText}\nLIMIT 10000`;
  return exec(text, params);
}

export async function materialize(name: string, selectSql: string) {
  const safe = name.replace(/[^a-zA-Z0-9_]/g, "_");
  await exec(`CREATE OR REPLACE TABLE ${safe} AS ${selectSql}`);
  const rows = await exec(`SELECT COUNT(*) AS n FROM ${safe}`);
  return { name: safe, rows: rows[0]?.n ?? 0 };
}

function exec(sqlText: string, params?: Record<string, any>) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sqlText, Object.values(params || {}), (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

## packages/runtime/src/orchestrator.ts (skeleton)
import { OpenAI } from "openai";
import { z } from "zod";
import * as chain from "./tools.chain";
import * as sql from "./tools.sql";

const client = new OpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: "ollama" });
const MODEL = process.env.LLM_MODEL || "llama3.1:8b";

const Step = z.object({
  id: z.string(),
  tool: z.enum(["chain.rpc","chain.getLogsWindow","chain.traceBlockRange","chain.traceTxBatch","sql.query","sql.materialize"]),
  args: z.record(z.any()),
  why: z.string().max(120).optional(),
  saveAs: z.string().optional()
});
const Plan = z.object({ goal: z.string(), steps: z.array(Step).min(1).max(8) });

export async function answer(question: string) {
  const plan = await makePlan(question);
  const summaries: any[] = [];
  for (const s of plan.steps) {
    const result = await runStep(s);
    summaries.push(summarize(s, result));
    if (s.saveAs && s.tool === "sql.query") {
      await sql.materialize(s.saveAs, s.args.sqlText);
    }
  }
  return synthesize(question, summaries);
}

async function makePlan(question: string) {
  const sys = `You are a planner. Output ONLY JSON: {"goal": "...", "steps":[{"id":"s1","tool":"...","args":{...},"why":"short","saveAs":"opt"}] }.
Tools: chain.rpc, chain.getLogsWindow, chain.traceBlockRange, chain.traceTxBatch, sql.query, sql.materialize.
Decompose into small, verifiable steps. Prefer fetching small, relevant slices then materialize and aggregate.`;
  const rsp = await client.chat.completions.create({
    model: MODEL, temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Question: ${question}\nReturn ONLY JSON plan.` }
    ]
  });
  const text = rsp.choices[0]?.message?.content || "{}";
  const json = JSON.parse(text);
  return Plan.parse(json);
}

async function runStep(s: z.infer<typeof Step>) {
  switch (s.tool) {
    case "chain.rpc":            return chain.rpc(s.args.method, s.args.params || []);
    case "chain.getLogsWindow":  return chain.getLogsWindow(s.args);
    case "chain.traceBlockRange":return chain.traceBlockRange(s.args);
    case "chain.traceTxBatch":   return chain.traceTxBatch(s.args);
    case "sql.query":            return sql.query(s.args.sqlText, s.args.params);
    case "sql.materialize":      return sql.materialize(s.args.name, s.args.sqlText);
  }
}

function summarize(step: any, res: any) {
  if (Array.isArray(res)) return { id: step.id, tool: step.tool, rows: res.length, sample: res.slice(0,3) };
  if (typeof res === "object") return { id: step.id, tool: step.tool, keys: Object.keys(res).slice(0,10) };
  return { id: step.id, tool: step.tool, value: res };
}

async function synthesize(question: string, summaries: any[]) {
  const sys = `You are an Ethereum analyst. Using the step summaries, provide a concise answer with concrete numbers and a short "what I did". If partial, say so.`;
  const rsp = await client.chat.completions.create({
    model: MODEL, temperature: 0.3,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Question: ${question}\nSummaries:\n${JSON.stringify(summaries, null, 2)}` }
    ]
  });
  return rsp.choices[0]?.message?.content || "";
}

## packages/runtime/src/runtime.ts (wire-up)
import "dotenv/config";
import { answer } from "./orchestrator";

async function main() {
  const q = process.argv.slice(2).join(" ") || "Find the most profitable wallets in the last 5 days.";
  const out = await answer(q);
  console.log("\n=== ANSWER ===\n" + out);
}
main().catch(e => { console.error(e); process.exit(1); });

## BMAD Stories (execute in order)

### Story 1 — Tool Surface
- Create `tools.chain.ts` with: rpc, getLogsWindow, traceBlockRange, traceTxBatch (deny admin/key/engine; per-call timeout; logs chunking).
- Create `tools.sql.ts` with: query (inject LIMIT 10k if missing), materialize(name, SELECT ...).
- Acceptance: can call `node packages/runtime/dist/runtime.js "eth_blockNumber via chain.rpc"` and get a valid result.

### Story 2 — Planner
- Create `orchestrator.ts` with Plan schema, plan call, step execution, and synthesis.
- Acceptance: given a natural question, planner returns a valid plan (≤ 8 steps), executes, and produces an answer.

### Story 3 — Sane Defaults for Deep Thinking
- In `.env`, set LLM_NUM_CTX=8192, LLM_MAX_TOKENS=2048, LLM_TEMPERATURE=0.2.
- Acceptance: for a multi-step question (e.g., “top profitable wallets 5d”), system returns an answer with a short “what I did”.

### (Optional) Story 4 — DuckDB Wire-up
- Point DUCKDB_PATH to a file; confirm `sql.materialize` persists tables and `sql.query` can join them.
- Acceptance: the planner can save an intermediate dataset and use it in a later step.

## Runbook
brew install ollama
ollama pull llama3.1:8b
cp .env.example .env    # adjust RPC_HTTP/WS and LLM_BASE_URL/MODEL
npm install
npm run dev             # pass your question as CLI args or wire a REPL