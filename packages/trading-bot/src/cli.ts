#!/usr/bin/env tsx
import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { WalletManager } from './wallet-manager.js';
import { TradeExecutor } from './trade-executor.js';
import { CopyTrader } from './copy-trader.js';
import { MLPredictor } from './ml-predictor.js';
import { SafetyGuardian } from './safety-guardian.js';
import { CommandInterface } from './command-interface.js';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('eth-trading-bot')
  .description('Automated Ethereum trading bot with ML and copy trading')
  .version('1.0.0');

program
  .command('wallet')
  .description('Manage trading wallets')
  .option('-c, --create', 'Create new wallet')
  .option('-i, --import <key>', 'Import private key')
  .option('-l, --list', 'List all wallets')
  .option('-b, --balance', 'Check balance')
  .action(async (options) => {
    const password = await promptPassword();
    const walletManager = new WalletManager(password);
    await walletManager.init();

    if (options.create) {
      const { alias } = await prompts({
        type: 'text',
        name: 'alias',
        message: 'Wallet alias (optional):'
      });

      const spinner = ora('Creating wallet...').start();
      const wallet = await walletManager.createWallet(alias);
      spinner.succeed('Wallet created');
      
      console.log(chalk.green('\n✅ New wallet created:'));
      console.log(chalk.cyan(`Address: ${wallet.address}`));
      console.log(chalk.yellow(`Private Key: ${wallet.privateKey}`));
      console.log(chalk.red('\n⚠️  SAVE YOUR PRIVATE KEY SECURELY! It cannot be recovered.'));
    }

    if (options.import) {
      const { alias } = await prompts({
        type: 'text',
        name: 'alias',
        message: 'Wallet alias (optional):'
      });

      const spinner = ora('Importing wallet...').start();
      const address = await walletManager.importWallet(options.import, alias);
      spinner.succeed(`Wallet imported: ${address}`);
    }

    if (options.list) {
      const wallets = await walletManager.listWallets();
      console.log(chalk.cyan('\n📝 Your wallets:'));
      wallets.forEach(w => {
        const marker = w.active ? chalk.green(' ✓') : '  ';
        console.log(`${marker} ${w.address} ${w.alias ? `(${w.alias})` : ''}`);
      });
    }

    if (options.balance) {
      const balance = await walletManager.getBalance();
      console.log(chalk.cyan(`\n💰 Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`));
    }
  });

program
  .command('trade <action>')
  .description('Execute trades (buy/sell)')
  .option('-t, --token <address>', 'Token contract address')
  .option('-a, --amount <amount>', 'Amount in ETH')
  .option('-d, --dry-run', 'Simulate without executing')
  .action(async (action, options) => {
    const password = await promptPassword();
    const walletManager = new WalletManager(password);
    await walletManager.init();

    const tradeExecutor = new TradeExecutor(walletManager);
    if (options.dryRun) {
      tradeExecutor.setDryRun(true);
    }

    const spinner = ora(`Executing ${action}...`).start();

    try {
      if (action === 'buy') {
        const result = await tradeExecutor.swapExactETHForTokens(
          options.token,
          options.amount
        );
        
        if (result) {
          spinner.succeed(`Trade executed: ${result.txHash}`);
        } else {
          spinner.info('Trade simulated (dry run)');
        }
      } else if (action === 'sell') {
        const balance = await tradeExecutor.getTokenBalance(options.token);
        const result = await tradeExecutor.swapExactTokensForETH(
          options.token,
          balance
        );
        
        if (result) {
          spinner.succeed(`Trade executed: ${result.txHash}`);
        } else {
          spinner.info('Trade simulated (dry run)');
        }
      }
    } catch (error) {
      spinner.fail(`Trade failed: ${error}`);
    }
  });

program
  .command('copy')
  .description('Start copy trading profitable wallets')
  .option('-w, --wallets <addresses>', 'Comma-separated wallet addresses')
  .option('-a, --auto', 'Auto-select profitable wallets from database')
  .action(async (options) => {
    const password = await promptPassword();
    const walletManager = new WalletManager(password);
    await walletManager.init();

    const tradeExecutor = new TradeExecutor(walletManager);
    const copyTrader = new CopyTrader(walletManager, tradeExecutor);

    const spinner = ora('Setting up copy trading...').start();

    try {
      if (options.auto) {
        await copyTrader.loadProfitableWallets();
        spinner.text = 'Loaded profitable wallets';
      } else if (options.wallets) {
        const wallets = options.wallets.split(',');
        for (const wallet of wallets) {
          await copyTrader.addWallet(wallet.trim());
        }
        spinner.text = `Added ${wallets.length} wallets`;
      }

      await copyTrader.startMonitoring();
      spinner.succeed('Copy trading started');
      
      console.log(chalk.green('\n📋 Following wallets:'));
      copyTrader.getFollowedWallets().forEach(w => {
        console.log(`  • ${w.address} (confidence: ${(w.confidence * 100).toFixed(0)}%)`);
      });

      console.log(chalk.cyan('\n👁️ Monitoring for trades... Press Ctrl+C to stop'));
    } catch (error) {
      spinner.fail(`Failed to start copy trading: ${error}`);
    }
  });

