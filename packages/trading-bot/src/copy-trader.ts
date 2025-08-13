import { createPublicClient, http, parseAbiItem, Log } from 'viem';
import { mainnet } from 'viem/chains';
import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import { TradeExecutor } from './trade-executor.js';
import { WalletManager } from './wallet-manager.js';
import dotenv from 'dotenv';

dotenv.config();

interface WalletToFollow {
  address: string;
  confidence: number;
  lastSeen: Date;
  totalTrades: number;
  profitRatio: number;
}

interface PendingTrade {
  walletAddress: string;
  token: string;
  action: 'buy' | 'sell';
  amount: bigint;
  blockNumber: bigint;
  confidence: number;
}

export class CopyTrader {
  private publicClient;
  private tradeExecutor: TradeExecutor;
  private walletManager: WalletManager;
  private db: duckdb.Database;
  private followedWallets: Map<string, WalletToFollow> = new Map();
  private pendingTrades: PendingTrade[] = [];
  private isMonitoring = false;
  private copyDelayBlocks: number;
  private minConfidence: number;
  private maxPositionSize: bigint;

  constructor(walletManager: WalletManager, tradeExecutor: TradeExecutor) {
    this.walletManager = walletManager;
    this.tradeExecutor = tradeExecutor;
    
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545')
    });

    const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
                   path.join(os.homedir(), 'eth-index', 'eth.duckdb');
    this.db = new duckdb.Database(dbPath);

    this.copyDelayBlocks = parseInt(process.env.COPY_TRADE_DELAY_BLOCKS || '2');
    this.minConfidence = parseFloat(process.env.MIN_CONFIDENCE_SCORE || '0.7');
    this.maxPositionSize = BigInt(parseFloat(process.env.MAX_POSITION_SIZE_ETH || '1') * 1e18);
  }

  async loadProfitableWallets(minTrades = 10, minProfitRatio = 1.1): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH wallet_metrics AS (
          SELECT 
            wallet,
            COUNT(*) as total_trades,
            COUNT(DISTINCT token) as unique_tokens,
            SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound_count,
            SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound_count
          FROM (
            SELECT "to" as wallet, token, 'in' as direction FROM erc20_transfers
            WHERE LENGTH(value) < 20
            UNION ALL
            SELECT "from" as wallet, token, 'out' as direction FROM erc20_transfers
            WHERE LENGTH(value) < 20
          ) t
          GROUP BY wallet
          HAVING COUNT(*) >= ?
        )
        SELECT 
          wallet,
          total_trades,
          unique_tokens,
          CASE 
            WHEN outbound_count > 0 THEN 
              CAST(inbound_count AS DOUBLE) / outbound_count
            ELSE CAST(inbound_count AS DOUBLE)
          END as profit_ratio
        FROM wallet_metrics
        WHERE (CAST(inbound_count AS DOUBLE) / NULLIF(outbound_count, 0)) >= ?
        ORDER BY profit_ratio DESC, total_trades DESC
        LIMIT 20
      `;

      this.db.all(query, [minTrades, minProfitRatio], (err, results: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        this.followedWallets.clear();
        
        results.forEach(row => {
          this.followedWallets.set(row.wallet.toLowerCase(), {
            address: row.wallet.toLowerCase(),
            confidence: Math.min(row.profit_ratio / 2, 1),
            lastSeen: new Date(),
            totalTrades: row.total_trades,
            profitRatio: row.profit_ratio
          });
        });

        console.log(`📊 Loaded ${this.followedWallets.size} profitable wallets to follow`);
        resolve();
      });
    });
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log('👁️ Starting copy trade monitoring...');
    
    const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
    
    const unwatch = this.publicClient.watchEvent({
      event: transferEvent,
      onLogs: (logs) => this.processTransferLogs(logs)
    });

    setInterval(() => this.processPendingTrades(), 12000);
  }

  private async processTransferLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      if (!log.args) continue;
      
      const { from, to, value } = log.args as any;
      const fromLower = from?.toLowerCase();
      const toLower = to?.toLowerCase();

      if (this.followedWallets.has(fromLower)) {
        const wallet = this.followedWallets.get(fromLower)!;
        console.log(`🔴 Detected SELL from followed wallet ${fromLower.substring(0, 10)}...`);
        
        this.pendingTrades.push({
          walletAddress: fromLower,
          token: log.address,
          action: 'sell',
          amount: value,
          blockNumber: log.blockNumber!,
          confidence: wallet.confidence
        });
        
        wallet.lastSeen = new Date();
      }

      if (this.followedWallets.has(toLower)) {
        const wallet = this.followedWallets.get(toLower)!;
        console.log(`🟢 Detected BUY by followed wallet ${toLower.substring(0, 10)}...`);
        
        this.pendingTrades.push({
          walletAddress: toLower,
          token: log.address,
          action: 'buy',
          amount: value,
          blockNumber: log.blockNumber!,
          confidence: wallet.confidence
        });
        
        wallet.lastSeen = new Date();
      }
    }
  }

  private async processPendingTrades(): Promise<void> {
    const currentBlock = await this.publicClient.getBlockNumber();
    
    const readyTrades = this.pendingTrades.filter(
      trade => currentBlock >= trade.blockNumber + BigInt(this.copyDelayBlocks)
    );

    for (const trade of readyTrades) {
      if (trade.confidence < this.minConfidence) {
        console.log(`⏭️ Skipping trade - confidence ${trade.confidence} below threshold`);
        continue;
      }

      await this.executeCopyTrade(trade);
    }

    this.pendingTrades = this.pendingTrades.filter(
      trade => currentBlock < trade.blockNumber + BigInt(this.copyDelayBlocks)
    );
  }

  private async executeCopyTrade(trade: PendingTrade): Promise<void> {
    const balance = await this.walletManager.getBalance();
    const positionSize = (this.maxPositionSize * BigInt(Math.floor(trade.confidence * 100))) / 100n;
    const tradeAmount = balance < positionSize ? balance : positionSize;

    if (tradeAmount < BigInt(0.01 * 1e18)) {
      console.log('⚠️ Insufficient balance for copy trade');
      return;
    }

    console.log(`📋 Executing copy trade:`);
    console.log(`  • Action: ${trade.action.toUpperCase()}`);
    console.log(`  • Token: ${trade.token}`);
    console.log(`  • Confidence: ${(trade.confidence * 100).toFixed(1)}%`);
    console.log(`  • Amount: ${(Number(tradeAmount) / 1e18).toFixed(4)} ETH`);

    try {
      if (trade.action === 'buy') {
        await this.tradeExecutor.swapExactETHForTokens(
          trade.token as `0x${string}`,
          (Number(tradeAmount) / 1e18).toString()
        );
      } else {
        const tokenBalance = await this.tradeExecutor.getTokenBalance(trade.token as `0x${string}`);
        if (tokenBalance > 0n) {
          await this.tradeExecutor.swapExactTokensForETH(
            trade.token as `0x${string}`,
            tokenBalance
          );
        }
      }
      
      console.log('✅ Copy trade executed successfully');
    } catch (error) {
      console.error('❌ Copy trade failed:', error);
    }
  }

  async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    console.log('🛑 Stopped copy trade monitoring');
  }

  getFollowedWallets(): WalletToFollow[] {
    return Array.from(this.followedWallets.values());
  }

  async addWallet(address: string, confidence = 0.8): Promise<void> {
    this.followedWallets.set(address.toLowerCase(), {
      address: address.toLowerCase(),
      confidence,
      lastSeen: new Date(),
      totalTrades: 0,
      profitRatio: 1
    });
    console.log(`➕ Added wallet ${address} to follow list`);
  }

  removeWallet(address: string): void {
    this.followedWallets.delete(address.toLowerCase());
    console.log(`➖ Removed wallet ${address} from follow list`);
  }

  getPendingTrades(): PendingTrade[] {
    return this.pendingTrades;
  }
}