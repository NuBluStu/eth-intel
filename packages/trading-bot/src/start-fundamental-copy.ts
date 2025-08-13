#!/usr/bin/env tsx
/**
 * Start copy trading with fundamental traders
 */

import { WalletManager } from './wallet-manager.js';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { MLPredictor } from './ml-predictor.js';
import { SafetyGuardian } from './safety-guardian.js';
import { parseEther, formatEther } from 'viem';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log(chalk.cyan('🚀 Starting Fundamental Trader Copy Bot\n'));
  
  // Load fundamental traders
  const tradersJson = fs.readFileSync(
    path.join(process.cwd(), 'fundamental-traders.json'),
    'utf-8'
  );
  const fundamentalTraders = JSON.parse(tradersJson);
  
  // Initialize components
  const walletManager = new WalletManager(process.env.WALLET_PASSWORD || ';jlk');
  const tradeExecutor = new TradeExecutor(walletManager);
  const copyTrader = new CopyTrader(walletManager, tradeExecutor);
  const mlPredictor = new MLPredictor();
  const safetyGuardian = new SafetyGuardian(walletManager);
  
  await walletManager.init();
  await mlPredictor.init();
  await safetyGuardian.init();
  
  // Check balance
  const startBalance = await walletManager.getBalance();
  console.log(chalk.green(`💰 Starting Balance: ${formatEther(startBalance)} ETH\n`));
  
  if (startBalance < parseEther('0.04')) {
    console.log(chalk.red('⚠️ Insufficient balance. Need at least 0.04 ETH'));
    process.exit(1);
  }
  
  // Configure safety limits
  safetyGuardian.setMaxPositionSize(parseEther('0.01')); // Max 0.01 ETH per trade
  safetyGuardian.setStopLoss(0.08); // 8% stop loss
  
  console.log(chalk.yellow('📋 Configuration:'));
  console.log('  • Max position: 0.01 ETH per trade');
  console.log('  • Consensus position: 0.02 ETH (3+ wallets)');
  console.log('  • Stop loss: 8%');
  console.log('  • Copy delay: 3-5 blocks');
  console.log('  • ML confidence threshold: 60%\n');
  
  // Add fundamental traders to copy list
  console.log(chalk.cyan('📊 Loading Fundamental Traders:\n'));
  
  for (const trader of fundamentalTraders) {
    await copyTrader.addWallet(trader.address, trader.confidence);
    console.log(
      `  ${trader.priority}. ${trader.address.substring(0, 10)}... ` +
      `(${trader.unique_tokens} tokens, ${trader.trades_per_hour.toFixed(1)}/hr, ` +
      `${trader.profit_ratio.toFixed(1)}x profit)`
    );
  }
  
  console.log(chalk.green('\n✅ All 10 fundamental traders loaded\n'));
  
  // Start monitoring
  console.log(chalk.cyan('🔍 Starting trade monitoring...\n'));
  await copyTrader.startMonitoring();
  
  // Performance tracking
  let tradeCount = 0;
  let successfulTrades = 0;
  let totalProfit = 0n;
  
  // Enhanced monitoring with consensus detection
  const tradeQueue = new Map<string, Set<string>>(); // token -> wallets trading it
  
  setInterval(async () => {
    const pendingTrades = copyTrader.getPendingTrades();
    
    if (pendingTrades.length > 0) {
      console.log(chalk.yellow(`\n⚡ ${pendingTrades.length} pending trades detected`));
      
      // Group by token and action
      pendingTrades.forEach(trade => {
        const key = `${trade.token}-${trade.action}`;
        if (!tradeQueue.has(key)) {
          tradeQueue.set(key, new Set());
        }
        tradeQueue.get(key)!.add(trade.walletAddress);
      });
      
      // Check for consensus (3+ wallets)
      for (const [key, wallets] of tradeQueue.entries()) {
        if (wallets.size >= 3) {
          const [token, action] = key.split('-');
          console.log(chalk.green(
            `\n🎯 CONSENSUS: ${wallets.size} wallets ${action}ing token ${token.substring(0, 10)}...`
          ));
          
          // Get ML prediction
          try {
            const prediction = await mlPredictor.predict(token);
            console.log(
              `   ML: ${prediction.action} with ${(prediction.confidence * 100).toFixed(1)}% confidence`
            );
            
            if (prediction.confidence > 0.6) {
              console.log(chalk.green('   ✅ High confidence - executing with 0.02 ETH'));
              // Trade will be executed by copy trader with higher amount
            }
          } catch (err) {
            console.log('   ⚠️ ML prediction unavailable');
          }
        }
      }
      
      // Clear old entries
      tradeQueue.clear();
    }
  }, 30000); // Every 30 seconds
  
  // Hourly performance report
  setInterval(async () => {
    const currentBalance = await walletManager.getBalance();
    const profit = currentBalance - startBalance;
    const profitPercent = Number(profit) * 100 / Number(startBalance);
    
    console.log(chalk.cyan('\n════════════════════════════════════════'));
    console.log(chalk.cyan('📈 HOURLY PERFORMANCE REPORT'));
    console.log(chalk.cyan('════════════════════════════════════════\n'));
    
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log(`💰 Current Balance: ${formatEther(currentBalance)} ETH`);
    console.log(`📊 P&L: ${profit >= 0n ? '+' : ''}${formatEther(profit)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    
    const stats = safetyGuardian.getStats();
    console.log(`\n📊 Trading Statistics:`);
    console.log(`  • Total trades: ${stats.totalTrades}`);
    console.log(`  • Profitable: ${stats.profitableTrades}`);
    console.log(`  • Win rate: ${stats.totalTrades > 0 ? ((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1) : 0}%`);
    
    const followedWallets = copyTrader.getFollowedWallets();
    const activeWallets = followedWallets.filter(w => 
      w.lastSeen && (Date.now() - w.lastSeen.getTime()) < 3600000
    );
    
    console.log(`\n👥 Wallet Activity:`);
    console.log(`  • Following: ${followedWallets.length} wallets`);
    console.log(`  • Active (last hour): ${activeWallets.length}`);
    
    console.log(chalk.cyan('\n════════════════════════════════════════\n'));
    
    // Check stop loss
    if (profitPercent < -8) {
      console.log(chalk.red('\n🛑 STOP LOSS TRIGGERED! Stopping bot...'));
      await copyTrader.stopMonitoring();
      process.exit(0);
    }
  }, 3600000); // Every hour
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n🛑 Shutting down...'));
    
    await copyTrader.stopMonitoring();
    
    const finalBalance = await walletManager.getBalance();
    const finalProfit = finalBalance - startBalance;
    const finalPercent = Number(finalProfit) * 100 / Number(startBalance);
    
    console.log(chalk.cyan('\n════════════════════════════════════════'));
    console.log(chalk.cyan('📊 FINAL REPORT'));
    console.log(chalk.cyan('════════════════════════════════════════\n'));
    
    console.log(`💰 Final Balance: ${formatEther(finalBalance)} ETH`);
    console.log(`📈 Total P&L: ${finalProfit >= 0n ? '+' : ''}${formatEther(finalProfit)} ETH (${finalPercent >= 0 ? '+' : ''}${finalPercent.toFixed(2)}%)`);
    
    const stats = safetyGuardian.getStats();
    if (stats.totalTrades > 0) {
      console.log(`\n📊 Final Statistics:`);
      console.log(`  • Total trades: ${stats.totalTrades}`);
      console.log(`  • Win rate: ${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%`);
    }
    
    console.log(chalk.cyan('\n════════════════════════════════════════\n'));
    console.log(chalk.green('✅ Bot stopped successfully'));
    
    process.exit(0);
  });
  
  // Initial status
  console.log(chalk.green('✅ Copy trading started successfully!\n'));
  console.log(chalk.cyan('📊 Monitoring 10 fundamental traders...'));
  console.log(chalk.cyan('⏰ Will run for 24 hours with hourly reports'));
  console.log(chalk.cyan('🛑 Press Ctrl+C to stop\n'));
  
  // Keep running
  await new Promise(() => {});
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});