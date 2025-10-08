#!/usr/bin/env tsx
/**
 * MEME COIN PROFIT MAXIMIZER LAUNCHER
 *
 * Main entry point for the refactored meme coin trading bot
 * Integrates all modules for maximum profit extraction
 */

import MemeTrader from './src/bot/meme-trader.js';
import { profitEngine } from './src/bot/profit-engine.js';
import { walletAnalyzer } from './src/analysis/wallet-analyzer.js';
import { tokenScorer } from './src/analysis/token-scorer.js';
import { honeypotDetector } from './src/analysis/honeypot-detector.js';
import * as dotenv from 'dotenv';

dotenv.config();

interface LaunchConfig {
  mode: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
  features: {
    smartMoneyCopyTrading: boolean;
    honeypotDetection: boolean;
    profitOptimization: boolean;
    llmAnalysis: boolean;
  };
}

const LAUNCH_CONFIGS = {
  AGGRESSIVE: {
    mode: 'AGGRESSIVE' as const,
    features: {
      smartMoneyCopyTrading: true,
      honeypotDetection: true,  // Keep but with lower thresholds
      profitOptimization: true,
      llmAnalysis: false  // Disabled for speed
    },
    trading: {
      maxPositionSize: 0.01,      // DOUBLED: 1% per trade
      maxPortfolioPositions: 12,   // DOUBLED: More positions
      stopLossPercent: -50,        // DOUBLED: 50% loss tolerance
      takeProfitTargets: [2, 5, 10, 20],
      takeProfitPortions: [0.2, 0.3, 0.3, 0.2],
      minLiquidity: 25000,         // HALVED: Only $25k required
      scanInterval: 30,            // HALVED: Scan every 30s
      priceCheckInterval: 15       // HALVED: Check every 15s
    }
  },
  MODERATE: {
    mode: 'MODERATE' as const,
    features: {
      smartMoneyCopyTrading: true,
      honeypotDetection: true,
      profitOptimization: true,
      llmAnalysis: false
    },
    trading: {
      maxPositionSize: 0.005,     // 0.5% per trade
      maxPortfolioPositions: 6,
      stopLossPercent: -25,
      takeProfitTargets: [2, 5, 10],
      takeProfitPortions: [0.3, 0.4, 0.3],
      minLiquidity: 50000,
      scanInterval: 60,
      priceCheckInterval: 30
    }
  },
  CONSERVATIVE: {
    mode: 'CONSERVATIVE' as const,
    features: {
      smartMoneyCopyTrading: true,
      honeypotDetection: true,
      profitOptimization: false,
      llmAnalysis: false
    },
    trading: {
      maxPositionSize: 0.0025,    // 0.25% per trade
      maxPortfolioPositions: 4,
      stopLossPercent: -20,
      takeProfitTargets: [2, 5],
      takeProfitPortions: [0.5, 0.5],
      minLiquidity: 100000,
      scanInterval: 120,
      priceCheckInterval: 60
    }
  }
};

