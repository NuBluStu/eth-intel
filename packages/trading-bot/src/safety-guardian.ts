import { formatEther } from 'viem';
import { WalletManager } from './wallet-manager.js';
import dotenv from 'dotenv';

dotenv.config();

interface TradeRecord {
  timestamp: Date;
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
  pnl?: bigint;
}

interface SafetyLimits {
  maxPositionSize: bigint;
  maxGasPrice: bigint;
  stopLossPercent: number;
  maxDailyTrades: number;
  maxSlippage: number;
  blacklistedTokens: Set<string>;
}

interface TradingStats {
  totalTrades: number;
  profitableTrades: number;
  totalPnL: bigint;
  maxDrawdown: bigint;
  currentDrawdown: bigint;
  dailyTrades: number;
  lastTradeTime?: Date;
  stopLossPercent: number;
  maxPosition: bigint;
  maxGasPrice: bigint;
}

export class SafetyGuardian {
  private walletManager: WalletManager;
  private limits: SafetyLimits;
  private tradeHistory: TradeRecord[] = [];
  private initialBalance: bigint = 0n;
  private peakBalance: bigint = 0n;
  private isEmergencyStop = false;

  constructor(walletManager: WalletManager) {
    this.walletManager = walletManager;
    
    this.limits = {
      maxPositionSize: BigInt(parseFloat(process.env.MAX_POSITION_SIZE_ETH || '1') * 1e18),
      maxGasPrice: BigInt(parseInt(process.env.MAX_GAS_PRICE_GWEI || '100')) * 10n**9n,
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.1'),
      maxDailyTrades: 50,
      maxSlippage: parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.03'),
      blacklistedTokens: new Set()
    };
  }

  async init(): Promise<void> {
    this.initialBalance = await this.walletManager.getBalance();
    this.peakBalance = this.initialBalance;
    console.log(`🛡️ Safety Guardian initialized`);
    console.log(`  • Initial balance: ${formatEther(this.initialBalance)} ETH`);
    console.log(`  • Stop loss: ${(this.limits.stopLossPercent * 100).toFixed(1)}%`);
    console.log(`  • Max position: ${formatEther(this.limits.maxPositionSize)} ETH`);
  }

  checkCommand(command: any): boolean {
    if (this.isEmergencyStop) {
      console.log('🚨 EMERGENCY STOP ACTIVE - All trading halted');
      return false;
    }

    const now = new Date();
    const todaysTrades = this.tradeHistory.filter(t => 
      t.timestamp.toDateString() === now.toDateString()
    ).length;

    if (todaysTrades >= this.limits.maxDailyTrades) {
      console.log(`⚠️ Daily trade limit reached (${this.limits.maxDailyTrades})`);
      return false;
    }

    if (command.action === 'buy' && command.params?.token) {
      if (this.limits.blacklistedTokens.has(command.params.token.toLowerCase())) {
        console.log('🚫 Token is blacklisted');
        return false;
      }
    }

    return true;
  }

  async checkStopLoss(): Promise<boolean> {
    const currentBalance = await this.walletManager.getBalance();
    const loss = this.initialBalance - currentBalance;
    const lossPercent = Number(loss) / Number(this.initialBalance);

    if (lossPercent > this.limits.stopLossPercent) {
      console.log(`🚨 STOP LOSS TRIGGERED!`);
      console.log(`  • Loss: ${formatEther(loss)} ETH (${(lossPercent * 100).toFixed(2)}%)`);
      console.log(`  • Current: ${formatEther(currentBalance)} ETH`);
      console.log(`  • Initial: ${formatEther(this.initialBalance)} ETH`);
      this.triggerEmergencyStop();
      return true;
    }

    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }

    const drawdown = this.peakBalance - currentBalance;
    const drawdownPercent = Number(drawdown) / Number(this.peakBalance);

    if (drawdownPercent > this.limits.stopLossPercent * 0.7) {
      console.log(`⚠️ Warning: Approaching stop loss`);
      console.log(`  • Drawdown: ${(drawdownPercent * 100).toFixed(2)}%`);
    }

