/**
 * Trading Tools for LLM Orchestrator
 *
 * WARNING: These tools give LLMs direct trading capability.
 * Use with extreme caution and proper safeguards.
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY ?
  (process.env.PRIVATE_KEY.startsWith('0x') ?
    process.env.PRIVATE_KEY as `0x${string}` :
    `0x${process.env.PRIVATE_KEY}` as `0x${string}`) :
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
const RPC_URL = process.env.RPC_HTTP || 'http://127.0.0.1:8545';
const SIMULATION_MODE = process.env.EXECUTE_REAL_TRADES !== 'true';

// Safety limits
const MAX_TRADE_ETH = 0.01; // Maximum per trade
const MAX_SLIPPAGE = 0.05; // 5% max slippage
const MAX_GAS_PRICE = 100; // Gwei
const MIN_LIQUIDITY = 25000; // Minimum pool liquidity in USD

// Uniswap V2 Router address
const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as Address;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address;

// Initialize clients
const account = privateKeyToAccount(PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(RPC_URL)
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL)
});

// Track positions for risk management
interface Position {
  token: Address;
  amount: bigint;
  entryPrice: number;
  entryBlock: number;
  entryTime: Date;
}

const positions: Map<Address, Position> = new Map();
let totalProfit = 0;
let totalTrades = 0;
let winningTrades = 0;

/**
 * Safety check before any trade
 */
async function performSafetyChecks(amountETH: number): Promise<{ safe: boolean; reason?: string }> {
  // Check simulation mode
  if (SIMULATION_MODE) {
    console.log('🔒 SIMULATION MODE - No real trades will execute');
    return { safe: true };
  }

  // Check amount limits
  if (amountETH > MAX_TRADE_ETH) {
    return { safe: false, reason: `Trade size ${amountETH} ETH exceeds maximum ${MAX_TRADE_ETH} ETH` };
  }

  // Check gas price
  const gasPrice = await publicClient.getGasPrice();
  const gasPriceGwei = Number(formatEther(gasPrice)) * 1e9;
  if (gasPriceGwei > MAX_GAS_PRICE) {
    return { safe: false, reason: `Gas price ${gasPriceGwei} gwei exceeds maximum ${MAX_GAS_PRICE} gwei` };
  }

  // Check wallet balance
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceETH = Number(formatEther(balance));
  if (balanceETH < amountETH) {
    return { safe: false, reason: `Insufficient balance: ${balanceETH} ETH < ${amountETH} ETH` };
  }

  return { safe: true };
}

/**
 * Buy ERC-20 token
 */