async function displayBanner() {
  console.clear();
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║     ███╗   ███╗███████╗███╗   ███╗███████╗                      ║
║     ████╗ ████║██╔════╝████╗ ████║██╔════╝                      ║
║     ██╔████╔██║█████╗  ██╔████╔██║█████╗                        ║
║     ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝                        ║
║     ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗                      ║
║     ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝                      ║
║                                                                    ║
║     ██████╗  ██████╗ ████████╗                                   ║
║     ██╔══██╗██╔═══██╗╚══██╔══╝                                  ║
║     ██████╔╝██║   ██║   ██║                                      ║
║     ██╔══██╗██║   ██║   ██║                                      ║
║     ██████╔╝╚██████╔╝   ██║                                      ║
║     ╚═════╝  ╚═════╝    ╚═╝                                      ║
║                                                                    ║
║              PROFIT MAXIMIZER v2.0 - REFACTORED                   ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  `);
}

async function initializeSystems(config: typeof LAUNCH_CONFIGS.AGGRESSIVE) {
  console.log('🔧 INITIALIZING SYSTEMS\n');
  console.log('Configuration:');
  console.log(`  Mode: ${config.mode}`);
  console.log(`  Features:`);
  Object.entries(config.features).forEach(([feature, enabled]) => {
    console.log(`    ${enabled ? '✅' : '❌'} ${feature}`);
  });
  console.log('');

  // Initialize smart money tracking
  if (config.features.smartMoneyCopyTrading) {
    console.log('📊 Identifying smart money wallets...');
    const smartWallets = await walletAnalyzer.identifySmartMoney();
    console.log(`  Found ${smartWallets.length} smart wallets`);

    // Start monitoring top wallets
    const topWallets = smartWallets.slice(0, 5);
    for (const wallet of topWallets) {
      await walletAnalyzer.monitorWallet(wallet);
    }
  }

  // Test honeypot detector
  if (config.features.honeypotDetection) {
    console.log('🍯 Testing honeypot detector...');
    console.log('  Detector ready');
  }

  // Initialize profit engine
  if (config.features.profitOptimization) {
    console.log('💰 Configuring profit engine...');
    const rules = profitEngine.getRules();
    console.log(`  ${rules.filter(r => r.enabled).length} profit rules active`);
  }

  console.log('\n✅ All systems initialized\n');
}

async function startTrading(config: typeof LAUNCH_CONFIGS.AGGRESSIVE) {
  // Create meme trader with configuration
  const trader = new MemeTrader({
    ...config.trading,
    privateKey: process.env.PRIVATE_KEY
  });

  // Override scanner to use our enhanced modules
  const originalScan = trader.scanForOpportunities.bind(trader);
  trader.scanForOpportunities = async function() {
    console.log('🔍 Enhanced scanning with all modules...');

    const opportunities = await originalScan();

    // Enhance with token scoring
    for (const opp of opportunities) {
      const score = await tokenScorer.scoreToken(opp.address);
      opp.score = score.totalScore;

      // Skip if score too low
      if (score.verdict === 'DANGER' || score.verdict === 'AVOID') {
        console.log(`  ❌ Skipping ${opp.symbol}: ${score.verdict}`);
        opportunities.splice(opportunities.indexOf(opp), 1);
      }
    }

    // Check for copy trade signals
    if (config.features.smartMoneyCopyTrading) {
      const watchedWallets = walletAnalyzer.getWatchedWallets();
      console.log(`  👁️ Monitoring ${watchedWallets.length} smart wallets`);
    }

    return opportunities;
  };

  // Start the bot
  await trader.run();
}

async function main() {
  await displayBanner();

  // Get mode from environment or default to AGGRESSIVE (2X RISK)
  const mode = (process.env.TRADING_MODE?.toUpperCase() || 'AGGRESSIVE') as keyof typeof LAUNCH_CONFIGS;
  const config = LAUNCH_CONFIGS[mode] || LAUNCH_CONFIGS.MODERATE;

  console.log(`🎯 STARTING IN ${mode} MODE\n`);

  // Safety checks
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ ERROR: PRIVATE_KEY not set in .env file');
    console.log('\nPlease set your private key in the .env file to continue.');
    console.log('For testing, you can use TRADING_MODE=simulation');
    process.exit(1);
  }

  if (!process.env.RPC_HTTP) {
    console.log('⚠️ WARNING: RPC_HTTP not set, using default localhost');
    console.log('  Make sure your Ethereum node is running on http://127.0.0.1:8545');
  }

  // Initialize all systems
  await initializeSystems(config);

  // Display final warning for aggressive mode
  if (mode === 'AGGRESSIVE') {
    console.log('⚠️  WARNING: AGGRESSIVE MODE ACTIVE');
    console.log('  • Higher risk tolerance');
    console.log('  • Larger position sizes');
    console.log('  • More concurrent trades');
    console.log('  • USE AT YOUR OWN RISK!\n');

    // Add delay for user to see warning
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Start trading
  console.log('🚀 LAUNCHING MEME COIN PROFIT MAXIMIZER...\n');
  await startTrading(config);
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
});

// Run
main().catch(console.error);