    return false;
  }

  async recordTrade(trade: any): Promise<void> {
    const record: TradeRecord = {
      timestamp: new Date(),
      txHash: trade.txHash,
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amountIn: trade.amountIn,
      amountOut: trade.amountOut,
      gasUsed: trade.gasUsed
    };

    this.tradeHistory.push(record);
    
    const gasCost = trade.gasUsed * BigInt(50) * 10n**9n;
    
    if (trade.tokenIn === '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') {
      record.pnl = -gasCost;
    } else if (trade.tokenOut === '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') {
      record.pnl = trade.amountOut - gasCost;
    }

    await this.checkStopLoss();
    
    if (record.pnl && record.pnl < 0n) {
      const consecutiveLosses = this.getConsecutiveLosses();
      if (consecutiveLosses >= 5) {
        console.log(`⚠️ 5 consecutive losses - consider stopping`);
      }
    }
  }

  private getConsecutiveLosses(): number {
    let count = 0;
    for (let i = this.tradeHistory.length - 1; i >= 0; i--) {
      const trade = this.tradeHistory[i];
      if (trade.pnl && trade.pnl < 0n) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  triggerEmergencyStop(): void {
    this.isEmergencyStop = true;
    console.log('🚨🚨🚨 EMERGENCY STOP ACTIVATED 🚨🚨🚨');
    console.log('All trading has been halted');
    console.log('Manual intervention required to resume');
  }

  resumeTrading(): void {
    this.isEmergencyStop = false;
    console.log('✅ Trading resumed');
  }

  blacklistToken(token: string): void {
    this.limits.blacklistedTokens.add(token.toLowerCase());
    console.log(`🚫 Blacklisted token: ${token}`);
  }

  whitelistToken(token: string): void {
    this.limits.blacklistedTokens.delete(token.toLowerCase());
    console.log(`✅ Whitelisted token: ${token}`);
  }

  setStopLoss(percent: number): void {
    this.limits.stopLossPercent = percent;
  }

  setMaxPositionSize(size: bigint): void {
    this.limits.maxPositionSize = size;
  }

  setMaxGasPrice(price: bigint): void {
    this.limits.maxGasPrice = price;
  }

  getStats(): TradingStats {
    const profitableTrades = this.tradeHistory.filter(t => t.pnl && t.pnl > 0n).length;
    const totalPnL = this.tradeHistory.reduce((sum, t) => sum + (t.pnl || 0n), 0n);
    
    const now = new Date();
    const dailyTrades = this.tradeHistory.filter(t => 
      t.timestamp.toDateString() === now.toDateString()
    ).length;

    return {
      totalTrades: this.tradeHistory.length,
      profitableTrades,
      totalPnL,
      maxDrawdown: this.peakBalance - this.initialBalance,
      currentDrawdown: this.peakBalance - totalPnL,
      dailyTrades,
      lastTradeTime: this.tradeHistory[this.tradeHistory.length - 1]?.timestamp,
      stopLossPercent: this.limits.stopLossPercent,
      maxPosition: this.limits.maxPositionSize,
      maxGasPrice: this.limits.maxGasPrice
    };
  }

  async validateTradeSize(amount: bigint): Promise<boolean> {
    if (amount > this.limits.maxPositionSize) {
      console.log(`⚠️ Trade size ${formatEther(amount)} ETH exceeds max ${formatEther(this.limits.maxPositionSize)} ETH`);
      return false;
    }

    const balance = await this.walletManager.getBalance();
    if (amount > balance * 50n / 100n) {
      console.log(`⚠️ Trade size exceeds 50% of balance`);
      return false;
    }

    return true;
  }

  getTradeHistory(limit = 10): TradeRecord[] {
    return this.tradeHistory.slice(-limit);
  }

  exportHistory(): string {
    return JSON.stringify(this.tradeHistory, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2);
  }
}