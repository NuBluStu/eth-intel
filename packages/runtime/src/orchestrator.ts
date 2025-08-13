import { OpenAI } from "openai";
import { z } from "zod";
import * as chain from "./tools.chain.js";
import * as sql from "./tools.sql.js";

const client = new OpenAI({ 
  baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1", 
  apiKey: "ollama" 
});
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
  const sys = `You are an Ethereum planner. Output ONLY JSON: {"goal": "...", "steps":[{"id":"s1","tool":"...","args":{...},"why":"short","saveAs":"opt"}] }.

Available tools:
- chain.rpc: Call any Ethereum RPC method. Args: {method: string, params: array}
  Examples: eth_blockNumber, eth_getBlockByNumber, eth_getTransactionReceipt, eth_call
- chain.getLogsWindow: Get logs for a block range. Args: {fromBlock: number, toBlock: number|"latest", address?: string, topics?: string[]}
  Use for finding ERC20 Transfer events (topic: 0xddf252ad...)
- chain.traceBlockRange: Get traces for blocks. Args: {start: number, end: number}
- chain.traceTxBatch: Get traces for transactions. Args: {txHashes: string[]}
- sql.query: Query DuckDB. Args: {sqlText: string, params?: object}
  Tables: erc20_transfers, pools, dex_events
- sql.materialize: Save query result as table. Args: {name: string, sqlText: string}

For current block: use chain.rpc with method "eth_blockNumber"
For ERC20 tokens: search Transfer events with topic 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
For new tokens: look for first Transfer events from 0x0000000000000000000000000000000000000000`;
  const rsp = await client.chat.completions.create({
    model: MODEL, 
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.2"),
    max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "2048"),
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
    case "chain.rpc":            
      return chain.rpc(s.args.method, s.args.params || []);
    case "chain.getLogsWindow":  
      return chain.getLogsWindow({
        fromBlock: s.args.fromBlock,
        toBlock: s.args.toBlock,
        address: s.args.address,
        topics: s.args.topics
      });
    case "chain.traceBlockRange":
      return chain.traceBlockRange({
        start: s.args.start,
        end: s.args.end
      });
    case "chain.traceTxBatch":   
      return chain.traceTxBatch({
        txHashes: s.args.txHashes
      });
    case "sql.query":            
      return sql.query(s.args.sqlText, s.args.params);
    case "sql.materialize":      
      return sql.materialize(s.args.name, s.args.sqlText);
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
    model: MODEL, 
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Question: ${question}\nSummaries:\n${JSON.stringify(summaries, null, 2)}` }
    ]
  });
  return rsp.choices[0]?.message?.content || "";
}