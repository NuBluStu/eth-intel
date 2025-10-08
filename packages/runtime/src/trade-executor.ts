/**
 * TRADE EXECUTOR - Automated Trading Execution Framework
 *
 * Handles order execution, slippage protection, gas optimization, and trade monitoring
 * Integrates with DEXs and implements advanced trading strategies
 *
 * MODES:
 * - SIMULATION: Fake execution, no real transactions
 * - TESTNET: Real transactions on test network
 * - MAINNET: Real transactions with real money
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther, parseAbi, encodeFunctionData } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { tradingConfig, TradingMode, isRealTrading } from './config/trading-modes.js';
import { AlchemyRPCManager, getPriceClient } from './services/alchemy-client.js';
import * as dotenv from 'dotenv';

dotenv.config();

interface TradeOrder {
  id: string;
  type: 'buy' | 'sell' | 'swap';
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  maxSlippage: number;
  deadline: number;
  strategy: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  gasLimit?: bigint;
  gasPrice?: bigint;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';
  txHash?: string;
  submittedAt?: number;
  confirmedAt?: number;
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  amountOut?: bigint;
  gasUsed?: bigint;
  effectivePrice?: number;
  slippage?: number;
  error?: string;
}

interface GasStrategy {
  name: string;
  baseFee: bigint;
  priorityFee: bigint;
  maxFee: bigint;
  confidence: number;
}

// DEX Router addresses
const ROUTERS = {
  UNISWAP_V2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  UNISWAP_V3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  SUSHISWAP: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  ONEINCH: '0x1111111254eeb25477b68fb85ed929f73a960582',
};

const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

class TradeExecutor {
  private client;
  private priceClient;  // Alchemy client for fast price queries
  private walletClient;
  private alchemyManager: AlchemyRPCManager | null = null;
  private orders: Map<string, TradeOrder>;
  private executionQueue: TradeOrder[];
  private account: any;

  constructor(privateKey?: string) {
    // Initialize Alchemy manager if configured
    if (process.env.ALCHEMY_API_KEY && process.env.USE_ALCHEMY_FOR_TRADING === 'true') {
      this.alchemyManager = new AlchemyRPCManager(privateKey);
      this.client = this.alchemyManager.getOptimalClient();
      this.priceClient = this.alchemyManager.getPriceClient();
      console.log('✅ Trade Executor using Alchemy for enhanced performance');
    } else {
      // Fallback to local node
      this.client = createPublicClient({
        chain: mainnet,
        transport: http('http://127.0.0.1:8545'),
      });
      this.priceClient = this.client;
      console.log('📍 Trade Executor using local node');
    }

    if (privateKey) {
      this.account = privateKeyToAccount(privateKey as `0x${string}`);

      // Use Alchemy for wallet if configured, otherwise local
      const alchemyUrl = process.env.ALCHEMY_MAINNET_HTTP && process.env.ALCHEMY_API_KEY
        ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        : null;

      const transport = this.alchemyManager && process.env.USE_ALCHEMY_FOR_TRADING === 'true' && alchemyUrl
        ? http(alchemyUrl)
        : http('http://127.0.0.1:8545');

      this.walletClient = createWalletClient({
        account: this.account,
        chain: mainnet,
        transport,
      });
    }

    this.orders = new Map();
    this.executionQueue = [];
  }

  async createOrder(params: {
    type: 'buy' | 'sell' | 'swap';
    tokenIn: string;
    tokenOut: string;
    amountIn: string | bigint;
    maxSlippage: number;
    strategy: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): Promise<string> {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const amountInBigInt = typeof params.amountIn === 'string'
      ? parseEther(params.amountIn)
      : params.amountIn;

    // Calculate minimum amount out based on slippage
    const expectedAmountOut = await this.getExpectedAmountOut(
      params.tokenIn,
      params.tokenOut,
      amountInBigInt
    );

    const minAmountOut = expectedAmountOut - (expectedAmountOut * BigInt(Math.floor(params.maxSlippage * 10000)) / BigInt(10000));

    const order: TradeOrder = {
      id: orderId,
      type: params.type,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: amountInBigInt,
      minAmountOut,
      maxSlippage: params.maxSlippage,
      deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes
      strategy: params.strategy,
      priority: params.priority || 'MEDIUM',
      status: 'pending',
    };

    this.orders.set(orderId, order);
    this.addToExecutionQueue(order);

    console.log(`📝 Created order ${orderId}: ${params.type} ${formatEther(amountInBigInt)} tokens`);
    return orderId;
  }

  private addToExecutionQueue(order: TradeOrder): void {
    // Insert order based on priority
    const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const orderPriority = priorityOrder[order.priority];

    let insertIndex = this.executionQueue.length;
    for (let i = 0; i < this.executionQueue.length; i++) {
      const queuePriority = priorityOrder[this.executionQueue[i].priority];
      if (orderPriority > queuePriority) {
        insertIndex = i;
        break;
      }
    }

    this.executionQueue.splice(insertIndex, 0, order);
    console.log(`📋 Added order to execution queue at position ${insertIndex + 1}`);
  }

  async executeNextOrder(): Promise<ExecutionResult | null> {
    if (this.executionQueue.length === 0) {
      return null;
    }

    const order = this.executionQueue.shift()!;
    return await this.executeOrder(order);
  }

  async executeOrder(order: TradeOrder): Promise<ExecutionResult> {
    console.log(`🚀 Executing order ${order.id}...`);

    if (!this.walletClient) {
      return {
        success: false,
        error: 'No wallet configured for execution',
      };
    }

    try {
      order.status = 'submitted';
      order.submittedAt = Date.now();

      // Choose optimal execution route
      const executionRoute = await this.getOptimalRoute(order);

      // Execute based on trade type and tokens
      let result: ExecutionResult;

      if (order.tokenIn === '0x0000000000000000000000000000000000000000') {
        // ETH to Token
        result = await this.executeETHToToken(order, executionRoute);
      } else if (order.tokenOut === '0x0000000000000000000000000000000000000000') {
        // Token to ETH
        result = await this.executeTokenToETH(order, executionRoute);
      } else {
        // Token to Token
        result = await this.executeTokenToToken(order, executionRoute);
      }

      if (result.success) {
        order.status = 'confirmed';
        order.confirmedAt = Date.now();
        order.txHash = result.txHash;
      } else {
        order.status = 'failed';
      }

      this.orders.set(order.id, order);
      return result;

    } catch (error) {
      console.error(`Error executing order ${order.id}:`, error);
      order.status = 'failed';
      this.orders.set(order.id, order);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async getOptimalRoute(order: TradeOrder): Promise<string> {
    // Compare prices across different DEXs
    const routes = [ROUTERS.UNISWAP_V2, ROUTERS.UNISWAP_V3, ROUTERS.SUSHISWAP];
    let bestRoute = routes[0];
    let bestAmountOut = BigInt(0);

    for (const route of routes) {
      try {
        const amountOut = await this.getAmountOutForRoute(
          order.tokenIn,
          order.tokenOut,
          order.amountIn,
          route
        );

        if (amountOut > bestAmountOut) {
          bestAmountOut = amountOut;
          bestRoute = route;
        }
      } catch (error) {
        // Skip failed routes
      }
    }

    console.log(`  Best route: ${this.getRouterName(bestRoute)} (${formatEther(bestAmountOut)} out)`);
    return bestRoute;
  }

  private getRouterName(address: string): string {
    const routerNames = {
      [ROUTERS.UNISWAP_V2]: 'Uniswap V2',
      [ROUTERS.UNISWAP_V3]: 'Uniswap V3',
      [ROUTERS.SUSHISWAP]: 'SushiSwap',
      [ROUTERS.ONEINCH]: '1inch',
    };
    return routerNames[address as keyof typeof routerNames] || 'Unknown';
  }

  private async executeETHToToken(order: TradeOrder, router: string): Promise<ExecutionResult> {
    console.log(`  Executing ETH → Token swap via ${this.getRouterName(router)}`);

    // Check if we should execute real transactions
    if (!isRealTrading(tradingConfig)) {
      console.log('  🎮 [SIMULATION] Simulating transaction...');

      // Simulate the transaction
      const simulatedSuccess = Math.random() > 0.2; // 80% success rate
      if (simulatedSuccess) {
        return {
          success: true,
          txHash: `0xsimulated_${Date.now().toString(16)}`,
          gasUsed: 150000n,
          amountOut: order.minAmountOut * 105n / 100n, // 5% better than minimum
          effectivePrice: Number(order.amountIn) / Number(order.minAmountOut),
          slippage: 0.002, // 0.2% slippage
        };
      } else {
        return {
          success: false,
          error: 'Simulated failure: Slippage too high',
        };
      }
    }

    // Real execution path
    console.log('  💰 [REAL] Executing actual transaction...');
    console.log(`  ⚠️  Mode: ${tradingConfig.mode.toUpperCase()}`);

    const path = [
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      order.tokenOut,
    ];

    const gasStrategy = await this.calculateOptimalGas(order.priority);

    try {
      const txHash = await this.walletClient!.writeContract({
        address: router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'swapExactETHForTokens',
        args: [order.minAmountOut, path, this.account.address, BigInt(order.deadline)],
        value: order.amountIn,
        gas: gasStrategy.baseFee + gasStrategy.priorityFee,
        maxFeePerGas: gasStrategy.maxFee,
        maxPriorityFeePerGas: gasStrategy.priorityFee,
      });

      console.log(`  ✅ Transaction submitted: ${txHash}`);

      // Wait for confirmation
      const receipt = await this.client.waitForTransactionReceipt({ hash: txHash });

      return {
        success: true,
        txHash,
        gasUsed: receipt.gasUsed,
        amountOut: BigInt(0), // Would decode from logs
        effectivePrice: 0, // Would calculate from amounts
        slippage: 0, // Would calculate from expected vs actual
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  private async executeTokenToETH(order: TradeOrder, router: string): Promise<ExecutionResult> {
    console.log(`  Executing Token → ETH swap via ${this.getRouterName(router)}`);

    // Check if we should execute real transactions
    if (!isRealTrading(tradingConfig)) {
      console.log('  🎮 [SIMULATION] Simulating transaction...');

      // Simulate the transaction
      const simulatedSuccess = Math.random() > 0.2; // 80% success rate
      if (simulatedSuccess) {
        return {
          success: true,
          txHash: `0xsimulated_${Date.now().toString(16)}`,
          gasUsed: 160000n,
          amountOut: order.minAmountOut * 103n / 100n, // 3% better than minimum
          effectivePrice: Number(order.amountIn) / Number(order.minAmountOut),
          slippage: 0.003, // 0.3% slippage
        };
      } else {
        return {
          success: false,
          error: 'Simulated failure: Insufficient liquidity',
        };
      }
    }

    // Real execution path
    console.log('  💰 [REAL] Executing actual transaction...');
    console.log(`  ⚠️  Mode: ${tradingConfig.mode.toUpperCase()}`);

    // First approve tokens if needed
    await this.ensureTokenApproval(order.tokenIn, router, order.amountIn);

    const path = [
      order.tokenIn,
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    ];

    const gasStrategy = await this.calculateOptimalGas(order.priority);

    try {
      const txHash = await this.walletClient!.writeContract({
        address: router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [order.amountIn, order.minAmountOut, path, this.account.address, BigInt(order.deadline)],
        gas: gasStrategy.baseFee + gasStrategy.priorityFee,
        maxFeePerGas: gasStrategy.maxFee,
        maxPriorityFeePerGas: gasStrategy.priorityFee,
      });

      const receipt = await this.client.waitForTransactionReceipt({ hash: txHash });

      return {
        success: true,
        txHash,
        gasUsed: receipt.gasUsed,
        amountOut: BigInt(0), // Would decode from logs
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  private async executeTokenToToken(order: TradeOrder, router: string): Promise<ExecutionResult> {
    console.log(`  Executing Token → Token swap via ${this.getRouterName(router)}`);

    // Check if we should execute real transactions
    if (!isRealTrading(tradingConfig)) {
      console.log('  🎮 [SIMULATION] Simulating transaction...');

      // Simulate the transaction
      const simulatedSuccess = Math.random() > 0.15; // 85% success rate
      if (simulatedSuccess) {
        return {
          success: true,
          txHash: `0xsimulated_${Date.now().toString(16)}`,
          gasUsed: 180000n,
          amountOut: order.minAmountOut * 102n / 100n, // 2% better than minimum
          effectivePrice: Number(order.amountIn) / Number(order.minAmountOut),
          slippage: 0.004, // 0.4% slippage
        };
      } else {
        return {
          success: false,
          error: 'Simulated failure: Price impact too high',
        };
      }
    }

    // Real execution path
    console.log('  💰 [REAL] Executing actual transaction...');
    console.log(`  ⚠️  Mode: ${tradingConfig.mode.toUpperCase()}`);

    // Approve tokens
    await this.ensureTokenApproval(order.tokenIn, router, order.amountIn);

    const path = [order.tokenIn, order.tokenOut];

    // If tokens don't have direct pair, route through WETH
    const directPairExists = await this.checkDirectPair(order.tokenIn, order.tokenOut);
    if (!directPairExists) {
      path.splice(1, 0, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'); // WETH
    }

    const gasStrategy = await this.calculateOptimalGas(order.priority);

    try {
      const txHash = await this.walletClient!.writeContract({
        address: router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [order.amountIn, order.minAmountOut, path, this.account.address, BigInt(order.deadline)],
        gas: gasStrategy.baseFee + gasStrategy.priorityFee,
        maxFeePerGas: gasStrategy.maxFee,
        maxPriorityFeePerGas: gasStrategy.priorityFee,
      });

      const receipt = await this.client.waitForTransactionReceipt({ hash: txHash });

      return {
        success: true,
        txHash,
        gasUsed: receipt.gasUsed,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  private async ensureTokenApproval(tokenAddress: string, spender: string, amount: bigint): Promise<void> {
    // Skip approval in simulation mode
    if (!isRealTrading(tradingConfig)) {
      console.log(`  🎮 [SIMULATION] Skipping token approval`);
      return;
    }

    const currentAllowance = await this.client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, spender as `0x${string}`],
    }) as bigint;

    if (currentAllowance < amount) {
      console.log(`  Approving ${formatEther(amount)} tokens...`);

      const txHash = await this.walletClient!.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, amount],
      });

      await this.client.waitForTransactionReceipt({ hash: txHash });
      console.log(`  ✅ Approval confirmed`);
    }
  }

  private async checkDirectPair(token0: string, token1: string): Promise<boolean> {
    // Would check if direct trading pair exists
    // For now, assume WETH routing is needed for most pairs
    const majorTokens = [
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    ];

    return majorTokens.includes(token0.toLowerCase()) || majorTokens.includes(token1.toLowerCase());
  }

  private async getExpectedAmountOut(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint> {
    try {
      const path = [tokenIn, tokenOut];

      // Use WETH routing if needed
      if (!await this.checkDirectPair(tokenIn, tokenOut)) {
        path.splice(1, 0, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
      }

      // Use price client (Alchemy if available) for faster queries
      const amounts = await this.priceClient.readContract({
        address: ROUTERS.UNISWAP_V2 as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path as `0x${string}`[]],
      }) as bigint[];

      return amounts[amounts.length - 1];
    } catch (error) {
      // Fallback estimate
      return amountIn; // 1:1 ratio as fallback
    }
  }

  private async getAmountOutForRoute(tokenIn: string, tokenOut: string, amountIn: bigint, router: string): Promise<bigint> {
    const path = [tokenIn, tokenOut];

    if (!await this.checkDirectPair(tokenIn, tokenOut)) {
      path.splice(1, 0, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    }

    try {
      // Use price client (Alchemy if available) for faster queries
      const amounts = await this.priceClient.readContract({
        address: router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path as `0x${string}`[]],
      }) as bigint[];

      return amounts[amounts.length - 1];
    } catch (error) {
      return BigInt(0);
    }
  }

  private async calculateOptimalGas(priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): Promise<GasStrategy> {
    const feeHistory = await this.client.getFeeHistory({
      blockCount: 4,
      rewardPercentiles: [25, 50, 75],
    });

    const baseFee = feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1];

    // Adjust priority fee based on urgency
    const priorityMultipliers = {
      LOW: 1.0,
      MEDIUM: 1.2,
      HIGH: 1.5,
      CRITICAL: 2.0,
    };

    const medianPriorityFee = feeHistory.reward[feeHistory.reward.length - 1][1]; // 50th percentile
    const priorityFee = BigInt(Math.floor(Number(medianPriorityFee) * priorityMultipliers[priority]));
    const maxFee = baseFee + priorityFee;

    return {
      name: `${priority}_STRATEGY`,
      baseFee,
      priorityFee,
      maxFee,
      confidence: priority === 'CRITICAL' ? 0.95 : priority === 'HIGH' ? 0.85 : 0.75,
    };
  }

  async getOrderStatus(orderId: string): Promise<TradeOrder | null> {
    return this.orders.get(orderId) || null;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') {
      return false;
    }

    order.status = 'cancelled';
    this.orders.set(orderId, order);

    // Remove from execution queue
    const queueIndex = this.executionQueue.findIndex(o => o.id === orderId);
    if (queueIndex >= 0) {
      this.executionQueue.splice(queueIndex, 1);
    }

    console.log(`❌ Cancelled order ${orderId}`);
    return true;
  }

  async startAutoExecution(intervalMs: number = 5000): Promise<void> {
    console.log(`🔄 Starting auto-execution (${intervalMs}ms intervals)...`);

    setInterval(async () => {
      try {
        const result = await this.executeNextOrder();
        if (result) {
          if (result.success) {
            console.log(`✅ Order executed successfully: ${result.txHash}`);
          } else {
            console.log(`❌ Order execution failed: ${result.error}`);
          }
        }
      } catch (error) {
        console.error('Error in auto-execution:', error);
      }
    }, intervalMs);
  }

  getQueueStatus(): { pending: number; total: number } {
    return {
      pending: this.executionQueue.length,
      total: this.orders.size,
    };
  }
}

// Export singleton instance
let privateKey: string | undefined;
if (process.env.PRIVATE_KEY && tradingConfig.mode !== TradingMode.SIMULATION) {
  privateKey = `0x${process.env.PRIVATE_KEY.replace('0x', '')}`;
}
export const tradeExecutor = new TradeExecutor(privateKey);

// CLI functions
export async function createSwapOrder(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  maxSlippage: number;
  strategy: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}): Promise<string> {
  return await tradeExecutor.createOrder({
    type: 'swap',
    ...params,
  });
}

export async function executeNextTrade(): Promise<ExecutionResult | null> {
  return await tradeExecutor.executeNextOrder();
}

export async function getTradeStatus(orderId: string): Promise<TradeOrder | null> {
  return await tradeExecutor.getOrderStatus(orderId);
}

export async function startTradingBot(intervalMs: number = 5000): Promise<void> {
  await tradeExecutor.startAutoExecution(intervalMs);
}

export function getExecutionQueueStatus(): { pending: number; total: number } {
  return tradeExecutor.getQueueStatus();
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🤖 TRADE EXECUTOR STARTING...');

  // Example: Create a test order
  createSwapOrder({
    tokenIn: '0x0000000000000000000000000000000000000000', // ETH
    tokenOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    amountIn: '0.1',
    maxSlippage: 0.01, // 1%
    strategy: 'test_swap',
    priority: 'MEDIUM',
  })
    .then(orderId => console.log(`Created order: ${orderId}`))
    .then(() => startTradingBot(3000)) // Execute every 3 seconds
    .catch(console.error);
}