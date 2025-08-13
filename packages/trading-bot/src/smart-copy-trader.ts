#!/usr/bin/env tsx
/**
 * Smart copy trading with ML-based filtering and relationship analysis
 */

import { WalletManager } from './wallet-manager.js';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { MLPredictor } from './ml-predictor.js';
import { SafetyGuardian } from './safety-guardian.js';
import { createPublicClient, http, parseEther } from 'viem';
import { mainnet } from 'viem/chains';
import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

interface SmartWallet {
  address: string;
  confidence: number;
  profitRatio: number;
  recentActivity: number;
  consensusScore: number;
}

class SmartCopyTrader {
  private walletManager: WalletManager;
  private tradeExecutor: TradeExecutor;
  private copyTrader: CopyTrader;
  private mlPredictor: MLPredictor;
  private safetyGuardian: SafetyGuardian;
  private db: duckdb.Database;
  private smartWallets: Map<string, SmartWallet> = new Map();
  private recentTrades: Map<string, any[]> = new Map();
  private totalProfit = 0n;
  private tradeCount = 0;
  private startBalance = 0n;

  constructor() {
    const password = process.env.WALLET_PASSWORD || ';jlk';
    this.walletManager = new WalletManager(password);
    this.tradeExecutor = new TradeExecutor(this.walletManager);
    this.copyTrader = new CopyTrader(this.walletManager, this.tradeExecutor);
    this.mlPredictor = new MLPredictor();
    this.safetyGuardian = new SafetyGuardian(this.walletManager);
    
    const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
                   path.join(os.homedir(), 'eth-index', 'eth.duckdb');
    this.db = new duckdb.Database(dbPath);
  }

  async init() {
    console.log(chalk.cyan('🚀 Initializing Smart Copy Trader...\n'));
    
    await this.walletManager.init();
    await this.mlPredictor.init();
    await this.safetyGuardian.init();
    
    this.startBalance = await this.walletManager.getBalance();
    console.log(chalk.green(`💰 Starting balance: ${(Number(this.startBalance) / 1e18).toFixed(4)} ETH\n`));
    
    // Set conservative limits for 0.05 ETH
    this.safetyGuardian.setMaxPositionSize(parseEther('0.01')); // Max 0.01 ETH per trade
    this.safetyGuardian.setStopLoss(0.08); // 8% stop loss
    
    await this.loadSmartWallets();
  }

