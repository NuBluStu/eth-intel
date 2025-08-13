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
  const start = typeof args.fromBlock === "string" ? parseInt(args.fromBlock, 16) : args.fromBlock;
  const end = args.toBlock === "latest" ? await latestBlock() :
              (typeof args.toBlock === "string" ? parseInt(args.toBlock, 16) : args.toBlock);
  const out: any[] = [];
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
    const chunk = await rpc("eth_getLogs", [logFilter]);
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