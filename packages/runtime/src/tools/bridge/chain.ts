/**
 * Bridge module to provide backwards compatibility
 * Maps old tools.chain.ts interface to new tools/data/ethRpc.ts
 */

import { ethRpc } from "../data/ethRpc.js";

// Re-export the basic rpc function with the old name
export async function rpc(method: string, params: any[] = []) {
  return ethRpc.rpcCall(method, params);
}

// Map getLogsWindow to getLogsChunked
export async function getLogsWindow(args: {
  fromBlock: number | string;
  toBlock: number | string;
  address?: string;
  topics?: (string | null)[];
}) {
  return ethRpc.getLogsChunked({
    fromBlock: typeof args.fromBlock === 'string' ? parseInt(args.fromBlock, 16) : args.fromBlock,
    toBlock: args.toBlock,
    address: args.address,
    topics: args.topics
  });
}

// Map traceTransaction to new interface
export async function traceTransaction(args: { txHash: string }) {
  return ethRpc.traceTransaction(args.txHash);
}

// Map traceBlock to new interface
export async function traceBlock(args: { blockNumber: number }) {
  return ethRpc.traceBlock(args.blockNumber);
}

// Simplified implementations for other trace functions
export async function traceBlockRange(args: { start: number; end: number }) {
  const results = [];
  for (let i = args.start; i <= args.end; i++) {
    const traces = await ethRpc.traceBlock(i);
    results.push({ blockNumber: i, traces });
  }
  return results;
}

export function traceTxBatch(args: { txHashes: string[] }) {
  return Promise.all(args.txHashes.map(hash => ethRpc.traceTransaction(hash)));
}

export async function traceFilter(args: {
  fromBlock: number;
  toBlock: number;
  fromAddress?: string[];
  toAddress?: string[];
}) {
  // Simplified implementation - in a real scenario you'd want more sophisticated filtering
  console.warn("traceFilter is simplified in bridge - consider using newer ethRpc interface");
  return [];
}