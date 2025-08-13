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

// Uniswap V2 Factory and Router
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

// Uniswap V3 Factory and Router
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

// Common DeFi protocol addresses
const DEFI_PROTOCOLS = {
  'uniswap_v2': {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  },
  'uniswap_v3': {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  'sushiswap': {
    factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  },
  'aave_v3': {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
  },
  'compound_v3': {
    comet_usdc: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
  },
  'curve': {
    registry: '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5',
  },
};

// Uniswap V2 Pair ABI
const UNISWAP_V2_PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function kLast() view returns (uint256)',
  'function price0CumulativeLast() view returns (uint256)',
  'function price1CumulativeLast() view returns (uint256)',
]);

// Uniswap V3 Pool ABI
const UNISWAP_V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
]);

// Factory ABIs
const FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
  'function allPairs(uint256) view returns (address)',
  'function allPairsLength() view returns (uint256)',
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]);

export async function registerDeFiTools(registerTool: any) {
  initClient();
  
  // Get Uniswap V2 pool information
  registerTool({
    name: 'uniswap_v2_pool',
    description: 'Get Uniswap V2 pool information including reserves and price',
    parameters: z.object({
      token0: z.string().describe('First token address'),
      token1: z.string().describe('Second token address'),
      factory: z.string().optional().default(UNISWAP_V2_FACTORY),
    }),
    execute: async ({ token0, token1, factory }: any) => {
      try {
        // Get pair address
        const pairAddress = await httpClient.readContract({
          address: factory as `0x${string}`,
          abi: FACTORY_ABI,
          functionName: 'getPair',
          args: [token0 as `0x${string}`, token1 as `0x${string}`],
        }) as `0x${string}`;
        
        if (pairAddress === '0x0000000000000000000000000000000000000000') {
          return {
            exists: false,
            message: 'No pool exists for this token pair',
          };
        }
        
        // Get pool data
        const [reserves, totalSupply, token0Addr, token1Addr] = await Promise.all([
          httpClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: 'getReserves',
          }),
          httpClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: 'totalSupply',
          }),
          httpClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: 'token0',
          }),
          httpClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: 'token1',
          }),
        ]) as any;
        
        // Calculate price
        const price0to1 = Number(reserves[1]) / Number(reserves[0]);
        const price1to0 = Number(reserves[0]) / Number(reserves[1]);
        
        return {
          exists: true,
          pairAddress,
          token0: token0Addr,
          token1: token1Addr,
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          totalSupply: totalSupply.toString(),
          price0to1,
          price1to0,
          lastUpdate: new Date(Number(reserves[2]) * 1000).toISOString(),
        };
      } catch (error) {
        throw new Error(`Failed to get Uniswap V2 pool: ${error}`);
      }
    },
  });
  
  // Get Uniswap V3 pool information
  registerTool({
    name: 'uniswap_v3_pool',
    description: 'Get Uniswap V3 pool information including current price and liquidity',
    parameters: z.object({
      token0: z.string().describe('First token address'),
      token1: z.string().describe('Second token address'),
      fee: z.number().default(3000).describe('Fee tier (500, 3000, or 10000)'),
      factory: z.string().optional().default(UNISWAP_V3_FACTORY),
    }),
    execute: async ({ token0, token1, fee, factory }: any) => {
      try {
        // Get pool address
        const poolAddress = await httpClient.readContract({
          address: factory as `0x${string}`,
          abi: FACTORY_ABI,
          functionName: 'getPool',
          args: [token0 as `0x${string}`, token1 as `0x${string}`, fee],
        }) as `0x${string}`;
        
        if (poolAddress === '0x0000000000000000000000000000000000000000') {
          return {
            exists: false,
            message: 'No pool exists for this token pair and fee tier',
          };
        }
        
        // Get pool data
        const [slot0, liquidity, token0Addr, token1Addr, poolFee] = await Promise.all([
          httpClient.readContract({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'liquidity',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'token0',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'token1',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'fee',
          }),
        ]) as any;
        
        // Calculate price from sqrtPriceX96
        const sqrtPriceX96 = slot0[0];
        const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2;
        
        return {
          exists: true,
          poolAddress,
          token0: token0Addr,
          token1: token1Addr,
          fee: Number(poolFee),
          sqrtPriceX96: sqrtPriceX96.toString(),
          tick: Number(slot0[1]),
          liquidity: liquidity.toString(),
          price0to1: price,
          price1to0: 1 / price,
          unlocked: slot0[6],
        };
      } catch (error) {
        throw new Error(`Failed to get Uniswap V3 pool: ${error}`);
      }
    },
  });
  
  // Calculate impermanent loss
  registerTool({
    name: 'calculate_il',
    description: 'Calculate impermanent loss for a liquidity position',
    parameters: z.object({
      initialPrice: z.number().describe('Initial price when LP was created'),
      currentPrice: z.number().describe('Current price'),
      initialValue: z.number().optional().default(1000).describe('Initial value in USD'),
    }),
    execute: async ({ initialPrice, currentPrice, initialValue }: any) => {
      // Calculate price ratio
      const priceRatio = currentPrice / initialPrice;
      
      // Calculate IL percentage
      const ilMultiplier = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio);
      const ilPercentage = (1 - ilMultiplier) * 100;
      
      // Calculate values
      const hodlValue = initialValue * ((1 + priceRatio) / 2);
      const lpValue = initialValue * ilMultiplier;
      const ilLoss = hodlValue - lpValue;
      
      return {
        initialPrice,
        currentPrice,
        priceChange: ((priceRatio - 1) * 100).toFixed(2) + '%',
        impermanentLoss: ilPercentage.toFixed(2) + '%',
        hodlValue: hodlValue.toFixed(2),
        lpValue: lpValue.toFixed(2),
        ilLossUSD: ilLoss.toFixed(2),
        breakeven: ilPercentage > 0 ? 
          `Need ${ilPercentage.toFixed(2)}% in fees to break even` :
          'No impermanent loss',
      };
    },
  });
  
  // Get all pools for a token
  registerTool({
    name: 'token_pools',
    description: 'Find all liquidity pools for a specific token',
    parameters: z.object({
      tokenAddress: z.string().describe('Token address to search for'),
      protocol: z.enum(['uniswap_v2', 'uniswap_v3', 'sushiswap']).optional(),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ tokenAddress, protocol, limit }: any) => {
      const pools = [];
      const token = tokenAddress.toLowerCase();
      
      // This would require indexing or multiple RPC calls
      // For now, return a structured response
      return {
        tokenAddress,
        message: 'Use sql_custom tool to query pools table for comprehensive pool data',
        suggestion: `SELECT * FROM pools WHERE LOWER(token0) = '${token}' OR LOWER(token1) = '${token}' ORDER BY first_block DESC LIMIT ${limit}`,
      };
    },
  });
  
  // Get lending protocol positions
  registerTool({
    name: 'lending_position',
    description: 'Get lending/borrowing positions for an address on Aave or Compound',
    parameters: z.object({
      walletAddress: z.string().describe('Wallet address'),
      protocol: z.enum(['aave_v3', 'compound_v3']).default('aave_v3'),
    }),
    execute: async ({ walletAddress, protocol }: any) => {
      // This would require protocol-specific ABI calls
      return {
        walletAddress,
        protocol,
        message: 'Lending position queries require protocol-specific integration',
        suggestion: 'Use eth_call with protocol ABI to query user positions',
      };
    },
  });
  
  // MEV detection
  registerTool({
    name: 'detect_mev',
    description: 'Detect potential MEV (sandwich attacks, arbitrage) in recent blocks',
    parameters: z.object({
      blockNumber: z.number().optional().describe('Block to analyze'),
      lookback: z.number().optional().default(10).describe('Number of blocks to analyze'),
    }),
    execute: async ({ blockNumber, lookback }: any) => {
      const currentBlock = await httpClient.getBlockNumber();
      const targetBlock = blockNumber ? BigInt(blockNumber) : currentBlock;
      
      return {
        blocksAnalyzed: `${Number(targetBlock) - lookback} to ${Number(targetBlock)}`,
        message: 'MEV detection requires transaction trace analysis',
        suggestion: 'Use sql_custom to query for suspicious transaction patterns:\n' +
          '- Multiple swaps in same block by same address\n' +
          '- Transactions surrounding large trades\n' +
          '- Flash loan transactions',
      };
    },
  });
  
  console.log('DeFi tools registered');
}