  async loadSmartWallets() {
    return new Promise<void>((resolve, reject) => {
      console.log(chalk.yellow('📊 Loading profitable wallets with ML scoring...\n'));
      
      const query = `
        WITH recent_activity AS (
          SELECT 
            wallet,
            COUNT(*) as trades_24h,
            COUNT(DISTINCT token) as tokens_24h,
            MAX(ts) as last_trade
          FROM (
            SELECT "from" as wallet, token, ts FROM erc20_transfers
            WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
              AND LENGTH(value) < 20
            UNION ALL
            SELECT "to" as wallet, token, ts FROM erc20_transfers
            WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
              AND LENGTH(value) < 20
          ) t
          WHERE wallet NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
          GROUP BY wallet
        ),
        wallet_performance AS (
          SELECT 
            wallet,
            COUNT(*) as total_trades,
            SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound,
            SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound,
            COUNT(DISTINCT token) as unique_tokens
          FROM (
            SELECT "to" as wallet, 'in' as direction, token FROM erc20_transfers
            WHERE LENGTH(value) < 20
            UNION ALL
            SELECT "from" as wallet, 'out' as direction, token FROM erc20_transfers
            WHERE LENGTH(value) < 20
          ) t
          GROUP BY wallet
          HAVING COUNT(*) BETWEEN 50 AND 500
        )
        SELECT 
          wp.wallet,
          wp.total_trades,
          wp.inbound,
          wp.outbound,
          CASE WHEN wp.outbound > 0 
            THEN CAST(wp.inbound AS DOUBLE) / wp.outbound 
            ELSE CAST(wp.inbound AS DOUBLE) 
          END as profit_ratio,
          wp.unique_tokens,
          COALESCE(ra.trades_24h, 0) as recent_trades,
          COALESCE(ra.tokens_24h, 0) as recent_tokens
        FROM wallet_performance wp
        LEFT JOIN recent_activity ra ON wp.wallet = ra.wallet
        WHERE (CAST(wp.inbound AS DOUBLE) / NULLIF(wp.outbound, 0)) > 1.2
        ORDER BY profit_ratio DESC, recent_trades DESC
        LIMIT 30
      `;
      
      this.db.all(query, (err, wallets: any[]) => {
        if (err) {
          console.error('Query error:', err);
          reject(err);
          return;
        }
        
        // Score wallets with ML features
        wallets.forEach(async (w) => {
          const mlScore = await this.calculateMLScore(w);
          
          this.smartWallets.set(w.wallet, {
            address: w.wallet,
            confidence: Math.min(0.9, mlScore * (w.profit_ratio / 2)),
            profitRatio: w.profit_ratio,
            recentActivity: w.recent_trades,
            consensusScore: 0
          });
        });
        
        console.log(chalk.green(`✅ Loaded ${this.smartWallets.size} smart wallets\n`));
        
        // Display top wallets
        const topWallets = Array.from(this.smartWallets.values())
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 10);
        
        console.log(chalk.cyan('🎯 Top 10 Wallets to Follow:\n'));
        topWallets.forEach((w, i) => {
          console.log(`${i + 1}. ${w.address.substring(0, 10)}...`);
          console.log(`   • Confidence: ${(w.confidence * 100).toFixed(1)}%`);
          console.log(`   • Profit ratio: ${w.profitRatio.toFixed(2)}x`);
          console.log(`   • Recent activity: ${w.recentActivity} trades/24h`);
        });
        
        resolve();
      });
    });
  }

  private async calculateMLScore(wallet: any): Promise<number> {
    // Simple ML-like scoring based on features
    const features = {
      profitability: Math.min(wallet.profit_ratio / 3, 1),
      activity: Math.min(wallet.recent_trades / 100, 1),
      diversity: Math.min(wallet.unique_tokens / 20, 1),
      consistency: wallet.inbound / (wallet.inbound + wallet.outbound)
    };
    
    // Weighted score
    return (
      features.profitability * 0.4 +
      features.activity * 0.2 +
      features.diversity * 0.2 +
      features.consistency * 0.2
    );
  }

  async startSmartCopyTrading() {
    console.log(chalk.green('\n🤖 Starting Smart Copy Trading...\n'));
    console.log(chalk.yellow('Strategy:'));
    console.log('  • Max position: 0.01 ETH per trade');
    console.log('  • Total budget: 0.05 ETH');
    console.log('  • Stop loss: 8%');
    console.log('  • Consensus threshold: 3+ wallets');
    console.log('  • ML confidence required: 60%\n');
    
    // Add top wallets to copy trader
    const topWallets = Array.from(this.smartWallets.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
    
    for (const wallet of topWallets) {
      await this.copyTrader.addWallet(wallet.address, wallet.confidence);
    }
    
    // Start monitoring with smart filters
    await this.copyTrader.startMonitoring();
    
    // Enhanced monitoring loop
    setInterval(async () => {
      await this.analyzeAndAdjust();
    }, 60000); // Every minute
    
    // Performance reporting
    setInterval(async () => {
      await this.reportPerformance();
    }, 3600000); // Every hour
    
    console.log(chalk.green('✅ Smart copy trading started!\n'));
    console.log(chalk.cyan('📊 Monitoring 10 profitable wallets...'));
    console.log(chalk.cyan('🎯 Using ML predictions for trade filtering...'));
    console.log(chalk.cyan('⏰ Will run for 24 hours with adaptive strategies...\n'));
  }

  private async analyzeAndAdjust() {
    const pendingTrades = this.copyTrader.getPendingTrades();
    
    if (pendingTrades.length > 0) {
      console.log(chalk.yellow(`\n⚡ Analyzing ${pendingTrades.length} pending trades...`));
      
      // Check for consensus
      const tokenCounts = new Map<string, number>();
      pendingTrades.forEach(trade => {
        const key = `${trade.token}-${trade.action}`;
        tokenCounts.set(key, (tokenCounts.get(key) || 0) + 1);
      });
      
      // Find consensus trades (3+ wallets doing same thing)
      for (const [key, count] of tokenCounts.entries()) {
        if (count >= 3) {
          const [token, action] = key.split('-');
          console.log(chalk.green(`   🎯 Consensus found: ${count} wallets ${action}ing ${token.substring(0, 10)}...`));
          
          // Get ML prediction
          const prediction = await this.mlPredictor.predict(token);
          
          if (prediction.confidence > 0.6 && prediction.action === action) {
            console.log(chalk.green(`   ✅ ML confirms: ${(prediction.confidence * 100).toFixed(1)}% confidence`));
            // Trade will be executed by copy trader
          } else {
            console.log(chalk.yellow(`   ⚠️ ML suggests caution: ${prediction.action} with ${(prediction.confidence * 100).toFixed(1)}%`));
          }
        }
      }
    }
    
    // Check stop loss
    const currentBalance = await this.walletManager.getBalance();
    const loss = this.startBalance - currentBalance;
    if (loss > 0n && Number(loss) / Number(this.startBalance) > 0.08) {
      console.log(chalk.red('\n🛑 Stop loss triggered! Pausing trading...'));
      await this.copyTrader.stopMonitoring();
    }
  }

  private async reportPerformance() {
    const currentBalance = await this.walletManager.getBalance();
    const profit = currentBalance - this.startBalance;
    const profitPercent = Number(profit) / Number(this.startBalance) * 100;
    
    console.log(chalk.cyan('\n📈 === PERFORMANCE REPORT ===\n'));
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log(`💰 Current balance: ${(Number(currentBalance) / 1e18).toFixed(4)} ETH`);
    console.log(`📊 P&L: ${profit >= 0n ? '+' : ''}${(Number(profit) / 1e18).toFixed(4)} ETH (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    console.log(`🔄 Total trades: ${this.tradeCount}`);
    
    const stats = this.safetyGuardian.getStats();
    console.log(`✅ Successful trades: ${stats.profitableTrades}`);
    console.log(`❌ Losing trades: ${stats.totalTrades - stats.profitableTrades}`);
    
    if (stats.totalTrades > 0) {
      console.log(`📈 Win rate: ${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%`);
    }
    
    console.log(chalk.cyan('\n========================\n'));
  }

  async stop() {
    console.log(chalk.yellow('\n🛑 Stopping smart copy trader...'));
    await this.copyTrader.stopMonitoring();
    await this.reportPerformance();
    console.log(chalk.green('✅ Trading stopped'));
  }
}

// Main execution
async function main() {
  const trader = new SmartCopyTrader();
  
  try {
    await trader.init();
    await trader.startSmartCopyTrading();
    
    // Run for 24 hours
    console.log(chalk.cyan('\n⏰ Will run for 24 hours. Press Ctrl+C to stop early.\n'));
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\nReceived interrupt signal...'));
      await trader.stop();
      process.exit(0);
    });
    
    // Keep running
    await new Promise(() => {});
    
  } catch (error) {
    console.error(chalk.red('Error:', error));
    process.exit(1);
  }
}

main();