import { createPublicClient, http, webSocket, type PublicClient, type Block, type Log } from 'viem';
import { mainnet } from 'viem/chains';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const rpcHttp = process.env.RPC_HTTP || 'http://127.0.0.1:8545';
const rpcWs = process.env.RPC_WS || 'ws://127.0.0.1:8546';

let httpClient: PublicClient;
let wsClient: PublicClient;

const ALLOWED_RPC_METHODS = [
  // Block Methods
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getBlockTransactionCountByHash',
  
  // Transaction Methods
  'eth_getTransactionByHash',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionReceipt',
  'eth_getTransactionCount',
  'eth_sendRawTransaction',
  
  // Account Methods
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_accounts',
  
  // Log Methods
  'eth_getLogs',
  'eth_newFilter',
  'eth_newBlockFilter',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_uninstallFilter',
  
  // Call Methods
  'eth_call',
  'eth_estimateGas',
  
  // Gas & Network
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_chainId',
  'eth_syncing',
  'net_version',
  'net_listening',
  'net_peerCount',
  'web3_clientVersion',
  
  // Uncle Methods
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
] as const;

const RpcMethodSchema = z.enum(ALLOWED_RPC_METHODS);

function initClients() {
  httpClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcHttp),
  });
  
  wsClient = createPublicClient({
    chain: mainnet,
    transport: webSocket(rpcWs),
  });
}

