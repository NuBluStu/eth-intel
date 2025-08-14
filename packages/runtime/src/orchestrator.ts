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
  tool: z.enum([
    "chain.rpc",
    "chain.getLogsWindow",
    "chain.traceBlockRange",
    "chain.traceTxBatch",
    "chain.traceFilter",
    "chain.traceBlock",
    "chain.traceTransaction",
    "sql.query",
    "sql.materialize"
  ]),
  args: z.record(z.any()),
  why: z.string().max(120).optional(),
  saveAs: z.string().optional()
});
const Plan = z.object({ goal: z.string(), steps: z.array(Step).min(1).max(8) });

export async function answer(question: string) {
  const plan = await makePlan(question);
  const summaries: any[] = [];
  let currentBlock: number | null = null;
  
  for (const s of plan.steps) {
    // Validate and fix block ranges before execution
    if ((s.tool === "chain.getLogsWindow" || s.tool === "chain.traceFilter") && s.args.fromBlock !== undefined) {
      // If this is the first step and we haven't gotten current block, get it first
      if (currentBlock === null && s.id === "s1") {
        console.log("Warning: Getting current block first before processing logs");
        const blockHex = await chain.rpc("eth_blockNumber", []);
        currentBlock = parseInt(blockHex, 16);
      }
      
      // Fix invalid block ranges
      if (typeof s.args.fromBlock === 'number' && s.args.fromBlock < 1000) {
        // Likely an incorrect calculation, use last 24h instead
        if (currentBlock) {
          s.args.fromBlock = currentBlock - 7200; // Last 24 hours
          console.log(`Fixed invalid fromBlock to ${s.args.fromBlock} (last 24h)`);
        }
      }
      
      // Ensure range doesn't exceed 35k blocks
      if (s.args.toBlock === "latest" && currentBlock && s.args.fromBlock) {
        const range = currentBlock - s.args.fromBlock;
        if (range > 35000) {
          s.args.fromBlock = currentBlock - 35000;
          console.log(`Adjusted fromBlock to ${s.args.fromBlock} to stay within 35k block limit`);
        }
      }
    }
    
    const result = await runStep(s);
    
    // Capture current block if this was eth_blockNumber
    if (s.tool === "chain.rpc" && s.args.method === "eth_blockNumber") {
      currentBlock = parseInt(result, 16);
      console.log(`Current block: ${currentBlock}`);
    }
    
    summaries.push(summarize(s, result));
    if (s.saveAs && s.tool === "sql.query") {
      await sql.materialize(s.saveAs, s.args.sqlText);
    }
  }
  return synthesize(question, summaries);
}