program
  .command('analyze <token>')
  .description('Get ML prediction for a token')
  .action(async (token) => {
    const mlPredictor = new MLPredictor();
    const spinner = ora('Analyzing token...').start();

    try {
      await mlPredictor.init();
      const prediction = await mlPredictor.predict(token);
      
      spinner.succeed('Analysis complete');
      
      console.log(chalk.cyan('\n📊 ML Analysis:'));
      console.log(`  • Action: ${chalk.bold(prediction.action.toUpperCase())}`);
      console.log(`  • Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
      console.log(`  • Expected Return: ${(prediction.predictedReturn * 100).toFixed(2)}%`);
      console.log('\n📈 Features:');
      console.log(`  • Volume Trend: ${prediction.features.volumeTrend.toFixed(3)}`);
      console.log(`  • Wallet Activity: ${prediction.features.walletActivity.toFixed(3)}`);
      console.log(`  • Volatility: ${prediction.features.priceVolatility.toFixed(3)}`);
    } catch (error) {
      spinner.fail(`Analysis failed: ${error}`);
    }
  });

program
  .command('chat')
  .description('Interactive natural language trading interface')
  .action(async () => {
    const password = await promptPassword();
    const walletManager = new WalletManager(password);
    await walletManager.init();

    const tradeExecutor = new TradeExecutor(walletManager);
    const copyTrader = new CopyTrader(walletManager, tradeExecutor);
    const mlPredictor = new MLPredictor();
    const safetyGuardian = new SafetyGuardian(walletManager);
    
    await mlPredictor.init();
    await safetyGuardian.init();

    const commandInterface = new CommandInterface(
      walletManager,
      tradeExecutor,
      copyTrader,
      mlPredictor,
      safetyGuardian
    );

    console.log(chalk.cyan('\n🤖 Trading Bot Chat Interface'));
    console.log(chalk.gray('Type your commands in natural language. Type "exit" to quit.\n'));

    while (true) {
      const { input } = await prompts({
        type: 'text',
        name: 'input',
        message: '>'
      });

      if (!input || input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('Goodbye!'));
        break;
      }

      const spinner = ora('Processing...').start();
      try {
        const response = await commandInterface.processNaturalLanguage(input);
        spinner.stop();
        console.log(chalk.green(response));
      } catch (error) {
        spinner.fail(`Error: ${error}`);
      }
    }
  });

program
  .command('status')
  .description('Show trading bot status')
  .action(async () => {
    const password = await promptPassword();
    const walletManager = new WalletManager(password);
    await walletManager.init();

    const safetyGuardian = new SafetyGuardian(walletManager);
    await safetyGuardian.init();

    const stats = safetyGuardian.getStats();
    const balance = await walletManager.getBalance();

    console.log(chalk.cyan('\n📊 Trading Bot Status\n'));
    
    console.log(chalk.bold('Wallet:'));
    console.log(`  • Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
    
    console.log(chalk.bold('\nTrading Statistics:'));
    console.log(`  • Total trades: ${stats.totalTrades}`);
    console.log(`  • Profitable: ${stats.profitableTrades}`);
    console.log(`  • Win rate: ${stats.totalTrades > 0 ? ((stats.profitableTrades / stats.totalTrades) * 100).toFixed(1) : 0}%`);
    console.log(`  • Total P&L: ${Number(stats.totalPnL) > 0 ? '+' : ''}${(Number(stats.totalPnL) / 1e18).toFixed(4)} ETH`);
    
    console.log(chalk.bold('\nSafety Limits:'));
    console.log(`  • Stop loss: ${(stats.stopLossPercent * 100).toFixed(1)}%`);
    console.log(`  • Max position: ${(Number(stats.maxPosition) / 1e18).toFixed(2)} ETH`);
    console.log(`  • Max gas: ${Number(stats.maxGasPrice) / 1e9} gwei`);
  });

async function promptPassword(): Promise<string> {
  const envPassword = process.env.WALLET_PASSWORD;
  if (envPassword) return envPassword;

  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Enter wallet password:'
  });

  if (!password) {
    console.error(chalk.red('Password required'));
    process.exit(1);
  }

  return password;
}

program.parse();