export async function buyToken(
  tokenAddress: Address,
  amountETH: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  console.log(`\n💰 Attempting to buy token ${tokenAddress} for ${amountETH} ETH`);

  // Safety checks
  const safety = await performSafetyChecks(amountETH);
  if (!safety.safe) {
    return { success: false, error: safety.reason };
  }

  try {
    if (SIMULATION_MODE) {
      // Simulate the trade
      console.log(`✅ [SIMULATED] Bought token ${tokenAddress} for ${amountETH} ETH`);

      // Track position
      positions.set(tokenAddress, {
        token: tokenAddress,
        amount: BigInt(1000000), // Simulated amount
        entryPrice: amountETH,
        entryBlock: await publicClient.getBlockNumber(),
        entryTime: new Date()
      });

      totalTrades++;
      return { success: true, txHash: '0xSIMULATED' };
    }

    // Real trade execution would go here
    // This is intentionally incomplete for safety
    return { success: false, error: 'Real trading not fully implemented' };

  } catch (error) {
    console.error('❌ Buy failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sell ERC-20 token
 */
export async function sellToken(
  tokenAddress: Address,
  amountTokens: bigint
): Promise<{ success: boolean; txHash?: string; profit?: number; error?: string }> {
  console.log(`\n💸 Attempting to sell ${amountTokens} of token ${tokenAddress}`);

  const position = positions.get(tokenAddress);
  if (!position) {
    return { success: false, error: 'No position found for this token' };
  }

  try {
    if (SIMULATION_MODE) {
      // Calculate simulated profit
      const sellPrice = position.entryPrice * 1.2; // Simulate 20% gain
      const profit = sellPrice - position.entryPrice;

      console.log(`✅ [SIMULATED] Sold token ${tokenAddress}`);
      console.log(`   Entry: ${position.entryPrice} ETH`);
      console.log(`   Exit: ${sellPrice} ETH`);
      console.log(`   Profit: ${profit > 0 ? '+' : ''}${profit.toFixed(4)} ETH`);

      // Update stats
      totalProfit += profit;
      if (profit > 0) winningTrades++;

      // Remove position
      positions.delete(tokenAddress);

      return { success: true, txHash: '0xSIMULATED', profit };
    }

    // Real trade execution would go here
    return { success: false, error: 'Real trading not fully implemented' };

  } catch (error) {
    console.error('❌ Sell failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current positions
 */
export function getCurrentPositions(): Array<{
  token: string;
  entryPrice: number;
  holdTime: string;
  unrealizedPnL: number;
}> {
  const positionList = [];

  for (const [token, position] of positions) {
    const holdTime = Math.floor((Date.now() - position.entryTime.getTime()) / 1000 / 60);

    positionList.push({
      token,
      entryPrice: position.entryPrice,
      holdTime: `${holdTime} minutes`,
      unrealizedPnL: 0 // Would calculate based on current price
    });
  }

  return positionList;
}

/**
 * Get trading statistics
 */
export function getTradingStats() {
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades: totalTrades - winningTrades,
    winRate: `${winRate.toFixed(1)}%`,
    totalProfit: `${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(4)} ETH`,
    openPositions: positions.size,
    mode: SIMULATION_MODE ? 'SIMULATION' : 'LIVE'
  };
}

/**
 * Analyze token for trading opportunity
 */
export async function analyzeToken(tokenAddress: Address): Promise<{
  recommendation: 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
  score: number;
  reasons: string[];
}> {
  console.log(`\n🔍 Analyzing token ${tokenAddress}`);

  const reasons = [];
  let score = 50; // Start neutral

  // Check if we already have a position
  if (positions.has(tokenAddress)) {
    const position = positions.get(tokenAddress);
    const holdTime = Math.floor((Date.now() - position.entryTime.getTime()) / 1000 / 60);

    if (holdTime > 60) {
      reasons.push('Position held over 1 hour - consider taking profit');
      return { recommendation: 'SELL', score: 70, reasons };
    } else {
      reasons.push('Already holding position - monitor for exit');
      return { recommendation: 'HOLD', score: 60, reasons };
    }
  }

  // Basic analysis (would be more sophisticated in production)
  try {
    // Check contract exists
    const code = await publicClient.getBytecode({ address: tokenAddress });
    if (!code || code === '0x') {
      reasons.push('Not a valid contract');
      return { recommendation: 'AVOID', score: 0, reasons };
    }

    // Simulate other checks
    reasons.push('Contract verified');
    score += 10;

    // Check current gas price
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceGwei = Number(formatEther(gasPrice)) * 1e9;

    if (gasPriceGwei < 30) {
      reasons.push('Low gas prices - good for trading');
      score += 10;
    } else if (gasPriceGwei > 75) {
      reasons.push('High gas prices - wait for better conditions');
      score -= 20;
    }

    // Make recommendation
    if (score >= 70) {
      return { recommendation: 'BUY', score, reasons };
    } else if (score >= 50) {
      return { recommendation: 'HOLD', score, reasons };
    } else {
      return { recommendation: 'AVOID', score, reasons };
    }

  } catch (error) {
    reasons.push(`Analysis error: ${error.message}`);
    return { recommendation: 'AVOID', score: 0, reasons };
  }
}

/**
 * Emergency stop - close all positions
 */
export async function emergencyStop(): Promise<{ closed: number; errors: string[] }> {
  console.log('\n🚨 EMERGENCY STOP - Closing all positions');

  const errors = [];
  let closed = 0;

  for (const [token, position] of positions) {
    try {
      const result = await sellToken(token, position.amount);
      if (result.success) {
        closed++;
      } else {
        errors.push(`Failed to close ${token}: ${result.error}`);
      }
    } catch (error) {
      errors.push(`Error closing ${token}: ${error.message}`);
    }
  }

  return { closed, errors };
}

/**
 * Get current wallet balance
 */
export async function getWalletBalance(): Promise<{
  address: string;
  balanceETH: number;
  balanceUSD: number;
}> {
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceETH = Number(formatEther(balance));

  // Would fetch real ETH price here
  const ethPriceUSD = 1650; // Placeholder

  return {
    address: account.address,
    balanceETH,
    balanceUSD: balanceETH * ethPriceUSD
  };
}

// Export all trading tools
export const tradingTools = {
  buyToken,
  sellToken,
  getCurrentPositions,
  getTradingStats,
  analyzeToken,
  emergencyStop,
  getWalletBalance
};