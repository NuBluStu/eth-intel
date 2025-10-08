/**
 * ARBITRAGE CONFIGURATION - Optimized Settings for Profitable Arbitrage
 *
 * Fine-tuned parameters for detecting and executing arbitrage opportunities
 * Includes DEX configurations, profit thresholds, and risk management
 */

import * as dotenv from 'dotenv';
dotenv.config();

// Common token addresses on Ethereum mainnet
export const TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  MKR: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  SNX: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
};

// DEX Router addresses
export const DEX_ROUTERS = {
  UNISWAP_V2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  UNISWAP_V3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  SUSHISWAP: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  BALANCER: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  CURVE: '0x99a58482BD75cbab83b27EC03CA68fF489b5788f',
  ONEINCH: '0x1111111254EEB25477B68fb85Ed929f73A960582',
};

// Factory addresses for pair discovery
export const DEX_FACTORIES = {
  UNISWAP_V2: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  SUSHISWAP: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
};

export interface ArbitrageConfig {
  // Profit thresholds
  minProfitThreshold: number;      // Minimum profit in ETH to execute
  minProfitPercentage: number;      // Minimum profit percentage

  // Gas configuration
  maxGasPrice: bigint;              // Maximum gas price in wei
  gasBufferMultiplier: number;      // Multiplier for gas estimation (safety buffer)
  priorityFeeBoost: number;         // Boost for priority fee (1.0 = normal, 2.0 = double)

  // Trading parameters
  maxTradeSize: number;             // Maximum trade size in ETH
  minTradeSize: number;             // Minimum trade size in ETH
  maxSlippage: number;              // Maximum acceptable slippage (0.01 = 1%)
  deadlineSeconds: number;          // Transaction deadline in seconds

  // DEX configuration
  enabledDEXs: string[];            // List of enabled DEXs
  checkAllPairs: boolean;           // Check all possible pairs or just common ones
  commonTokens: string[];           // List of tokens to focus on

  // Advanced features
  useFlashloans: boolean;           // Enable flashloan arbitrage
  flashloanProvider: string;        // AAVE, dYdX, etc.
  useMevProtection: boolean;        // Enable MEV protection
  usePrivateMempool: boolean;       // Use Alchemy's private mempool

  // Monitoring
  scanIntervalMs: number;           // How often to scan for opportunities
  maxConcurrentScans: number;       // Maximum concurrent scans
  logProfitableOnly: boolean;       // Only log profitable opportunities

  // Risk management
  maxDailyTrades: number;           // Maximum trades per day
  maxDailyLoss: number;             // Maximum loss per day in ETH
  stopLossPercent: number;          // Stop loss percentage
  pauseAfterLoss: boolean;          // Pause trading after loss
  pauseDurationMs: number;          // How long to pause after loss
}

export const arbitrageConfig: ArbitrageConfig = {
  // Profit thresholds
  minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.001'), // 0.001 ETH minimum
  minProfitPercentage: parseFloat(process.env.MIN_PROFIT_PERCENTAGE || '0.5'), // 0.5% minimum

  // Gas configuration
  maxGasPrice: BigInt(process.env.MAX_GAS_PRICE || '100') * 10n ** 9n, // 100 gwei default
  gasBufferMultiplier: parseFloat(process.env.GAS_BUFFER_MULTIPLIER || '1.2'), // 20% buffer
  priorityFeeBoost: parseFloat(process.env.PRIORITY_FEE_BOOST || '1.5'), // 50% boost for speed

  // Trading parameters
  maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE_ETH || '1.0'),
  minTradeSize: parseFloat(process.env.MIN_TRADE_SIZE_ETH || '0.01'),
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '0.01'), // 1% default
  deadlineSeconds: parseInt(process.env.DEADLINE_SECONDS || '120'), // 2 minutes

  // DEX configuration
  enabledDEXs: (process.env.ENABLED_DEXS || 'UNISWAP_V2,UNISWAP_V3,SUSHISWAP').split(','),
  checkAllPairs: process.env.CHECK_ALL_PAIRS === 'true',
  commonTokens: [TOKENS.USDC, TOKENS.USDT, TOKENS.DAI, TOKENS.WBTC],

  // Advanced features
  useFlashloans: process.env.USE_FLASHLOANS === 'true',
  flashloanProvider: process.env.FLASHLOAN_PROVIDER || 'AAVE',
  useMevProtection: process.env.USE_MEV_PROTECTION !== 'false', // Default true
  usePrivateMempool: process.env.USE_ALCHEMY_PRIVATE_MEMPOOL === 'true',

  // Monitoring
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '2000'), // 2 seconds
  maxConcurrentScans: parseInt(process.env.MAX_CONCURRENT_SCANS || '3'),
  logProfitableOnly: process.env.LOG_PROFITABLE_ONLY === 'true',

  // Risk management
  maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '100'),
  maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.1'), // 0.1 ETH
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '5'), // 5%
  pauseAfterLoss: process.env.PAUSE_AFTER_LOSS !== 'false', // Default true
  pauseDurationMs: parseInt(process.env.PAUSE_DURATION_MS || '300000'), // 5 minutes
};

/**
 * Calculate if an opportunity is profitable after gas costs
 */
export function isProfitable(
  grossProfit: number,
  gasEstimate: bigint,
  gasPrice: bigint
): { profitable: boolean; netProfit: number; profitPercent: number } {
  const gasCost = Number(gasEstimate * gasPrice) / 1e18;
  const netProfit = grossProfit - gasCost;
  const profitPercent = (netProfit / gasCost) * 100;

  const profitable =
    netProfit >= arbitrageConfig.minProfitThreshold &&
    profitPercent >= arbitrageConfig.minProfitPercentage;

  return { profitable, netProfit, profitPercent };
}

/**
 * Get optimal gas settings for arbitrage execution
 */
export function getOptimalGasSettings(priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
  const boostMultipliers = {
    LOW: 1.0,
    MEDIUM: 1.2,
    HIGH: 1.5,
    CRITICAL: 2.0,
  };

  return {
    maxFeePerGas: arbitrageConfig.maxGasPrice,
    maxPriorityFeePerGas: arbitrageConfig.maxGasPrice * BigInt(Math.floor(boostMultipliers[priority] * 100)) / 100n,
    gasLimit: 500000n, // Conservative estimate for DEX swaps
  };
}

/**
 * Calculate deadline for transaction
 */
export function getDeadline(): number {
  return Math.floor(Date.now() / 1000) + arbitrageConfig.deadlineSeconds;
}

/**
 * Filter tokens based on configuration
 */
export function getTargetTokens(): string[] {
  if (arbitrageConfig.checkAllPairs) {
    return Object.values(TOKENS);
  }
  return arbitrageConfig.commonTokens;
}

/**
 * Check if DEX is enabled
 */
export function isDEXEnabled(dexName: string): boolean {
  return arbitrageConfig.enabledDEXs.includes(dexName);
}

/**
 * Validate trade size
 */
export function isValidTradeSize(amount: number): boolean {
  return amount >= arbitrageConfig.minTradeSize && amount <= arbitrageConfig.maxTradeSize;
}

// Export for use in other modules
export default arbitrageConfig;