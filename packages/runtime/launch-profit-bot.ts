#!/usr/bin/env tsx
/**
 * PROFIT BOT LAUNCHER
 * Quick launcher for the ETH profit maximization system
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log(`
🚀 ETH PROFIT MAXIMIZATION SYSTEM LAUNCHER
═══════════════════════════════════════════

Prerequisites:
✅ Local Geth node running at 127.0.0.1:8545
✅ Local Lighthouse beacon chain at 127.0.0.1:5052
✅ Llama3.18b model accessible
✅ $1000 worth of ETH ready to deploy

⚠️  WARNING: This is a high-risk, high-reward trading system.
   Only use funds you can afford to lose.

🎯 PROFIT STRATEGIES:
   📈 Smart Money Following (Swing Trading)
   🦾 MEV Extraction & Protection
   ⚖️  Cross-DEX Arbitrage
   🌾 Liquidity Farming Optimization
   🛡️  Advanced Risk Management
`);

async function checkPrerequisites(): Promise<boolean> {
  console.log('\n🔍 Checking prerequisites...\n');

  // Check if Geth is running
  try {
    const response = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const blockNumber = parseInt(data.result, 16);
      console.log(`✅ Geth node: Connected (Block: ${blockNumber.toLocaleString()})`);
    } else {
      console.log('❌ Geth node: Not responding');
      return false;
    }
  } catch (error) {
    console.log('❌ Geth node: Connection failed');
    return false;
  }

  // Check if Lighthouse is running
  try {
    const response = await fetch('http://127.0.0.1:5052/eth/v1/node/health');
    if (response.ok) {
      console.log('✅ Lighthouse beacon: Connected');
    } else {
      console.log('⚠️  Lighthouse beacon: Not responding (MEV features limited)');
    }
  } catch (error) {
    console.log('⚠️  Lighthouse beacon: Connection failed (MEV features limited)');
  }

  // Check if profit bot exists
  if (existsSync('./src/master-profit-bot.ts')) {
    console.log('✅ Profit bot: Ready');
  } else {
    console.log('❌ Profit bot: Not found');
    return false;
  }

  // Check TypeScript runtime
  try {
    execSync('tsx --version', { stdio: 'pipe' });
    console.log('✅ TypeScript runtime: Available');
  } catch (error) {
    console.log('❌ TypeScript runtime: tsx not found');
    console.log('   Install with: npm install -g tsx');
    return false;
  }

  return true;
}

async function showConfiguration(): Promise<boolean> {
  console.log('\n⚙️ CONFIGURATION:\n');
  console.log('💰 Initial Capital: 1.0 ETH (~$2,500)');
  console.log('🎯 Risk Tolerance: AGGRESSIVE');
  console.log('⏱️  Monitoring: Every 30 seconds');
  console.log('⚖️  Rebalancing: Every 6 hours');
  console.log('🛡️  Max Risk/Trade: 15%');
  console.log('🛑 Stop Loss: 25%');

  console.log('\n🔥 ENABLED STRATEGIES:\n');
  console.log('📈 Smart Money Following: ✅ ENABLED');
  console.log('🦾 MEV Extraction: ✅ ENABLED');
  console.log('⚖️  DEX Arbitrage: ✅ ENABLED');
  console.log('🌾 Liquidity Farming: ✅ ENABLED');

  console.log('\n⚠️  DISCLAIMER: This system is for educational/research purposes.');
  console.log('   Trading involves substantial risk of loss.');
  console.log('   Past performance does not guarantee future results.\n');

  // Simple confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Continue with profit bot launch? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main(): Promise<void> {
  try {
    // Check prerequisites
    const prereqsOk = await checkPrerequisites();
    if (!prereqsOk) {
      console.log('\n❌ Prerequisites not met. Please fix the issues above and try again.\n');
      process.exit(1);
    }

    // Show configuration and get confirmation
    const confirmed = await showConfiguration();
    if (!confirmed) {
      console.log('\n🛑 Launch cancelled by user.\n');
      process.exit(0);
    }

    console.log('\n🚀 LAUNCHING PROFIT BOT...\n');

    // Launch the master profit bot
    const { spawn } = await import('child_process');
    const botProcess = spawn('tsx', ['src/master-profit-bot.ts'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    // Handle bot process events
    botProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Profit bot exited successfully.\n');
      } else {
        console.log(`\n❌ Profit bot exited with code ${code}.\n`);
      }
    });

    botProcess.on('error', (error) => {
      console.error('\n❌ Failed to start profit bot:', error);
      process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down profit bot...');
      botProcess.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Terminating profit bot...');
      botProcess.kill('SIGTERM');
    });

  } catch (error) {
    console.error('\n❌ Launch failed:', error);
    process.exit(1);
  }
}

// Run the launcher
main().catch(console.error);