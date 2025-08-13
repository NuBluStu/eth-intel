import OpenAI from 'openai';
import { z } from 'zod';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { MLPredictor } from './ml-predictor.js';
import { WalletManager } from './wallet-manager.js';
import { SafetyGuardian } from './safety-guardian.js';
import dotenv from 'dotenv';

dotenv.config();

const CommandSchema = z.object({
  action: z.enum(['buy', 'sell', 'copy_trade', 'stop_copy', 'analyze', 'set_limit', 'status', 'balance']),
  params: z.record(z.any()).optional()
});

type Command = z.infer<typeof CommandSchema>;

export class CommandInterface {
  private client: OpenAI;
  private tradeExecutor: TradeExecutor;
  private copyTrader: CopyTrader;
  private mlPredictor: MLPredictor;
  private walletManager: WalletManager;
  private safetyGuardian: SafetyGuardian;

  constructor(
    walletManager: WalletManager,
    tradeExecutor: TradeExecutor,
    copyTrader: CopyTrader,
    mlPredictor: MLPredictor,
    safetyGuardian: SafetyGuardian
  ) {
    this.walletManager = walletManager;
    this.tradeExecutor = tradeExecutor;
    this.copyTrader = copyTrader;
    this.mlPredictor = mlPredictor;
    this.safetyGuardian = safetyGuardian;

    this.client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1',
      apiKey: 'not-needed',
    });
  }

  async processNaturalLanguage(input: string): Promise<string> {
    const systemPrompt = `You are a trading bot command interpreter. Convert natural language to commands.
    
Available commands:
- buy: Buy a token with ETH. Params: token (address), amount (ETH amount)
- sell: Sell a token for ETH. Params: token (address), amount (optional, sells all if not specified)
- copy_trade: Start copying trades from wallets. Params: wallets (array of addresses), confidence (0-1)
- stop_copy: Stop copying specific wallet or all. Params: wallet (optional address)
- analyze: Get ML prediction for token. Params: token (address)
- set_limit: Set trading limits. Params: type (stop_loss/position_size/gas), value
- status: Get current trading status
- balance: Check wallet balances

Convert the user's request to a JSON command. Be precise with addresses and amounts.`;

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.LLM_MODEL || 'llama3.1:8b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = response.choices[0].message.content;
      if (!result) throw new Error('No response from LLM');

      const command = CommandSchema.parse(JSON.parse(result));
      return await this.executeCommand(command);
    } catch (error) {
      console.error('Failed to process command:', error);
      return `❌ Failed to understand command: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async executeCommand(command: Command): Promise<string> {
    if (!this.safetyGuardian.checkCommand(command)) {
      return '🛑 Command blocked by safety guardian';
    }

    switch (command.action) {
      case 'buy':
        return await this.executeBuy(command.params);
      
      case 'sell':
        return await this.executeSell(command.params);
      
      case 'copy_trade':
        return await this.startCopyTrading(command.params);
      
      case 'stop_copy':
        return await this.stopCopyTrading(command.params);
      
      case 'analyze':
        return await this.analyzeToken(command.params);
      
      case 'set_limit':
        return await this.setLimit(command.params);
      
      case 'status':
        return await this.getStatus();
      
      case 'balance':
        return await this.getBalance();
      
      default:
        return '❌ Unknown command';
    }
  }

  private async executeBuy(params: any): Promise<string> {
    const { token, amount } = params;
    
    if (!token || !amount) {
      return '❌ Missing required parameters: token address and amount';
    }

    const prediction = await this.mlPredictor.predict(token);
    
    if (prediction.action === 'sell' && prediction.confidence > 0.7) {
      return `⚠️ ML model suggests SELL (${(prediction.confidence * 100).toFixed(1)}% confidence). Use --force to override.`;
    }

    const result = await this.tradeExecutor.swapExactETHForTokens(token, amount);
    
    if (result) {
      await this.safetyGuardian.recordTrade(result);
      return `✅ Bought ${token}\n  • Amount: ${amount} ETH\n  • TX: ${result.txHash}\n  • ML confidence: ${(prediction.confidence * 100).toFixed(1)}%`;
    }
    
    return '❌ Trade execution failed';
  }

  private async executeSell(params: any): Promise<string> {
    const { token, amount } = params;
    
    if (!token) {
      return '❌ Missing required parameter: token address';
    }

    const balance = await this.tradeExecutor.getTokenBalance(token);
    const sellAmount = amount ? BigInt(amount) : balance;
    
    if (sellAmount > balance) {
      return `❌ Insufficient balance. Have: ${balance}, Want: ${sellAmount}`;
    }

    const result = await this.tradeExecutor.swapExactTokensForETH(token, sellAmount);
    
    if (result) {
      await this.safetyGuardian.recordTrade(result);
      return `✅ Sold ${token}\n  • Amount: ${sellAmount}\n  • Received: ETH\n  • TX: ${result.txHash}`;
    }
    
    return '❌ Trade execution failed';
  }

  private async startCopyTrading(params: any): Promise<string> {
    const { wallets, confidence = 0.7 } = params;
    
    if (!wallets || wallets.length === 0) {
      await this.copyTrader.loadProfitableWallets();
      await this.copyTrader.startMonitoring();
      return '✅ Started copy trading top profitable wallets from database';
    }

    for (const wallet of wallets) {
      await this.copyTrader.addWallet(wallet, confidence);
    }
    
    await this.copyTrader.startMonitoring();
    return `✅ Started copy trading ${wallets.length} wallet(s) with ${(confidence * 100).toFixed(0)}% confidence`;
  }

  private async stopCopyTrading(params: any): Promise<string> {
    const { wallet } = params;
    
    if (wallet) {
      this.copyTrader.removeWallet(wallet);
      return `✅ Stopped copying wallet ${wallet}`;
    }
    
    await this.copyTrader.stopMonitoring();
    return '✅ Stopped all copy trading';
  }

  private async analyzeToken(params: any): Promise<string> {
    const { token } = params;
    
    if (!token) {
      return '❌ Missing required parameter: token address';
    }

    const prediction = await this.mlPredictor.predict(token);
    
    return `📊 ML Analysis for ${token}:
  • Action: ${prediction.action.toUpperCase()}
  • Confidence: ${(prediction.confidence * 100).toFixed(1)}%
  • Expected Return: ${(prediction.predictedReturn * 100).toFixed(2)}%
  • Volume Trend: ${prediction.features.volumeTrend.toFixed(3)}
  • Wallet Activity: ${prediction.features.walletActivity.toFixed(3)}
  • Volatility: ${prediction.features.priceVolatility.toFixed(3)}
  • Liquidity Score: ${prediction.features.liquidityScore.toFixed(3)}`;
  }

  private async setLimit(params: any): Promise<string> {
    const { type, value } = params;
    
    if (!type || value === undefined) {
      return '❌ Missing required parameters: type and value';
    }

    switch (type) {
      case 'stop_loss':
        this.safetyGuardian.setStopLoss(parseFloat(value));
        return `✅ Stop loss set to ${(parseFloat(value) * 100).toFixed(1)}%`;
      
      case 'position_size':
        this.safetyGuardian.setMaxPositionSize(BigInt(parseFloat(value) * 1e18));
        return `✅ Max position size set to ${value} ETH`;
      
      case 'gas':
        this.safetyGuardian.setMaxGasPrice(BigInt(value) * 10n**9n);
        return `✅ Max gas price set to ${value} gwei`;
      
      default:
        return '❌ Unknown limit type. Use: stop_loss, position_size, or gas';
    }
  }

  private async getStatus(): Promise<string> {
    const followedWallets = this.copyTrader.getFollowedWallets();
    const pendingTrades = this.copyTrader.getPendingTrades();
    const stats = this.safetyGuardian.getStats();
    
    return `📊 Trading Bot Status:
  
Copy Trading:
  • Following: ${followedWallets.length} wallets
  • Pending trades: ${pendingTrades.length}
  
Statistics:
  • Total trades: ${stats.totalTrades}
  • Profitable: ${stats.profitableTrades} (${((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1)}%)
  • Total P&L: ${stats.totalPnL > 0 ? '+' : ''}${(Number(stats.totalPnL) / 1e18).toFixed(4)} ETH
  
Safety Limits:
  • Stop loss: ${(stats.stopLossPercent * 100).toFixed(1)}%
  • Max position: ${(Number(stats.maxPosition) / 1e18).toFixed(2)} ETH
  • Max gas: ${Number(stats.maxGasPrice) / 1e9} gwei`;
  }

  private async getBalance(): Promise<string> {
    const ethBalance = await this.walletManager.getBalance();
    const wallets = await this.walletManager.listWallets();
    const activeWallet = wallets.find(w => w.active);
    
    return `💰 Wallet Balance:
  • Address: ${activeWallet?.address || 'None'}
  • ETH: ${(Number(ethBalance) / 1e18).toFixed(4)}
  • Alias: ${activeWallet?.alias || 'N/A'}`;
  }
}