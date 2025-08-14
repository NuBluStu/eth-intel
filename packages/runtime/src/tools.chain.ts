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

// Helper: auto-chunk eth_getLogs for long spans with robust error handling
export async function getLogsWindow(args: {
  fromBlock: number | string;
  toBlock: number | string;
  address?: string;
  topics?: (string | null)[];
}) {
  // Configurable chunk size, default 2000 blocks per spec
  const span = parseInt(process.env.LOG_CHUNK_SIZE || "2000");
  const maxRange = 35000; // ~5 days at 12s/block
  
  const start = typeof args.fromBlock === "string" ? parseInt(args.fromBlock, 16) : args.fromBlock;
  const end = args.toBlock === "latest" ? await latestBlock() :
              (typeof args.toBlock === "string" ? parseInt(args.toBlock, 16) : args.toBlock);
  
  // Validate range
  const totalBlocks = end - start + 1;
  if (totalBlocks > maxRange) {
    throw new Error(`Block range ${totalBlocks} exceeds maximum of ${maxRange} blocks (~5 days). Please reduce range.`);
  }
  
  const out: any[] = [];
  let processed = 0;
  
  for (let a = start; a <= end; a += span) {
    const b = Math.min(a + span - 1, end);
    const logFilter: any = {
      fromBlock: "0x" + a.toString(16),
      toBlock:   "0x" + b.toString(16)
    };
    
    // Only add address if it's a non-empty string
    if (args.address && args.address.trim() !== "") {
      logFilter.address = args.address;
    }
    // Only add topics if provided
    if (args.topics && args.topics.length > 0) {
      logFilter.topics = args.topics;
    }
    
    // Progress logging for long queries
    if (totalBlocks > 10000) {
      console.log(`Processing blocks ${a}-${b} (${Math.floor(processed/totalBlocks*100)}% complete)`);
    }
    
    // Retry logic with smaller chunks on failure
    let chunk: any[] = [];
    let retrySpan = b - a + 1;
    let retryStart = a;
    
    while (retryStart <= b) {
      try {
        const retryEnd = Math.min(retryStart + retrySpan - 1, b);
        const retryFilter = {
          ...logFilter,
          fromBlock: "0x" + retryStart.toString(16),
          toBlock: "0x" + retryEnd.toString(16)
        };
        
        const result = await rpc("eth_getLogs", [retryFilter]);
        chunk.push(...result);
        retryStart = retryEnd + 1;
      } catch (e: any) {
        if (e.message?.includes("query returned more than") || e.message?.includes("timeout")) {
          // Reduce chunk size and retry
          retrySpan = Math.floor(retrySpan / 2);
          if (retrySpan < 10) {
            throw new Error(`eth_getLogs failed even with 10-block chunks: ${e.message}`);
          }
          console.warn(`Reducing chunk size to ${retrySpan} blocks due to: ${e.message}`);
        } else {
          throw e; // Re-throw other errors
        }
      }
    }
    
    out.push(...chunk);
    processed += (b - a + 1);
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

// Trace a single transaction with timeout and retry
export async function traceTransaction(args: { txHash: string }) {
  const maxRetries = 3;
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await rpc("trace_transaction", [args.txHash]);
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); // Exponential backoff
      }
    }
  }
  throw lastError;
}

// Trace a single block
export async function traceBlock(args: { blockNumber: number }) {
  return rpc("trace_block", ["0x" + args.blockNumber.toString(16)]);
}

// Filter traces by address with chunking
export async function traceFilter(args: {
  fromBlock: number;
  toBlock: number;
  fromAddress?: string[];
  toAddress?: string[];
}) {
  const span = 1000; // Smaller chunks for trace_filter
  const out: any[] = [];
  
  for (let a = args.fromBlock; a <= args.toBlock; a += span) {
    const b = Math.min(a + span - 1, args.toBlock);
    const filter: any = {
      fromBlock: "0x" + a.toString(16),
      toBlock: "0x" + b.toString(16)
    };
    
    if (args.fromAddress && args.fromAddress.length > 0) {
      filter.fromAddress = args.fromAddress;
    }
    if (args.toAddress && args.toAddress.length > 0) {
      filter.toAddress = args.toAddress;
    }
    
    try {
      const chunk = await rpc("trace_filter", [filter]);
      out.push(...chunk);
    } catch (e: any) {
      console.error(`trace_filter failed for blocks ${a}-${b}: ${e.message}`);
      // Continue with next chunk on error
    }
  }
  
  return out;
}

async function latestBlock() {
  const hex = await rpc("eth_blockNumber", []);
  return parseInt(hex, 16);
}