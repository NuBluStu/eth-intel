#!/usr/bin/env tsx
/**
 * Simplified copy trading for fundamental traders
 */

import { WalletManager } from './wallet-manager.js';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { SafetyGuardian } from './safety-guardian.js';
import { parseEther, formatEther } from 'viem';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log(chalk.cyan.bold('\n════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('    🚀 FUNDAMENTAL TRADER COPY BOT v1.0'));
  console.log(chalk.cyan.bold('════════════════════════════════════════════════════\n'));
  
  // Load fundamental traders
  const traders = [
    { address: '0x4f82e73edb06d29ff62c91ec8f5ff06571bdeb29', confidence: 0.9, tokens: 11, rate: 16.5 },
    { address: '0x881d40237659c251811cec9c364ef91dc08d300c', confidence: 0.9, tokens: 26, rate: 15.3 },
    { address: '0xb1f05c103cdd519e9f9785cda23c03635a598be4', confidence: 0.85, tokens: 14, rate: 15.5 },
    { address: '0x4acb6c4321253548a7d4bb9c84032cc4ee04bfd7', confidence: 0.9, tokens: 12, rate: 4.3 },
    { address: '0x58edf78281334335effa23101bbe3371b6a36a51', confidence: 0.8, tokens: 15, rate: 17 }
  ];
  
  // Initialize components
  console.log(chalk.yellow('⚙️  Initializing components...\n'));
  
  const walletManager = new WalletManager(process.env.WALLET_PASSWORD || ';jlk');
  const tradeExecutor = new TradeExecutor(walletManager);
  const copyTrader = new CopyTrader(walletManager, tradeExecutor);
  const safetyGuardian = new SafetyGuardian(walletManager);
  
  await walletManager.init();
  await safetyGuardian.init();
  
  // Check balance
  const startBalance = await walletManager.getBalance();
  const ethBalance = Number(formatEther(startBalance));
  
  console.log(chalk.green(`💰 Wallet Balance: ${ethBalance.toFixed(4)} ETH`));
  console.log(chalk.gray(`   Address: 0x9e664689df698166a783880c29107596f5468049\n`));
  
  if (startBalance < parseEther('0.04')) {
    console.log(chalk.red('⚠️  Insufficient balance. Need at least 0.04 ETH'));
    process.exit(1);
  }
  
  // Configure safety
  safetyGuardian.setMaxPositionSize(parseEther('0.01'));
  safetyGuardian.setStopLoss(0.08);
  
  console.log(chalk.yellow('⚙️  Trading Configuration:'));
  console.log(chalk.gray('   • Max position: 0.01 ETH'));
  console.log(chalk.gray('   • Consensus: 0.02 ETH (3+ wallets)'));
  console.log(chalk.gray('   • Stop loss: 8%'));
  console.log(chalk.gray('   • Copy delay: 2 blocks\n'));
  
  // Add traders
  console.log(chalk.cyan('👥 Loading Fundamental Traders:\n'));
  
  for (let i = 0; i < traders.length; i++) {
    const t = traders[i];
    await copyTrader.addWallet(t.address, t.confidence);
    console.log(
      chalk.gray(`   ${i + 1}. `) +
      chalk.white(`${t.address.substring(0, 8)}...`) +
      chalk.gray(` | ${t.tokens} tokens | ${t.rate.toFixed(1)}/hr | ${(t.confidence * 100).toFixed(0)}% conf`)
    );
  }
  
  console.log(chalk.green('\n✅ Traders loaded successfully\n'));
  
  // Start monitoring
  console.log(chalk.cyan('🔍 Starting Trade Monitoring...\n'));
  await copyTrader.startMonitoring();
  
  let reportCount = 0;
  const startTime = Date.now();
  
  // Status updates every 5 minutes
  setInterval(async () => {
    reportCount++;
    const currentBalance = await walletManager.getBalance();
    const profit = currentBalance - startBalance;
    const profitEth = Number(formatEther(profit));
    const profitPercent = (Number(profit) * 100) / Number(startBalance);
    const runtime = ((Date.now() - startTime) / 3600000).toFixed(1);
    
    console.log(chalk.gray(`\n[${new Date().toLocaleTimeString()}] `) + chalk.cyan(`Status Update #${reportCount}`));
    console.log(chalk.gray('─────────────────────────────────'));
    console.log(`Balance: ${formatEther(currentBalance)} ETH`);
    console.log(`P&L: ${profit >= 0n ? '+' : ''}${profitEth.toFixed(5)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    console.log(`Runtime: ${runtime} hours`);
    
    const pending = copyTrader.getPendingTrades();
    if (pending.length > 0) {
      console.log(chalk.yellow(`Pending trades: ${pending.length}`));
    }
    
    // Check for consensus
    const tokenMap = new Map();
    pending.forEach(t => {
      const key = `${t.action}-${t.token.substring(0, 10)}`;
      tokenMap.set(key, (tokenMap.get(key) || 0) + 1);
    });
    
    for (const [key, count] of tokenMap.entries()) {
      if (count >= 3) {
        console.log(chalk.green(`🎯 Consensus: ${count} wallets ${key}`));
      }
    }
  }, 300000); // 5 minutes
  
  // Hourly report
  setInterval(async () => {
    const currentBalance = await walletManager.getBalance();
    const profit = currentBalance - startBalance;
    const profitPercent = (Number(profit) * 100) / Number(startBalance);
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════'));
    console.log(chalk.cyan.bold('         📊 HOURLY REPORT'));
    console.log(chalk.cyan.bold('════════════════════════════════════════\n'));
    
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log(`Balance: ${formatEther(currentBalance)} ETH`);
    console.log(`P&L: ${profit >= 0n ? '+' : ''}${formatEther(profit)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    
    const stats = safetyGuardian.getStats();
    if (stats.totalTrades > 0) {
      console.log(`\nTrades: ${stats.totalTrades}`);
      console.log(`Win Rate: ${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%`);
    }
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════\n'));
    
    // Stop loss check
    if (profitPercent < -8) {
      console.log(chalk.red.bold('\n🛑 STOP LOSS TRIGGERED!'));
      await copyTrader.stopMonitoring();
      process.exit(0);
    }
  }, 3600000); // 1 hour
  
  // Shutdown handler
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nShutting down...'));
    await copyTrader.stopMonitoring();
    
    const finalBalance = await walletManager.getBalance();
    const finalProfit = finalBalance - startBalance;
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════'));
    console.log(chalk.cyan.bold('         📊 FINAL REPORT'));
    console.log(chalk.cyan.bold('════════════════════════════════════════\n'));
    
    console.log(`Final Balance: ${formatEther(finalBalance)} ETH`);
    console.log(`Total P&L: ${finalProfit >= 0n ? '+' : ''}${formatEther(finalProfit)} ETH`);
    console.log(`Runtime: ${((Date.now() - startTime) / 3600000).toFixed(1)} hours`);
    
    console.log(chalk.cyan.bold('\n════════════════════════════════════════\n'));
    
    process.exit(0);
  });
  
  console.log(chalk.green('✅ Copy Trading Active\n'));
  console.log(chalk.gray('   • Following 5 fundamental traders'));
  console.log(chalk.gray('   • Monitoring for consensus trades'));
  console.log(chalk.gray('   • Updates every 5 minutes'));
  console.log(chalk.gray('   • Press Ctrl+C to stop\n'));
  
  // Keep running
  await new Promise(() => {});
}

main().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});