async function makePlan(question: string) {
  const sys = `You are an Ethereum planner. Output ONLY JSON: {"goal": "...", "steps":[{"id":"s1","tool":"...","args":{...},"why":"short","saveAs":"opt"}] }.

CRITICAL RULES:
1. ALWAYS get current block number FIRST before any time-based queries
2. Block ranges MUST NOT exceed 35,000 blocks (~5 days at 12s/block)
3. Time conversions: 1 hour = 300 blocks, 24 hours = 7200 blocks, 1 week = 50400 blocks
4. For "recent" or "last N hours" queries: currentBlock - (hours * 300)
5. fromBlock must be a positive integer, NOT "latest" (only toBlock can be "latest")

Available tools:
- chain.rpc: Call any Ethereum RPC method. Args: {method: string, params: array}
  ALWAYS START WITH: {"id":"s1","tool":"chain.rpc","args":{"method":"eth_blockNumber"},"why":"Get current block"}
  Examples:
  - eth_blockNumber: no params needed
  - eth_getBalance: params: ["0xADDRESS", "latest"]
  - eth_gasPrice: no params needed
  
- chain.getLogsWindow: Get logs for a block range. Args: {fromBlock: number, toBlock: number|"latest", address?: string, topics?: string[]}
  MAX RANGE: 35,000 blocks. For larger ranges, split into multiple steps.
  Example for last 24h: If current block is 6611119, use fromBlock: 6603919, toBlock: 6611119
  For ERC20 Transfer events use topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
  
- chain.traceBlockRange: Get traces for blocks. Args: {start: number, end: number}
  Keep ranges small (< 100 blocks) as traces are heavy
  
- chain.traceTxBatch: Get traces for transactions. Args: {txHashes: string[]}
- chain.traceFilter: Filter traces by address. Args: {fromBlock: number, toBlock: number, fromAddress?: string[], toAddress?: string[]}
- chain.traceBlock: Get all traces for a single block. Args: {blockNumber: number}
- chain.traceTransaction: Get trace for single tx. Args: {txHash: string}
- sql.query: Query DuckDB. Args: {sqlText: string, params?: object}
- sql.materialize: Save query result as table. Args: {name: string, sqlText: string}

Example plans:

1. For any time-based query, ALWAYS start with getting current block:
{"goal":"Find recent activity","steps":[{"id":"s1","tool":"chain.rpc","args":{"method":"eth_blockNumber"},"why":"Get current block"}]}

2. Then calculate ranges using actual numbers (not variables):
If current block is 23138577, last 24h would be: fromBlock: 23131377, toBlock: 23138577

NEVER use variables like "currentBlock-7200" in JSON. Use actual calculated numbers!
Bad: {"fromBlock": currentBlock-7200}
Good: {"fromBlock": 23131377}`;
  const maxRetries = 3;
  let lastError: any;
  let systemPrompt = sys;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const rsp = await client.chat.completions.create({
        model: MODEL, 
        temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.2"),
        max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "2048"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${question}\nReturn ONLY JSON plan. No markdown, no explanation, just pure JSON.` }
        ]
      });
      
      let text = rsp.choices[0]?.message?.content || "{}";
      console.log(`Raw LLM response (attempt ${attempt}):`, text.substring(0, 500));
      
      // Clean up common LLM response issues
      text = text.trim();
      // Remove markdown code blocks if present
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      text = text.replace(/^```\s*/i, '').replace(/```\s*$/, '');
      
      // Try to extract JSON if there's extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      
      const json = JSON.parse(text);
      return Plan.parse(json);
    } catch (e) {
      lastError = e;
      console.log(`Plan generation attempt ${attempt} failed: ${e}`);
      
      if (attempt < maxRetries) {
        // Add more explicit instructions on retry
        systemPrompt += `\n\nIMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, no explanations.`;
      }
    }
  }
  
  // Fallback: create a simple plan to at least get current block
  console.log("Using fallback plan due to JSON parsing failures");
  return Plan.parse({
    goal: "Get blockchain info for: " + question,
    steps: [
      { id: "s1", tool: "chain.rpc", args: { method: "eth_blockNumber" }, why: "Get current block" }
    ]
  });
}

async function runStep(s: z.infer<typeof Step>) {
  console.log(`Executing step ${s.id}: ${s.tool}`, JSON.stringify(s.args, null, 2));
  
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
    case "chain.traceFilter":
      return chain.traceFilter({
        fromBlock: s.args.fromBlock,
        toBlock: s.args.toBlock,
        fromAddress: s.args.fromAddress,
        toAddress: s.args.toAddress
      });
    case "chain.traceBlock":
      return chain.traceBlock({
        blockNumber: s.args.blockNumber
      });
    case "chain.traceTransaction":
      return chain.traceTransaction({
        txHash: s.args.txHash
      });
    case "sql.query":            
      return sql.query(s.args.sqlText, s.args.params);
    case "sql.materialize":      
      return sql.materialize(s.args.name, s.args.sqlText);
  }
}

function summarize(step: any, res: any) {
  // Convert BigInt to string for JSON serialization
  const sanitize = (obj: any): any => {
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = sanitize(value);
      }
      return result;
    }
    return obj;
  };
  
  const sanitized = sanitize(res);
  if (Array.isArray(sanitized)) return { id: step.id, tool: step.tool, rows: sanitized.length, sample: sanitized.slice(0,3) };
  if (typeof sanitized === "object") return { id: step.id, tool: step.tool, keys: Object.keys(sanitized).slice(0,10), sample: sanitized };
  return { id: step.id, tool: step.tool, value: sanitized };
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