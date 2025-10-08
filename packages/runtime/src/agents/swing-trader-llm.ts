#!/usr/bin/env tsx
/**
 * LLM Swing Trader Agent
 *
 * This agent gives Llama autonomous swing trading capability.
 * It continuously monitors markets and executes trades based on LLM decisions.
 */

import { orchestrate } from '../orchestrator.js';
import * as dotenv from 'dotenv';

dotenv.config();

// Trading configuration
const SCAN_INTERVAL = 60000; // Check every minute
const MAX_CONCURRENT_POSITIONS = 3;
const POSITION_SIZE_ETH = 0.001; // Start small!

// Popular ERC-20 tokens to monitor
const TOKENS_TO_WATCH = [
  '0x6982508145454Ce325dDbE47a25d4ec3d2311933', // PEPE
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // SHIB
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (stable for comparison)
  '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
];

// System prompts for different trading personalities
const TRADING_STRATEGIES = {
  conservative: `You are a conservative swing trader. Only enter positions with:
    - Clear support/resistance levels
    - At least 3 confirming indicators
    - Risk/reward ratio of at least 1:2
    - Maximum drawdown tolerance of 10%`,

  aggressive: `You are an aggressive swing trader looking for quick profits:
    - Enter on momentum breakouts
    - Target 20-30% gains within hours
    - Accept up to 15% drawdown
    - Focus on high volatility tokens`,

  balanced: `You are a balanced swing trader:
    - Mix of momentum and value plays
    - Hold positions 1-24 hours
    - Target 15-20% gains
    - Stop loss at -10%`
};

class SwingTraderAgent {
  private isRunning = false;
  private currentStrategy = 'balanced';
  private sessionProfit = 0;
  private tradesExecuted = 0;

  /**
   * Start the autonomous trading agent
   */
  async start(strategy: keyof typeof TRADING_STRATEGIES = 'balanced') {
    this.currentStrategy = strategy;
    this.isRunning = true;

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     🤖 LLM SWING TRADER AGENT                                ║
║                                                                ║
║     Strategy: ${strategy.toUpperCase().padEnd(20)}                       ║
║     Position Size: ${POSITION_SIZE_ETH} ETH                           ║
║     Max Positions: ${MAX_CONCURRENT_POSITIONS}                              ║
║     Scan Interval: ${SCAN_INTERVAL/1000}s                           ║
║                                                                ║
║     ⚠️  TRADING AUTONOMOUSLY - MONITOR CLOSELY                ║
╚════════════════════════════════════════════════════════════════╝
    `);

    // Get initial status
    await this.checkStatus();

    // Main trading loop
    while (this.isRunning) {
      try {
        await this.tradingCycle();
        await this.sleep(SCAN_INTERVAL);
      } catch (error) {
        console.error('❌ Trading cycle error:', error);
        await this.sleep(SCAN_INTERVAL * 2); // Back off on error
      }
    }
  }

  /**
   * Single trading cycle
   */
  private async tradingCycle() {
    console.log(`\n━━━━━━━━━━━ Trading Cycle ${++this.tradesExecuted} ━━━━━━━━━━━`);

    // Step 1: Check current positions
    const positionsQuery = `Check my current trading positions and statistics`;
    const positionsInfo = await orchestrate(positionsQuery, 3);
    console.log('📊 Current Status:', positionsInfo);

    // Step 2: Scan for opportunities
    for (const token of TOKENS_TO_WATCH) {
      const analysisPrompt = `
        ${TRADING_STRATEGIES[this.currentStrategy]}

        Analyze token ${token} for swing trading opportunity.
        Current positions: Check with trade.positions()

        Decision criteria:
        1. Get current price and recent price action
        2. Check if good entry point
        3. Evaluate risk/reward
        4. Make decision: BUY, SELL, or HOLD

        If BUY, specify exact amount in ETH (max ${POSITION_SIZE_ETH}).
        If SELL and we have position, specify amount to sell.
      `;

      console.log(`\n🔍 Analyzing ${token.slice(0, 10)}...`);
      const decision = await orchestrate(analysisPrompt, 5);
      console.log('💭 LLM Decision:', decision);

      // Parse and execute decision
      if (decision.toLowerCase().includes('buy')) {
        await this.executeBuy(token);
      } else if (decision.toLowerCase().includes('sell')) {
        await this.executeSell(token);
      }

      // Don't overwhelm the system
      await this.sleep(5000);
    }

    // Step 3: Review existing positions for exit signals
    const reviewPrompt = `
      Review all open positions for exit signals.
      For each position, decide if we should:
      - Take profit (if up >15%)
      - Stop loss (if down >10%)
      - Hold for now

      Use trade.positions() to see current positions.
      Use trade.stats() to see overall performance.
    `;

    const reviewDecision = await orchestrate(reviewPrompt, 5);
    console.log('📈 Position Review:', reviewDecision);
  }

  /**
   * Execute buy order through LLM
   */
  private async executeBuy(token: string) {
    const buyPrompt = `
      Execute a buy order for token ${token}.
      Amount: ${POSITION_SIZE_ETH} ETH

      Steps:
      1. First analyze the token with trade.analyze("${token}")
      2. If recommendation is BUY, execute trade.buy("${token}", ${POSITION_SIZE_ETH})
      3. Report the result
    `;

    const result = await orchestrate(buyPrompt, 3);
    console.log('💰 Buy Result:', result);
  }

  /**
   * Execute sell order through LLM
   */
  private async executeSell(token: string) {
    const sellPrompt = `
      Execute a sell order for token ${token}.

      Steps:
      1. Check if we have a position in this token using trade.positions()
      2. If we have a position, sell it with trade.sell("${token}", amount)
      3. Report the profit/loss
    `;

    const result = await orchestrate(sellPrompt, 3);
    console.log('💸 Sell Result:', result);
  }

  /**
   * Check trading status
   */
  private async checkStatus() {
    const statusQuery = `
      Get current trading status:
      1. Check wallet balance with trade.balance()
      2. Check open positions with trade.positions()
      3. Check statistics with trade.stats()

      Summarize the current state.
    `;

    const status = await orchestrate(statusQuery, 3);
    console.log('\n📊 Trading Status:', status);
  }

  /**
   * Emergency stop
   */
  async stop() {
    console.log('\n🛑 Stopping trader...');
    this.isRunning = false;

    // Close all positions
    const closePrompt = `
      EMERGENCY: Close all positions immediately.
      Use trade.emergency() to close everything.
      Report what was closed.
    `;

    const result = await orchestrate(closePrompt, 2);
    console.log('🚨 Emergency Stop Result:', result);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
async function main() {
  const trader = new SwingTraderAgent();

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await trader.stop();
    process.exit(0);
  });

  // Get strategy from command line or environment
  const strategy = (process.argv[2] || process.env.TRADING_STRATEGY || 'balanced') as keyof typeof TRADING_STRATEGIES;

  // Confirm before starting
  console.log(`
⚠️  WARNING: This will give Llama autonomous trading capability!

Settings:
- Strategy: ${strategy}
- Position Size: ${POSITION_SIZE_ETH} ETH per trade
- Max Positions: ${MAX_CONCURRENT_POSITIONS}
- Mode: ${process.env.EXECUTE_REAL_TRADES === 'true' ? 'LIVE TRADING' : 'SIMULATION'}

Press Ctrl+C to cancel, or wait 5 seconds to continue...
  `);

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Start trading
  await trader.start(strategy);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default SwingTraderAgent;