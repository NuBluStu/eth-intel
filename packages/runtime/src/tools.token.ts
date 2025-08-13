import { createPublicClient, http, parseAbi, formatUnits, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const rpcHttp = process.env.RPC_HTTP || 'http://127.0.0.1:8545';

let httpClient: PublicClient;

function initClient() {
  httpClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcHttp),
  });
}

// Standard ERC20 ABI
const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

// Common token addresses
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; name: string }> = {
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18, name: 'ChainLink Token' },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18, name: 'Uniswap' },
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': { symbol: 'MATIC', decimals: 18, name: 'Matic Token' },
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18, name: 'Lido Staked ETH' },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18, name: 'Aave Token' },
};

export async function registerTokenTools(registerTool: any) {
  initClient();
  
  // Get token information
  registerTool({
    name: 'token_info',
    description: 'Get detailed information about an ERC20 token including name, symbol, decimals, and total supply',
    parameters: z.object({
      tokenAddress: z.string().describe('The token contract address'),
    }),
    execute: async ({ tokenAddress }: any) => {
      const address = tokenAddress.toLowerCase() as `0x${string}`;
      
      // Check if it's a known token first
      const known = KNOWN_TOKENS[address];
      if (known) {
        try {
          const totalSupply = await httpClient.readContract({
            address,
            abi: ERC20_ABI,
            functionName: 'totalSupply',
          }) as bigint;
          
          return {
            address: tokenAddress,
            name: known.name,
            symbol: known.symbol,
            decimals: known.decimals,
            totalSupply: totalSupply.toString(),
            totalSupplyFormatted: formatUnits(totalSupply, known.decimals),
            isKnown: true,
          };
        } catch (error) {
          return { address: tokenAddress, ...known, error: 'Failed to read total supply' };
        }
      }
      
      // Try to read from contract
      try {
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          httpClient.readContract({ address, abi: ERC20_ABI, functionName: 'name' }),
          httpClient.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }),
          httpClient.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }),
          httpClient.readContract({ address, abi: ERC20_ABI, functionName: 'totalSupply' }),
        ]);
        
        return {
          address: tokenAddress,
          name: name as string,
          symbol: symbol as string,
          decimals: Number(decimals),
          totalSupply: (totalSupply as bigint).toString(),
          totalSupplyFormatted: formatUnits(totalSupply as bigint, Number(decimals)),
          isKnown: false,
        };
      } catch (error) {
        throw new Error(`Failed to read token info: ${error}`);
      }
    },
  });
  
  // Get token balance for an address
  registerTool({
    name: 'token_balance',
    description: 'Get the token balance of a specific address',
    parameters: z.object({
      tokenAddress: z.string().describe('The token contract address'),
      walletAddress: z.string().describe('The wallet address to check'),
    }),
    execute: async ({ tokenAddress, walletAddress }: any) => {
      const token = tokenAddress.toLowerCase() as `0x${string}`;
      const wallet = walletAddress.toLowerCase() as `0x${string}`;
      
      try {
        const balance = await httpClient.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet],
        }) as bigint;
        
        // Get decimals for formatting
        let decimals = 18;
        const known = KNOWN_TOKENS[token];
        if (known) {
          decimals = known.decimals;
        } else {
          try {
            const dec = await httpClient.readContract({
              address: token,
              abi: ERC20_ABI,
              functionName: 'decimals',
            });
            decimals = Number(dec);
          } catch {}
        }
        
        return {
          tokenAddress,
          walletAddress,
          balance: balance.toString(),
          balanceFormatted: formatUnits(balance, decimals),
          decimals,
        };
      } catch (error) {
        throw new Error(`Failed to get token balance: ${error}`);
      }
    },
  });
  
  // Get multiple token balances for a wallet
  registerTool({
    name: 'wallet_tokens',
    description: 'Get balances of multiple common tokens for a wallet',
    parameters: z.object({
      walletAddress: z.string().describe('The wallet address to check'),
      includeZeroBalances: z.boolean().optional().default(false),
    }),
    execute: async ({ walletAddress, includeZeroBalances }: any) => {
      const wallet = walletAddress.toLowerCase() as `0x${string}`;
      const balances = [];
      
      // Check ETH balance first
      const ethBalance = await httpClient.getBalance({ address: wallet });
      if (ethBalance > 0n || includeZeroBalances) {
        balances.push({
          token: 'ETH',
          symbol: 'ETH',
          balance: ethBalance.toString(),
          balanceFormatted: formatUnits(ethBalance, 18),
          valueUSD: null, // Would need price oracle
        });
      }
      
      // Check common tokens
      for (const [address, info] of Object.entries(KNOWN_TOKENS)) {
        try {
          const balance = await httpClient.readContract({
            address: address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [wallet],
          }) as bigint;
          
          if (balance > 0n || includeZeroBalances) {
            balances.push({
              token: address,
              symbol: info.symbol,
              name: info.name,
              balance: balance.toString(),
              balanceFormatted: formatUnits(balance, info.decimals),
              decimals: info.decimals,
            });
          }
        } catch (error) {
          console.error(`Failed to check ${info.symbol}:`, error);
        }
      }
      
      return {
        walletAddress,
        tokenCount: balances.filter(b => b.balance !== '0').length,
        tokens: balances,
      };
    },
  });
  
  // Decode token transfer events
  registerTool({
    name: 'token_transfers',
    description: 'Get recent token transfers for a specific token or wallet',
    parameters: z.object({
      tokenAddress: z.string().optional().describe('Filter by token address'),
      walletAddress: z.string().optional().describe('Filter by wallet address (from or to)'),
      fromBlock: z.number().optional().describe('Starting block number'),
      toBlock: z.number().optional().describe('Ending block number'),
      limit: z.number().optional().default(100),
    }),
    execute: async ({ tokenAddress, walletAddress, fromBlock, toBlock, limit }: any) => {
      const currentBlock = await httpClient.getBlockNumber();
      const from = fromBlock ? BigInt(fromBlock) : currentBlock - 1000n;
      const to = toBlock ? BigInt(toBlock) : currentBlock;
      
      // Build filter
      const filter: any = {
        fromBlock: from,
        toBlock: to,
        events: [ERC20_ABI[8]], // Transfer event
      };
      
      if (tokenAddress) {
        filter.address = tokenAddress as `0x${string}`;
      }
      
      const logs = await httpClient.getLogs(filter);
      
      // Filter by wallet if specified
      let filteredLogs = logs;
      if (walletAddress) {
        const wallet = walletAddress.toLowerCase();
        filteredLogs = logs.filter((log: any) => {
          const from = log.args?.from?.toLowerCase();
          const to = log.args?.to?.toLowerCase();
          return from === wallet || to === wallet;
        });
      }
      
      // Format transfers
      const transfers = filteredLogs.slice(0, limit).map((log: any) => {
        const token = log.address.toLowerCase();
        const known = KNOWN_TOKENS[token];
        
        return {
          blockNumber: Number(log.blockNumber),
          transactionHash: log.transactionHash,
          token: log.address,
          symbol: known?.symbol || 'Unknown',
          from: log.args.from,
          to: log.args.to,
          value: log.args.value.toString(),
          valueFormatted: known ? formatUnits(log.args.value, known.decimals) : null,
        };
      });
      
      return {
        fromBlock: from.toString(),
        toBlock: to.toString(),
        transferCount: transfers.length,
        transfers,
      };
    },
  });
  
  // Check if address is a token contract
  registerTool({
    name: 'is_token',
    description: 'Check if an address is an ERC20 token contract',
    parameters: z.object({
      address: z.string().describe('The address to check'),
    }),
    execute: async ({ address }: any) => {
      const addr = address.toLowerCase() as `0x${string}`;
      
      // Quick check for known tokens
      if (KNOWN_TOKENS[addr]) {
        return {
          address,
          isToken: true,
          isKnown: true,
          tokenInfo: KNOWN_TOKENS[addr],
        };
      }
      
      // Check if it's a contract
      const code = await httpClient.getBytecode({ address: addr });
      if (!code || code === '0x') {
        return {
          address,
          isToken: false,
          isContract: false,
          reason: 'Not a contract',
        };
      }
      
      // Try to read ERC20 methods
      try {
        const [symbol, decimals] = await Promise.all([
          httpClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
          httpClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);
        
        return {
          address,
          isToken: true,
          isKnown: false,
          tokenInfo: {
            symbol: symbol as string,
            decimals: Number(decimals),
          },
        };
      } catch {
        return {
          address,
          isToken: false,
          isContract: true,
          reason: 'Contract exists but does not implement ERC20',
        };
      }
    },
  });
  
  console.log('Token tools registered');
}