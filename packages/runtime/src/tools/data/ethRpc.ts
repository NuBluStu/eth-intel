/**
 * Geth JSON-RPC Client
 * Clean interface to all Ethereum node methods
 */

const RPC_URL = process.env.RPC_HTTP || "http://127.0.0.1:8545";
const TIMEOUT_MS = 60_000;

// Core RPC call function
async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`RPC error: ${response.status} ${response.statusText}`);
    }
    
    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    }
    
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

// Block Methods
export async function getBlock(numberOrHash: number | string, includeTransactions = false) {
  const blockId = typeof numberOrHash === 'number' 
    ? `0x${numberOrHash.toString(16)}` 
    : numberOrHash;
  
  if (blockId.startsWith('0x') && blockId.length === 66) {
    // It's a hash
    return rpcCall("eth_getBlockByHash", [blockId, includeTransactions]);
  } else {
    // It's a number or "latest", "pending", etc.
    return rpcCall("eth_getBlockByNumber", [blockId, includeTransactions]);
  }
}

export async function getBlockNumber(): Promise<number> {
  const hex = await rpcCall("eth_blockNumber");
  return parseInt(hex, 16);
}

// Transaction Methods
export async function getTransaction(hash: string) {
  return rpcCall("eth_getTransactionByHash", [hash]);
}

export async function getTransactionReceipt(hash: string) {
  return rpcCall("eth_getTransactionReceipt", [hash]);
}

export async function getTransactionCount(address: string, blockTag = "latest") {
  return rpcCall("eth_getTransactionCount", [address, blockTag]);
}

// Account Methods
export async function getBalance(address: string, blockTag = "latest"): Promise<bigint> {
  const hex = await rpcCall("eth_getBalance", [address, blockTag]);
  return BigInt(hex);
}

export async function getCode(address: string, blockTag = "latest") {
  return rpcCall("eth_getCode", [address, blockTag]);
}

export async function getStorageAt(address: string, position: string, blockTag = "latest") {
  return rpcCall("eth_getStorageAt", [address, position, blockTag]);
}

// Log Methods
export async function getLogs(filter: {
  fromBlock?: number | string;
  toBlock?: number | string;
  address?: string | string[];
  topics?: (string | null)[];
  blockhash?: string;
}) {
  const params: any = {};
  
  if (filter.fromBlock !== undefined) {
    params.fromBlock = typeof filter.fromBlock === 'number' 
      ? `0x${filter.fromBlock.toString(16)}` 
      : filter.fromBlock;
  }
  
  if (filter.toBlock !== undefined) {
    params.toBlock = typeof filter.toBlock === 'number' 
      ? `0x${filter.toBlock.toString(16)}` 
      : filter.toBlock;
  }
  
  if (filter.address) params.address = filter.address;
  if (filter.topics) params.topics = filter.topics;
  if (filter.blockhash) params.blockhash = filter.blockhash;
  
  return rpcCall("eth_getLogs", [params]);
}

// Smart Contract Interaction
export async function ethCall(transaction: {
  from?: string;
  to: string;
  gas?: string;
  gasPrice?: string;
  value?: string;
  data: string;
}, blockTag = "latest") {
  return rpcCall("eth_call", [transaction, blockTag]);
}

export async function estimateGas(transaction: {
  from?: string;
  to?: string;
  gas?: string;
  gasPrice?: string;
  value?: string;
  data?: string;
}) {
  return rpcCall("eth_estimateGas", [transaction]);
}

// Network Info
export async function chainId(): Promise<number> {
  const hex = await rpcCall("eth_chainId");
  return parseInt(hex, 16);
}

export async function gasPrice(): Promise<bigint> {
  const hex = await rpcCall("eth_gasPrice");
  return BigInt(hex);
}

export async function maxPriorityFeePerGas(): Promise<bigint> {
  const hex = await rpcCall("eth_maxPriorityFeePerGas");
  return BigInt(hex);
}

export async function feeHistory(blockCount: number, newestBlock: string | number, rewardPercentiles: number[]) {
  const newest = typeof newestBlock === 'number' 
    ? `0x${newestBlock.toString(16)}` 
    : newestBlock;
  return rpcCall("eth_feeHistory", [blockCount, newest, rewardPercentiles]);
}

// Tracing Methods
export async function traceTransaction(hash: string, options = {}) {
  return rpcCall("debug_traceTransaction", [hash, options]);
}

export async function traceBlock(blockNumber: number | string, options = {}) {
  const blockId = typeof blockNumber === 'number' 
    ? `0x${blockNumber.toString(16)}` 
    : blockNumber;
  return rpcCall("debug_traceBlockByNumber", [blockId, options]);
}

export async function traceCall(transaction: any, blockTag = "latest", options = {}) {
  return rpcCall("debug_traceCall", [transaction, blockTag, options]);
}

// Advanced: Get logs with automatic chunking for large ranges
export async function getLogsChunked(filter: {
  fromBlock: number;
  toBlock: number | "latest";
  address?: string | string[];
  topics?: (string | null)[];
}, chunkSize = 2000): Promise<any[]> {
  const currentBlock = filter.toBlock === "latest" ? await getBlockNumber() : filter.toBlock;
  const logs: any[] = [];
  
  for (let start = filter.fromBlock; start <= currentBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, currentBlock);
    const chunkLogs = await getLogs({
      ...filter,
      fromBlock: start,
      toBlock: end
    });
    logs.push(...chunkLogs);
    
    // Progress indicator for large ranges
    if (currentBlock - filter.fromBlock > 10000) {
      const progress = ((end - filter.fromBlock) / (currentBlock - filter.fromBlock) * 100).toFixed(1);
      console.log(`Fetching logs: ${progress}% complete`);
    }
  }
  
  return logs;
}

// Utility: Check if an address is a contract
export async function isContract(address: string): Promise<boolean> {
  const code = await getCode(address);
  return code !== "0x" && code !== "0x0";
}

// Export all methods as a namespace for easier tool integration
export const ethRpc = {
  // Core
  rpcCall,
  
  // Blocks
  getBlock,
  getBlockNumber,
  
  // Transactions
  getTransaction,
  getTransactionReceipt,
  getTransactionCount,
  
  // Accounts
  getBalance,
  getCode,
  getStorageAt,
  
  // Logs
  getLogs,
  getLogsChunked,
  
  // Smart Contracts
  ethCall,
  estimateGas,
  
  // Network
  chainId,
  gasPrice,
  maxPriorityFeePerGas,
  feeHistory,
  
  // Tracing
  traceTransaction,
  traceBlock,
  traceCall,
  
  // Utilities
  isContract
};