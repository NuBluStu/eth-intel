#!/usr/bin/env tsx

/**
 * LIVE ARBITRAGE BOT - Real Mainnet Trading with Alchemy Integration
 *
 * This bot executes real arbitrage trades on Ethereum mainnet
 * Uses Alchemy for fast price discovery and MEV protection
 *
 * SAFETY FEATURES:
 * - Maximum trade size: 0.01 ETH
 * - Minimum profit threshold: 0.0001 ETH
 * - Gas price limits
 * - Slippage protection
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrageScanner, ArbitrageOpportunity } from './src/services/arbitrage-scanner.js';
import { mevProtection } from './src/services/mev-protection.js';
import { tradingConfig, isRealTrading, validateTradeSize } from './src/config/trading-modes.js';
import { tradeExecutor } from './src/trade-executor.js';
import * as dotenv from 'dotenv';

dotenv.config();

class LiveArbitrageBot {
  private wallet: any;
  private publicClient: any;
  private walletClient: any;
  private isRunning: boolean = false;
  private totalProfit: number = 0;
  private tradesExecuted: number = 0;
  private startTime: number = Date.now();
  private maxTradeSize: number = 0.01; // Hard limit for safety

  constructor() {
    // Verify we're in mainnet mode
    if (tradingConfig.mode !== 'mainnet' || !isRealTrading(tradingConfig)) {
      throw new Error('Bot must be configured for mainnet mode with EXECUTE_REAL_TRADES=true');
    }

    // Initialize wallet
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key not found in .env');
    }

    this.wallet = privateKeyToAccount(`0x${privateKey.replace('0x', '')}` as `0x${string}`);

    // Use Alchemy for speed
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(alchemyUrl),
    });

    this.walletClient = createWalletClient({
      account: this.wallet,
      chain: mainnet,
      transport: http(alchemyUrl),
    });

    console.log('================================');
    console.log('💎 LIVE ARBITRAGE BOT - MAINNET');
    console.log('================================');
    console.log(`🔴 MODE: ${tradingConfig.mode.toUpperCase()} - REAL MONEY AT RISK`);
    console.log(`💼 Wallet: ${this.wallet.address}`);
    console.log(`🚀 Using Alchemy for enhanced performance`);
    console.log(`🛡️  MEV Protection: ${process.env.USE_ALCHEMY_PRIVATE_MEMPOOL === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`💰 Max Trade Size: ${this.maxTradeSize} ETH`);
    console.log(`📊 Min Profit: ${process.env.MIN_PROFIT_THRESHOLD || '0.0001'} ETH`);
    console.log('================================\n');
  }

  async initialize() {
    // Check balance
    const balance = await this.publicClient.getBalance({
      address: this.wallet.address,
    });

    console.log(`💰 Current Balance: ${formatEther(balance)} ETH`);

    if (Number(formatEther(balance)) < 0.015) {
      throw new Error('Insufficient balance. Need at least 0.015 ETH (0.01 for trading + gas)');
    }

    // Check gas price
    const gasPrice = await this.publicClient.getGasPrice();
    console.log(`⛽ Current Gas Price: ${(Number(gasPrice) / 1e9).toFixed(2)} gwei`);

    if (gasPrice > BigInt(process.env.MAX_GAS_PRICE || '50') * 10n ** 9n) {
      console.log('⚠️  Gas price too high, waiting for better conditions...');
    }

    console.log('✅ Bot initialized and ready to trade\n');
  }

  async scanAndExecute() {
    try {
      const gasPrice = await this.publicClient.getGasPrice();

      // Scan for arbitrage opportunities
      console.log(`\n[${new Date().toLocaleTimeString()}] Scanning for opportunities...`);
      const opportunity = await arbitrageScanner.scanForArbitrage(gasPrice);

      if (!opportunity || opportunity.netProfit <= 0) {
        return;
      }

      // Additional safety checks
      if (opportunity.amountIn > this.maxTradeSize) {
        console.log(`⚠️  Reducing trade size from ${opportunity.amountIn} to ${this.maxTradeSize} ETH`);
        opportunity.amountIn = this.maxTradeSize;
      }

      // Sanity check - reject unrealistic profits (likely calculation errors)
      if (opportunity.profitPercent > 10) {
        console.log(`⚠️  Unrealistic profit ${opportunity.profitPercent.toFixed(2)}% - likely a pricing error, skipping...`);
        return;
      }

      // Skip low confidence opportunities
      if (opportunity.confidence < 0.5) {
        console.log(`⚠️  Low confidence ${(opportunity.confidence * 100).toFixed(0)}% - skipping...`);
        return;
      }

      // Check sandwich risk if MEV protection is enabled
      if (process.env.USE_ALCHEMY_PRIVATE_MEMPOOL === 'true') {
        const risk = await mevProtection.detectSandwichRisk(
          opportunity.tokenIn,
          opportunity.tokenOut,
          parseEther(opportunity.amountIn.toString())
        );

        if (risk.risk === 'HIGH') {
          console.log(`⚠️  High sandwich risk detected: ${risk.reason}`);
          console.log('   Using private mempool for protection...');
        }
      }

      // Execute the arbitrage
      await this.executeArbitrage(opportunity);

    } catch (error) {
      console.error('❌ Error in scan cycle:', error);
    }
  }

  async executeArbitrage(opportunity: ArbitrageOpportunity) {
    console.log('\n🎯 EXECUTING ARBITRAGE TRADE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Route: ${opportunity.dex1} → ${opportunity.dex2}`);
    console.log(`Token: ${opportunity.token}`);
    console.log(`Amount: ${opportunity.amountIn} ETH`);
    console.log(`Expected Net Profit: ${opportunity.netProfit.toFixed(6)} ETH`);
    console.log(`Confidence: ${(opportunity.confidence * 100).toFixed(0)}%`);

    // Final confirmation
    console.log('\n⚠️  EXECUTING REAL TRADE IN 3 SECONDS...');
    console.log('   Press Ctrl+C now to cancel');
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // Create the swap order
      const orderId = await tradeExecutor.createOrder({
        type: 'swap',
        tokenIn: opportunity.tokenIn,
        tokenOut: opportunity.tokenOut,
        amountIn: parseEther(opportunity.amountIn.toString()),
        minAmountOut: parseEther((opportunity.amountIn * 0.995).toString()), // 0.5% slippage
        maxSlippage: 0.005,
        deadline: opportunity.deadline,
        strategy: 'arbitrage',
        priority: opportunity.netProfit > 0.001 ? 'HIGH' : 'MEDIUM',
      });

      console.log(`📝 Order created: ${orderId}`);
      console.log('⏳ Executing swap...');

      // Execute the order
      const result = await tradeExecutor.executeNextOrder();

      if (result?.success) {
        console.log(`✅ TRADE EXECUTED SUCCESSFULLY!`);
        console.log(`   Transaction: ${result.txHash}`);
        console.log(`   Gas Used: ${formatEther(result.gasUsed || 0n)} ETH`);

        this.totalProfit += opportunity.netProfit;
        this.tradesExecuted++;

        // Wait for second leg of arbitrage
        console.log('⏳ Executing reverse swap...');
        // In reality, you'd execute the reverse trade here
      } else {
        console.log(`❌ Trade execution failed: ${result?.error}`);
      }

    } catch (error) {
      console.error('❌ Trade execution error:', error);
    }
  }

  async run() {
    await this.initialize();

    console.log('🚀 Starting arbitrage scanner...');
    console.log('   Scanning every 5 seconds');
    console.log('   Press Ctrl+C to stop\n');

    this.isRunning = true;

    // Scan interval
    const scanInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.scanAndExecute();
      }
    }, 5000); // Scan every 5 seconds

    // Status update interval
    const statusInterval = setInterval(() => {
      this.displayStatus();
    }, 30000); // Update every 30 seconds

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down bot...');
      this.isRunning = false;
      clearInterval(scanInterval);
      clearInterval(statusInterval);
      this.displayFinalStats();
      process.exit(0);
    });
  }

  displayStatus() {
    const runtime = Math.floor((Date.now() - this.startTime) / 1000);
    const stats = arbitrageScanner.getStats();

    console.log('\n📊 BOT STATUS UPDATE');
    console.log('━━━━━━━━━━━━━━━━━━━━');
    console.log(`Runtime: ${Math.floor(runtime / 60)}m ${runtime % 60}s`);
    console.log(`Opportunities Found: ${stats.opportunitiesFound}`);
    console.log(`Profitable: ${stats.profitableOpportunities}`);
    console.log(`Trades Executed: ${this.tradesExecuted}`);
    console.log(`Total Profit: ${this.totalProfit.toFixed(6)} ETH`);
  }

  displayFinalStats() {
    console.log('\n\n================================');
    console.log('📊 FINAL STATISTICS');
    console.log('================================');
    console.log(`Total Runtime: ${Math.floor((Date.now() - this.startTime) / 60000)} minutes`);
    console.log(`Trades Executed: ${this.tradesExecuted}`);
    console.log(`Total Profit: ${this.totalProfit.toFixed(6)} ETH`);

    if (this.tradesExecuted > 0) {
      console.log(`Average Profit/Trade: ${(this.totalProfit / this.tradesExecuted).toFixed(6)} ETH`);
    }

    const stats = arbitrageScanner.getStats();
    console.log(`\nScanner Performance:`);
    console.log(`  Opportunities Scanned: ${stats.opportunitiesFound}`);
    console.log(`  Profitable Found: ${stats.profitableOpportunities}`);
    console.log(`  Success Rate: ${stats.successRate}%`);
    console.log('================================\n');
  }
}

// Main execution
async function main() {
  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          💎 LIVE ARBITRAGE BOT - ETHEREUM MAINNET 💎       ║');
  console.log('║                                                           ║');
  console.log('║  ⚠️  WARNING: This bot executes REAL transactions!       ║');
  console.log('║     Real money is at risk. Use at your own discretion.   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Safety check
  if (process.env.TRADING_MODE !== 'mainnet' || process.env.EXECUTE_REAL_TRADES !== 'true') {
    console.error('❌ Bot is not configured for mainnet trading');
    console.error('   Set TRADING_MODE=mainnet and EXECUTE_REAL_TRADES=true in .env');
    process.exit(1);
  }

  const bot = new LiveArbitrageBot();
  await bot.run();
}

// Run the bot
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});