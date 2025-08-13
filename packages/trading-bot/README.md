# Ethereum Trading Bot

Automated trading system with ML predictions, copy trading, and natural language control.

## Features

- **Secure Wallet Management**: Encrypted local key storage
- **Copy Trading**: Follow profitable wallets automatically
- **ML Predictions**: TensorFlow.js-based profit prediction
- **DEX Trading**: Direct Uniswap V2/V3 integration
- **Natural Language**: Control via conversational commands
- **Safety Guardian**: Stop-loss, position limits, emergency stops

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Set wallet password:
```bash
export WALLET_PASSWORD="your-secure-password"
```

## CLI Commands

### Wallet Management
```bash
# Create new wallet
npm run trade wallet --create

# Import existing wallet
npm run trade wallet --import <private-key>

# List wallets
npm run trade wallet --list

# Check balance
npm run trade wallet --balance
```

### Trading
```bash
# Buy token
npm run trade trade buy --token 0x... --amount 0.1

# Sell token
npm run trade trade sell --token 0x...

# Dry run (simulate)
npm run trade trade buy --token 0x... --amount 0.1 --dry-run
```

### Copy Trading
```bash
# Auto-select profitable wallets
npm run trade copy --auto

# Copy specific wallets
npm run trade copy --wallets 0x123...,0x456...
```

### ML Analysis
```bash
# Analyze token
npm run trade analyze 0x...
```

### Interactive Chat
```bash
# Natural language interface
npm run trade chat
```

Example commands:
- "Buy 0.1 ETH worth of 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
- "Start copy trading the top profitable wallets"
- "What's my current balance?"
- "Analyze token 0x..."
- "Set stop loss to 10%"

### Status
```bash
# Show bot status
npm run trade status
```

## Natural Language Examples

The chat interface understands commands like:

- **Trading**
  - "Buy 0.5 ETH of USDC"
  - "Sell all my USDT"
  - "Swap token 0x... for ETH"

- **Copy Trading**
  - "Copy trades from wallet 0x..."
  - "Start following the most profitable wallets"
  - "Stop copying all wallets"

- **Analysis**
  - "Analyze WETH token"
  - "What does the ML model think about token 0x...?"
  - "Show me predictions for 0x..."

- **Limits & Safety**
  - "Set stop loss to 15%"
  - "Set max position size to 2 ETH"
  - "Set max gas to 50 gwei"

- **Status**
  - "Show status"
  - "What's my balance?"
  - "How many trades today?"

## Safety Features

- **Stop Loss**: Automatic position closing at loss threshold
- **Position Limits**: Maximum trade size enforcement
- **Gas Limits**: Prevents trading during high gas prices
- **Emergency Stop**: Halts all trading on consecutive losses
- **Blacklist**: Token blocking capability
- **Daily Limits**: Maximum trades per day

## Architecture

```
trading-bot/
├── wallet-manager.ts    # Encrypted key storage
├── trade-executor.ts    # DEX interactions
├── copy-trader.ts       # Follow profitable wallets
├── ml-predictor.ts      # TensorFlow.js predictions
├── command-interface.ts # Natural language processing
├── safety-guardian.ts   # Risk management
└── cli.ts              # Command-line interface
```

## Security Notes

1. **Private Keys**: Stored locally with AES-256-GCM encryption
2. **No Remote Storage**: All data stays on your machine
3. **Password Protected**: Required for all operations
4. **Dry Run Mode**: Test strategies without real trades

## Configuration

Key environment variables:

- `WALLET_PASSWORD`: Encryption password
- `RPC_HTTP`: Ethereum RPC endpoint
- `MAX_POSITION_SIZE_ETH`: Maximum trade size
- `STOP_LOSS_PERCENTAGE`: Stop loss threshold
- `DRY_RUN_MODE`: Enable simulation mode
- `MIN_CONFIDENCE_SCORE`: ML confidence threshold

## Disclaimer

This bot trades real assets. Use at your own risk. Always:
- Start with small amounts
- Use dry-run mode first
- Monitor actively
- Set conservative limits
- Never invest more than you can afford to lose