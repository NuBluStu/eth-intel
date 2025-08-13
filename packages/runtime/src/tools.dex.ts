import { z } from 'zod';
import { parseAbiItem, decodeEventLog, type Log } from 'viem';

const ERC20_TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

const UNIV2_PAIR_CREATED_EVENT = parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256)');

const UNIV3_POOL_CREATED_EVENT = parseAbiItem('event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)');

const UNIV2_SWAP_EVENT = parseAbiItem('event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)');

const UNIV3_SWAP_EVENT = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');

const MINT_EVENT = parseAbiItem('event Mint(address indexed sender, uint256 amount0, uint256 amount1)');

const BURN_EVENT = parseAbiItem('event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)');

const KNOWN_FACTORIES = {
  UNIV2: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  UNIV3: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  SUSHISWAP: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
} as const;

const SAFE_TOKEN_CHARACTERISTICS = {
  minLiquidity: BigInt(10000e18),
  minHolders: 50,
  maxOwnershipPercent: 50,
  minTxCount: 100,
  minDaysActive: 3,
};

export async function registerDexTools(registerTool: any) {
  registerTool({
    name: 'decode_erc20_transfer',
    description: 'Decode an ERC20 Transfer event from a log',
    parameters: z.object({
      topics: z.array(z.string()),
      data: z.string(),
      address: z.string(),
      blockNumber: z.string(),
      transactionHash: z.string(),
      logIndex: z.number(),
    }),
    execute: async (log: any) => {
      try {
        const decoded = decodeEventLog({
          abi: [ERC20_TRANSFER_EVENT],
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          data: log.data as `0x${string}`,
        });
        
        return {
          event: 'Transfer',
          token: log.address,
          from: decoded.args.from,
          to: decoded.args.to,
          value: decoded.args.value.toString(),
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        };
      } catch (error) {
        return { error: `Failed to decode transfer: ${error}` };
      }
    },
  });
  
  registerTool({
    name: 'decode_pool_creation',
    description: 'Decode Uniswap V2/V3 pool creation events',
    parameters: z.object({
      topics: z.array(z.string()),
      data: z.string(),
      address: z.string(),
      blockNumber: z.string(),
      transactionHash: z.string(),
      logIndex: z.number(),
    }),
    execute: async (log: any) => {
      const eventSignature = log.topics[0];
      
      try {
        if (log.address.toLowerCase() === KNOWN_FACTORIES.UNIV2.toLowerCase()) {
          const decoded = decodeEventLog({
            abi: [UNIV2_PAIR_CREATED_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            dex: 'UniswapV2',
            pool: (decoded.args as any).pair,
            token0: (decoded.args as any).token0,
            token1: (decoded.args as any).token1,
            feeTier: 3000,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        if (log.address.toLowerCase() === KNOWN_FACTORIES.UNIV3.toLowerCase()) {
          const decoded = decodeEventLog({
            abi: [UNIV3_POOL_CREATED_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            dex: 'UniswapV3',
            pool: decoded.args.pool,
            token0: decoded.args.token0,
            token1: decoded.args.token1,
            feeTier: Number(decoded.args.fee),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        return { error: 'Unknown factory address' };
      } catch (error) {
        return { error: `Failed to decode pool creation: ${error}` };
      }
    },
  });
  
  registerTool({
    name: 'decode_dex_event',
    description: 'Decode DEX swap, mint, and burn events',
    parameters: z.object({
      topics: z.array(z.string()),
      data: z.string(),
      address: z.string(),
      blockNumber: z.string(),
      transactionHash: z.string(),
      logIndex: z.number(),
      dexType: z.enum(['uniswapV2', 'uniswapV3']).optional(),
    }),
    execute: async (log: any) => {
      const eventSignature = log.topics[0];
      
      try {
        if (eventSignature === '0xd78ad95f') {
          const decoded = decodeEventLog({
            abi: [UNIV2_SWAP_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            event: 'Swap',
            dex: 'UniswapV2',
            pool: log.address,
            sender: decoded.args.sender,
            recipient: decoded.args.to,
            amount0In: decoded.args.amount0In.toString(),
            amount1In: decoded.args.amount1In.toString(),
            amount0Out: decoded.args.amount0Out.toString(),
            amount1Out: decoded.args.amount1Out.toString(),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        if (eventSignature === '0xc42079f9') {
          const decoded = decodeEventLog({
            abi: [UNIV3_SWAP_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            event: 'Swap',
            dex: 'UniswapV3',
            pool: log.address,
            sender: decoded.args.sender,
            recipient: decoded.args.recipient,
            amount0: decoded.args.amount0.toString(),
            amount1: decoded.args.amount1.toString(),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        if (eventSignature === '0x4c209b5f') {
          const decoded = decodeEventLog({
            abi: [MINT_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            event: 'Mint',
            pool: log.address,
            sender: decoded.args.sender,
            amount0: decoded.args.amount0.toString(),
            amount1: decoded.args.amount1.toString(),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        if (eventSignature === '0xdccd412f') {
          const decoded = decodeEventLog({
            abi: [BURN_EVENT],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          
          return {
            event: 'Burn',
            pool: log.address,
            sender: decoded.args.sender,
            to: decoded.args.to,
            amount0: decoded.args.amount0.toString(),
            amount1: decoded.args.amount1.toString(),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };
        }
        
        return { error: 'Unknown event signature' };
      } catch (error) {
        return { error: `Failed to decode DEX event: ${error}` };
      }
    },
  });
  
  registerTool({
    name: 'assess_pool_safety',
    description: 'Assess the safety of a liquidity pool based on heuristics',
    parameters: z.object({
      poolAddress: z.string(),
      token0: z.string(),
      token1: z.string(),
      liquidity: z.string(),
      txCount: z.number(),
      uniqueUsers: z.number(),
      daysActive: z.number(),
      largestHolderPercent: z.number().optional(),
    }),
    execute: async (params: any) => {
      const safetyScore = {
        liquidity: BigInt(params.liquidity) >= SAFE_TOKEN_CHARACTERISTICS.minLiquidity,
        users: params.uniqueUsers >= SAFE_TOKEN_CHARACTERISTICS.minHolders,
        activity: params.txCount >= SAFE_TOKEN_CHARACTERISTICS.minTxCount,
        age: params.daysActive >= SAFE_TOKEN_CHARACTERISTICS.minDaysActive,
        distribution: !params.largestHolderPercent || 
                     params.largestHolderPercent <= SAFE_TOKEN_CHARACTERISTICS.maxOwnershipPercent,
      };
      
      const overallScore = Object.values(safetyScore).filter(Boolean).length;
      const maxScore = Object.keys(safetyScore).length;
      
      return {
        pool: params.poolAddress,
        safetyScore: `${overallScore}/${maxScore}`,
        checks: safetyScore,
        risk: overallScore < 3 ? 'HIGH' : overallScore < 4 ? 'MEDIUM' : 'LOW',
        warnings: Object.entries(safetyScore)
          .filter(([_, passed]) => !passed)
          .map(([check]) => `Failed ${check} check`),
      };
    },
  });
  
  registerTool({
    name: 'identify_honeypot_characteristics',
    description: 'Check for common honeypot/scam characteristics',
    parameters: z.object({
      poolAddress: z.string(),
      buyTxCount: z.number(),
      sellTxCount: z.number(),
      uniqueBuyers: z.number(),
      uniqueSellers: z.number(),
      avgSlippage: z.number().optional(),
    }),
    execute: async (params: any) => {
      const warnings = [];
      
      if (params.sellTxCount === 0 && params.buyTxCount > 10) {
        warnings.push('No successful sells despite multiple buys');
      }
      
      if (params.uniqueSellers < params.uniqueBuyers * 0.1) {
        warnings.push('Very few unique sellers compared to buyers');
      }
      
      if (params.avgSlippage && params.avgSlippage > 10) {
        warnings.push('High average slippage on trades');
      }
      
      const buyToSellRatio = params.buyTxCount / Math.max(params.sellTxCount, 1);
      if (buyToSellRatio > 10) {
        warnings.push('Extremely high buy-to-sell ratio');
      }
      
      return {
        pool: params.poolAddress,
        isLikelyHoneypot: warnings.length >= 2,
        warnings,
        buyToSellRatio: buyToSellRatio.toFixed(2),
        uniqueTraders: params.uniqueBuyers + params.uniqueSellers,
      };
    },
  });
  
  console.log('DEX tools registered');
}