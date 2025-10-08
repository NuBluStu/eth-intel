/**
 * Trading Mode Configuration
 *
 * Controls whether the bot executes real transactions or simulations
 */

import * as dotenv from 'dotenv';
dotenv.config();

export enum TradingMode {
  SIMULATION = "simulation",  // No real transactions, no wallet needed
  TESTNET = "testnet",        // Real transactions on testnet
  MAINNET = "mainnet"         // Real transactions on mainnet
}

export interface TradingConfig {
  mode: TradingMode;
  executeRealTrades: boolean;
  network: string;
  requireConfirmation: boolean;
  maxTradeSizeETH: number;
  maxGasPrice: bigint;
  slippageTolerance: number;
  safetyChecks: boolean;
}

export function getTradingConfig(): TradingConfig {
  const mode = (process.env.TRADING_MODE || 'simulation').toLowerCase() as TradingMode;

  // Safety: Default to simulation if not explicitly set
  if (!Object.values(TradingMode).includes(mode)) {
    console.warn('⚠️  Invalid TRADING_MODE, defaulting to simulation');
    return getSimulationConfig();
  }

  switch (mode) {
    case TradingMode.MAINNET:
      return getMainnetConfig();
    case TradingMode.TESTNET:
      return getTestnetConfig();
    case TradingMode.SIMULATION:
    default:
      return getSimulationConfig();
  }
}

function getSimulationConfig(): TradingConfig {
  console.log('🎮 Running in SIMULATION mode - No real transactions');
  return {
    mode: TradingMode.SIMULATION,
    executeRealTrades: false,
    network: 'simulation',
    requireConfirmation: false,
    maxTradeSizeETH: 1.0, // Can be higher in simulation
    maxGasPrice: 0n,
    slippageTolerance: 0.01,
    safetyChecks: false
  };
}

function getTestnetConfig(): TradingConfig {
  console.log('🧪 Running in TESTNET mode - Real transactions on test network');
  return {
    mode: TradingMode.TESTNET,
    executeRealTrades: process.env.EXECUTE_REAL_TRADES === 'true',
    network: process.env.TESTNET_NAME || 'goerli',
    requireConfirmation: process.env.REQUIRE_CONFIRMATION !== 'false',
    maxTradeSizeETH: parseFloat(process.env.MAX_TRADE_SIZE_ETH || '0.1'),
    maxGasPrice: BigInt(process.env.MAX_GAS_PRICE || '100') * 10n ** 9n,
    slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.01'),
    safetyChecks: true
  };
}

function getMainnetConfig(): TradingConfig {
  console.log('🔴 Running in MAINNET mode - REAL MONEY AT RISK!');

  // Extra safety check for mainnet
  if (process.env.EXECUTE_REAL_TRADES !== 'true') {
    console.log('⚠️  EXECUTE_REAL_TRADES not explicitly set to true');
    console.log('⚠️  Mainnet mode requires explicit confirmation');
    console.log('⚠️  Set EXECUTE_REAL_TRADES=true in .env to enable');
    throw new Error('Mainnet trading not explicitly enabled');
  }

  // Confirm understanding of risks
  console.log('═══════════════════════════════════════════════════════');
  console.log('⚠️  WARNING: MAINNET MODE - REAL TRANSACTIONS ⚠️');
  console.log('═══════════════════════════════════════════════════════');
  console.log('• Real ETH will be spent on gas');
  console.log('• Real trades will be executed');
  console.log('• Real profits and losses will occur');
  console.log('• Transactions are irreversible');
  console.log('═══════════════════════════════════════════════════════');

  return {
    mode: TradingMode.MAINNET,
    executeRealTrades: true,
    network: 'mainnet',
    requireConfirmation: process.env.REQUIRE_CONFIRMATION !== 'false',
    maxTradeSizeETH: parseFloat(process.env.MAX_TRADE_SIZE_ETH || '0.01'),
    maxGasPrice: BigInt(process.env.MAX_GAS_PRICE || '50') * 10n ** 9n,
    slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.005'),
    safetyChecks: true
  };
}

export function isRealTrading(config: TradingConfig): boolean {
  return config.mode !== TradingMode.SIMULATION && config.executeRealTrades;
}

export function requiresWallet(config: TradingConfig): boolean {
  return config.mode !== TradingMode.SIMULATION;
}

export function validateTradeSize(amountETH: number, config: TradingConfig): boolean {
  if (amountETH > config.maxTradeSizeETH) {
    console.error(`❌ Trade size ${amountETH} ETH exceeds maximum ${config.maxTradeSizeETH} ETH`);
    return false;
  }
  return true;
}

export function validateGasPrice(gasPrice: bigint, config: TradingConfig): boolean {
  if (config.mode === TradingMode.SIMULATION) return true;

  if (gasPrice > config.maxGasPrice) {
    console.error(`❌ Gas price ${gasPrice / 10n ** 9n} gwei exceeds maximum ${config.maxGasPrice / 10n ** 9n} gwei`);
    return false;
  }
  return true;
}

// Export singleton config
export const tradingConfig = getTradingConfig();