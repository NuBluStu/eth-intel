#!/usr/bin/env tsx
/**
 * Swing Trading Bot - Copies active traders with frequent updates
 */

import { WalletManager } from './wallet-manager.js';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { SafetyGuardian } from './safety-guardian.js';
import { parseEther, formatEther } from 'viem';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log(chalk.cyan.bold('\n════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('    🚀 SWING TRADER COPY BOT - HIGH FREQUENCY'));
  console.log(chalk.cyan.bold('════════════════════════════════════════════════════\n'));
  
  // Active swing traders
  const swingTraders = [
    { address: '0x9a47f3289794e9bbc6a3c571f6d96ad4e7baed16', confidence: 0.85, rate: 41.67, name: 'SwingPro1' },
    { address: '0x55877bd7f2ee37bde55ca4b271a3631f3a7ef121', confidence: 0.85, rate: 72.5, name: 'ActiveTrader' },
    { address: '0xcf5540fffcdc3d510b18bfca6d2b9987b0772559', confidence: 0.8, rate: 63, name: 'WETHSwinger' },
    { address: '0xa9d1e15d94ed894aef73f0b8700beae4f3ad3e43', confidence: 0.8, rate: 42, name: 'Balanced' },
    { address: '0x0e5891850bb3f03090f03010000806f080040100', confidence: 0.75, rate: 75, name: 'HighFreq' },
    { address: '0x64f2095cc11e4726078f4a64d4279c7e7fb7e6ec', confidence: 0.75, rate: 49, name: 'Swing6' },
    { address: '0xb7f52d4a8cf30b0b0c7516f7262492556d9f92d4', confidence: 0.7, rate: 56, name: 'WETHOnly' }
  ];
  
  // Initialize
  console.log(chalk.yellow('⚙️  Initializing...\n'));
  
  const walletManager = new WalletManager(process.env.WALLET_PASSWORD || ';jlk');
  const tradeExecutor = new TradeExecutor(walletManager);
  const copyTrader = new CopyTrader(walletManager, tradeExecutor);
  const safetyGuardian = new SafetyGuardian(walletManager);
  
  await walletManager.init();
  await safetyGuardian.init();
  
  const startBalance = await walletManager.getBalance();
  const ethBalance = Number(formatEther(startBalance));
  
  console.log(chalk.green(`💰 Wallet: ${ethBalance.toFixed(4)} ETH`));
  console.log(chalk.gray(`   Address: 0x9e664689df698166a783880c29107596f5468049\n`));
  
  if (startBalance < parseEther('0.04')) {
    console.log(chalk.red('⚠️  Need at least 0.04 ETH'));
    process.exit(1);
  }
  
  // Aggressive settings for swing trading
  safetyGuardian.setMaxPositionSize(parseEther('0.008')); // Smaller per trade (more trades)
  safetyGuardian.setStopLoss(0.05); // Tighter stop loss at 5%
  
  console.log(chalk.yellow('⚙️  Swing Trading Configuration:'));
  console.log(chalk.gray('   • Per trade: 0.008 ETH'));
  console.log(chalk.gray('   • Consensus: 0.015 ETH (3+ wallets)'));
  console.log(chalk.gray('   • Stop loss: 5%'));
  console.log(chalk.gray('   • Copy delay: 1 block (fast execution)'));
  console.log(chalk.gray('   • Updates: Every 5 minutes\n'));
  
  // Add swing traders
  console.log(chalk.cyan('👥 Loading Active Swing Traders:\n'));
  
  for (let i = 0; i < swingTraders.length; i++) {
    const t = swingTraders[i];
    await copyTrader.addWallet(t.address, t.confidence);
    console.log(
      chalk.gray(`   ${i + 1}. `) +
      chalk.white(`${t.name.padEnd(12)}`) +
      chalk.gray(` | ${t.rate.toFixed(1)}/hr | ${(t.confidence * 100).toFixed(0)}% conf | ${t.address.substring(0, 8)}...`)
    );
  }
  
  console.log(chalk.green('\n✅ 7 Active swing traders loaded\n'));
  
  // Start monitoring
  console.log(chalk.cyan('🔍 Starting High-Frequency Monitoring...\n'));
  await copyTrader.startMonitoring();
  
  const startTime = Date.now();
  let updateCount = 0;
  let tradeCount = 0;
  let lastTradeTime = Date.now();
  
  // Track token movements
  const tokenActivity = new Map<string, { buys: number; sells: number; wallets: Set<string> }>();
  
  // 5-minute updates
  const updateInterval = setInterval(async () => {
    updateCount++;
    const currentBalance = await walletManager.getBalance();
    const profit = currentBalance - startBalance;
    const profitEth = Number(formatEther(profit));
    const profitPercent = (Number(profit) * 100) / Number(startBalance);
    const runtime = ((Date.now() - startTime) / 60000).toFixed(0); // minutes
    
    console.log(chalk.gray(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    console.log(chalk.cyan(`[${new Date().toLocaleTimeString()}] Update #${updateCount} (${runtime} min runtime)`));
    console.log(chalk.gray(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    
    // Balance status
    console.log(`💰 Balance: ${formatEther(currentBalance)} ETH`);
    if (profit !== 0n) {
      const indicator = profit >= 0n ? chalk.green('+') : chalk.red('-');
      console.log(`📊 P&L: ${indicator}${Math.abs(profitEth).toFixed(5)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    }
    
    // Check pending trades
    const pending = copyTrader.getPendingTrades();
    if (pending.length > 0) {
      console.log(chalk.yellow(`\n⚡ ${pending.length} pending trades:`));
      
      // Clear old token activity
      tokenActivity.clear();
      
      // Analyze pending trades
      pending.forEach(t => {
        const tokenKey = t.token.substring(0, 10);
        if (!tokenActivity.has(tokenKey)) {
          tokenActivity.set(tokenKey, { buys: 0, sells: 0, wallets: new Set() });
        }
        const activity = tokenActivity.get(tokenKey)!;
        if (t.action === 'buy') {
          activity.buys++;
        } else {
          activity.sells++;
        }
        activity.wallets.add(t.walletAddress.substring(0, 8));
      });
      
      // Show token activity
      for (const [token, activity] of tokenActivity.entries()) {
        const totalActivity = activity.buys + activity.sells;
        if (totalActivity >= 2) {
          const action = activity.buys > activity.sells ? 
            chalk.green(`BUY (${activity.buys}b/${activity.sells}s)`) :
            chalk.red(`SELL (${activity.buys}b/${activity.sells}s)`);
          
          console.log(`   ${token}... : ${action} by ${activity.wallets.size} wallets`);
          
          if (activity.wallets.size >= 3) {
            console.log(chalk.green(`   🎯 CONSENSUS on ${token}! Executing with 0.015 ETH`));
          }
        }
      }
    } else {
      console.log(chalk.gray('   No pending trades'));
    }
    
    // Trading activity
    const timeSinceLastTrade = (Date.now() - lastTradeTime) / 60000;
    if (timeSinceLastTrade > 10) {
      console.log(chalk.yellow(`\n⚠️  No trades in ${timeSinceLastTrade.toFixed(0)} minutes`));
    }
    
    // Check if we should be more aggressive
    if (profitPercent > 1 && pending.length < 3) {
      console.log(chalk.green('\n📈 Profit detected - considering larger positions'));
    }
    
    // Stop loss warning
    if (profitPercent < -3) {
      console.log(chalk.red(`\n⚠️  Approaching stop loss (${profitPercent.toFixed(2)}% / -5%)`));
    }
    
    // Stop loss trigger
    if (profitPercent < -5) {
      console.log(chalk.red.bold('\n🛑 STOP LOSS TRIGGERED!'));
      clearInterval(updateInterval);
      await copyTrader.stopMonitoring();
      process.exit(0);
    }
  }, 300000); // 5 minutes
  
  // Track executed trades
  let executedTrades = 0;
  setInterval(() => {
    const stats = safetyGuardian.getStats();
    if (stats.totalTrades > executedTrades) {
      executedTrades = stats.totalTrades;
      lastTradeTime = Date.now();
      tradeCount++;
      console.log(chalk.green(`\n✅ Trade #${tradeCount} executed!`));
    }
  }, 10000); // Check every 10 seconds
  
  // Hourly detailed report
  setInterval(async () => {
    const currentBalance = await walletManager.getBalance();
    const profit = currentBalance - startBalance;
    const profitPercent = (Number(profit) * 100) / Number(startBalance);
    
    console.log(chalk.cyan.bold('\n\n════════════════════════════════════════'));
    console.log(chalk.cyan.bold('         📊 HOURLY REPORT'));
    console.log(chalk.cyan.bold('════════════════════════════════════════\n'));
    
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log(`Runtime: ${((Date.now() - startTime) / 3600000).toFixed(1)} hours`);
    console.log(`Balance: ${formatEther(currentBalance)} ETH`);
    console.log(`P&L: ${profit >= 0n ? '+' : ''}${formatEther(profit)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    
    const stats = safetyGuardian.getStats();
    if (stats.totalTrades > 0) {
      console.log(`\nTrading Stats:`);
      console.log(`  • Total trades: ${stats.totalTrades}`);
      console.log(`  • Win rate: ${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%`);
      console.log(`  • Avg per trade: ${(profitPercent / stats.totalTrades).toFixed(3)}%`);
    }
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════\n'));
  }, 3600000); // 1 hour
  
  // Shutdown handler
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nShutting down...'));
    clearInterval(updateInterval);
    await copyTrader.stopMonitoring();
    
    const finalBalance = await walletManager.getBalance();
    const finalProfit = finalBalance - startBalance;
    const finalPercent = (Number(finalProfit) * 100) / Number(startBalance);
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════'));
    console.log(chalk.cyan.bold('         📊 FINAL REPORT'));
    console.log(chalk.cyan.bold('════════════════════════════════════════\n'));
    
    console.log(`Final Balance: ${formatEther(finalBalance)} ETH`);
    console.log(`Total P&L: ${finalProfit >= 0n ? '+' : ''}${formatEther(finalProfit)} ETH (${finalPercent >= 0 ? '+' : ''}${finalPercent.toFixed(2)}%)`);
    console.log(`Total trades: ${tradeCount}`);
    console.log(`Runtime: ${((Date.now() - startTime) / 3600000).toFixed(1)} hours`);
    
    const stats = safetyGuardian.getStats();
    if (stats.totalTrades > 0) {
      console.log(`Win rate: ${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%`);
    }
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════\n'));
    
    process.exit(0);
  });
  
  console.log(chalk.green('✅ Swing Trading Bot Active!\n'));
  console.log(chalk.gray('   • Following 7 active swing traders'));
  console.log(chalk.gray('   • Expected: 40-70 trades/hour from wallets'));
  console.log(chalk.gray('   • Updates every 5 minutes'));
  console.log(chalk.gray('   • Tighter 5% stop loss'));
  console.log(chalk.gray('   • Press Ctrl+C to stop\n'));
  
  console.log(chalk.cyan('Waiting for trading opportunities...\n'));
  
  // Keep running
  await new Promise(() => {});
}

main().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});