export async function registerEthTools(registerTool: any) {
  initClients();
  
  registerTool({
    name: 'eth_rpc',
    description: 'Execute allowlisted Ethereum RPC methods',
    parameters: z.object({
      method: RpcMethodSchema,
      params: z.array(z.any()).optional(),
    }),
    execute: async ({ method, params = [] }: { method: string; params?: any[] }) => {
      try {
        // Use viem's request method for most RPC calls
        switch (method) {
          // Block Methods
          case 'eth_blockNumber':
            return await httpClient.getBlockNumber();
            
          case 'eth_getBlockByNumber':
            return await httpClient.getBlock({ 
              blockNumber: BigInt(params[0]),
              includeTransactions: params[1] || false,
            });
            
          case 'eth_getBlockByHash':
            return await httpClient.getBlock({ 
              blockHash: params[0] as `0x${string}`,
              includeTransactions: params[1] || false,
            });
            
          // Transaction Methods  
          case 'eth_getTransactionByHash':
            return await httpClient.getTransaction({ 
              hash: params[0] as `0x${string}` 
            });
            
          case 'eth_getTransactionReceipt':
            return await httpClient.getTransactionReceipt({ 
              hash: params[0] as `0x${string}` 
            });
            
          case 'eth_getTransactionCount':
            return await httpClient.getTransactionCount({ 
              address: params[0] as `0x${string}`,
              blockNumber: params[1] ? BigInt(params[1]) : undefined,
            });
            
          // Account Methods
          case 'eth_getBalance':
            return await httpClient.getBalance({ 
              address: params[0] as `0x${string}`,
              blockNumber: params[1] ? BigInt(params[1]) : undefined,
            });
            
          case 'eth_getCode':
            return await httpClient.getBytecode({ 
              address: params[0] as `0x${string}`,
              blockNumber: params[1] ? BigInt(params[1]) : undefined,
            });
            
          case 'eth_getStorageAt':
            return await httpClient.getStorageAt({ 
              address: params[0] as `0x${string}`,
              slot: params[1] as `0x${string}`,
              blockNumber: params[2] ? BigInt(params[2]) : undefined,
            });
            
          // Log Methods
          case 'eth_getLogs':
            return await httpClient.getLogs(params[0] || {});
            
          // Call Methods
          case 'eth_call':
            return await httpClient.call({
              to: params[0].to as `0x${string}`,
              data: params[0].data as `0x${string}`,
              from: params[0].from as `0x${string}` | undefined,
              blockNumber: params[1] ? BigInt(params[1]) : undefined,
            });
            
          case 'eth_estimateGas':
            return await httpClient.estimateGas({
              to: params[0].to as `0x${string}` | undefined,
              from: params[0].from as `0x${string}` | undefined,
              data: params[0].data as `0x${string}` | undefined,
              value: params[0].value ? BigInt(params[0].value) : undefined,
            });
            
          // Gas & Network
          case 'eth_gasPrice':
            return await httpClient.getGasPrice();
            
          case 'eth_chainId':
            return await httpClient.getChainId();
            
          case 'eth_feeHistory':
            return await httpClient.getFeeHistory({
              blockCount: params[0],
              rewardPercentiles: params[2] || [],
              blockNumber: params[1] ? BigInt(params[1]) : undefined,
            });
            
          // For other methods, use raw request
          default:
            return await httpClient.request({
              method: method as any,
              params: params as any,
            });
        }
      } catch (error) {
        console.error(`RPC method ${method} failed:`, error);
        throw error;
      }
    },
  });
  
  registerTool({
    name: 'get_logs_window',
    description: 'Get logs within a time window with automatic chunking and retries',
    parameters: z.object({
      fromBlock: z.number().optional(),
      toBlock: z.number().optional(),
      address: z.string().optional(),
      topics: z.array(z.string()).optional(),
      maxBlocksPerQuery: z.number().default(2000),
    }),
    execute: async ({ 
      fromBlock, 
      toBlock, 
      address, 
      topics, 
      maxBlocksPerQuery = 2000 
    }: any) => {
      const currentBlock = await httpClient.getBlockNumber();
      const from = fromBlock ? BigInt(fromBlock) : currentBlock - BigInt(5 * 24 * 60 * 4);
      const to = toBlock ? BigInt(toBlock) : currentBlock;
      
      if (to < from) {
        throw new Error('toBlock must be greater than fromBlock');
      }
      
      const blockRange = to - from;
      if (blockRange > BigInt(maxBlocksPerQuery)) {
        const chunks: Log[][] = [];
        let chunkStart = from;
        
        while (chunkStart <= to) {
          const chunkEnd = chunkStart + BigInt(maxBlocksPerQuery) - 1n;
          const actualEnd = chunkEnd > to ? to : chunkEnd;
          
          try {
            const logs = await httpClient.getLogs({
              fromBlock: chunkStart,
              toBlock: actualEnd,
              address: address as `0x${string}` | undefined,
              ...(topics ? { topics: topics as any } : {}),
            } as any);
            chunks.push(logs);
            
            console.log(`Fetched ${logs.length} logs from blocks ${chunkStart} to ${actualEnd}`);
          } catch (error) {
            console.error(`Failed to fetch logs for blocks ${chunkStart} to ${actualEnd}:`, error);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
              const logs = await httpClient.getLogs({
                fromBlock: chunkStart,
                toBlock: actualEnd,
                address: address as `0x${string}` | undefined,
                ...(topics ? { topics: topics as any } : {}),
              } as any);
              chunks.push(logs);
            } catch (retryError) {
              console.error(`Retry failed for blocks ${chunkStart} to ${actualEnd}`);
              throw retryError;
            }
          }
          
          chunkStart = actualEnd + 1n;
        }
        
        return chunks.flat();
      } else {
        return await httpClient.getLogs({
          fromBlock: from,
          toBlock: to,
          address: address as `0x${string}` | undefined,
          ...(topics ? { topics: topics as any } : {}),
        } as any);
      }
    },
  });
  
  registerTool({
    name: 'get_block_timestamp',
    description: 'Get timestamp for a specific block number',
    parameters: z.object({
      blockNumber: z.number(),
    }),
    execute: async ({ blockNumber }: any) => {
      const block = await httpClient.getBlock({ 
        blockNumber: BigInt(blockNumber) 
      });
      return {
        blockNumber: block.number,
        timestamp: block.timestamp,
        date: new Date(Number(block.timestamp) * 1000).toISOString(),
      };
    },
  });
  
  registerTool({
    name: 'estimate_blocks_for_days',
    description: 'Estimate block range for a given number of days in the past',
    parameters: z.object({
      days: z.number().min(1).max(30),
    }),
    execute: async ({ days }: any) => {
      const currentBlock = await httpClient.getBlockNumber();
      const blocksPerDay = 24 * 60 * 4;
      const estimatedStartBlock = currentBlock - BigInt(days * blocksPerDay);
      
      const currentBlockData = await httpClient.getBlock({ 
        blockNumber: currentBlock 
      });
      const startBlockData = await httpClient.getBlock({ 
        blockNumber: estimatedStartBlock 
      });
      
      return {
        currentBlock: Number(currentBlock),
        estimatedStartBlock: Number(estimatedStartBlock),
        actualBlocksInRange: Number(currentBlock - estimatedStartBlock),
        currentTimestamp: new Date(Number(currentBlockData.timestamp) * 1000).toISOString(),
        startTimestamp: new Date(Number(startBlockData.timestamp) * 1000).toISOString(),
      };
    },
  });
  
  console.log('Ethereum tools registered');
}