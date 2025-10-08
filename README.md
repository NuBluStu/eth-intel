# 🚀 ETH Intel - Meme Coin Profit Maximizer

An autonomous AI-powered meme coin trading system that gives Llama direct access to Ethereum mainnet for maximum profit generation through intelligent swing trading.

## 💰 Core Mission
**Maximize profits by autonomously trading meme coins with LLM-powered decision making**

## 🌟 Features

### Autonomous Trading Capabilities
- **🤖 LLM-Powered Trading**: Llama3 makes autonomous buy/sell decisions
- **💎 Meme Coin Focus**: Specialized in high-volatility meme token trading
- **📈 Profit Engine**: 10 sophisticated rules for maximizing returns
- **🛡️ Honeypot Detection**: Avoid scams with multi-layer safety checks
- **🎯 Smart Money Tracking**: Follow wallets that consistently profit
- **⚡ Real-Time Execution**: Direct Ethereum node integration for fast trades

### Trading Strategies
- **Conservative**: 10% drawdown, 2:1 risk/reward minimum
- **Balanced**: 15-20% profit targets, 1-24 hour holds
- **Aggressive**: 20-30% quick gains, momentum breakouts

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Autonomous Llama3 Trader                │
│                   (Ollama at :11434)                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   LLM Orchestrator      │
        │  (Direct Node Access)   │
        └────────────┬────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼───┐      ┌─────▼─────┐    ┌────▼────┐
│Trading│      │  Meme     │    │ Profit  │
│ Tools │      │  Trader   │    │ Engine  │
└───┬───┘      └─────┬─────┘    └────┬────┘
    │                │                │
┌───▼───────────────▼────────────────▼───┐
│         Ethereum Mainnet (Geth)         │
│         http://127.0.0.1:8545           │
└─────────────────────────────────────────┘
```

## 📦 Installation

### Prerequisites
- Node.js 20+
- Local Geth node (http://127.0.0.1:8545)
- Ollama with Llama3.1 model
- 0.01+ ETH for trading (simulation mode available)

### Quick Start

1. **Clone and install**
```bash
git clone https://github.com/NuBluStu/eth-intel.git
cd eth-intel/packages/runtime
npm install
```

2. **Configure trading**
```bash
cp .env.example .env
# Edit .env with:
# - PRIVATE_KEY (for real trading)
# - TRADING_MODE=simulation (or mainnet)
# - Risk parameters
```

3. **Install Llama3**
```bash
ollama pull llama3.1:8b
ollama serve  # Keep running
```

4. **Launch the profit bot**
```bash
# Simulation mode (default)
npm start

# Aggressive mode
npm run start:aggressive

# Conservative mode
npm run start:conservative
```

## 🎮 Usage Modes

### 1. Autonomous Meme Trader
```bash
npm start
```
Runs the main meme coin trader with:
- Honeypot detection
- 100-point token scoring
- Kelly Criterion position sizing
- Automated profit taking

### 2. LLM Swing Trader
```bash
npx tsx src/agents/swing-trader-llm.ts balanced
```
Gives Llama full autonomy to:
- Analyze tokens every 60 seconds
- Execute trades based on strategy
- Manage multiple positions
- Take profits automatically

### 3. Interactive LLM Chat
```bash
npx tsx chat-with-llama.ts
```
Direct access to Llama with Ethereum tools:
- Query blockchain data
- Analyze tokens
- Execute trades manually
- Custom analysis

## 💰 Profit Maximization Rules

The system uses 10 sophisticated rules:
1. **Take 20% profit at 2x**
2. **Take 30% profit at 5x**
3. **Take 30% profit at 10x**
4. **Hold 20% for 20x+ moonshots**
5. **Stop loss at -25% (configurable)**
6. **Trailing stop after 3x**
7. **Volume-based exits**
8. **Time-based pruning**
9. **Kelly Criterion sizing**
10. **Smart money following**

## 🛡️ Safety Features

### Honeypot Detection
- Contract analysis for malicious functions
- Liquidity lock verification
- Tax and fee analysis
- Trading pattern anomalies

### Risk Management
- Maximum position sizes
- Drawdown limits
- Gas price monitoring
- Simulation mode for testing

## 📊 Token Scoring System

100-point evaluation:
- **Liquidity** (30 points): Pool size, lock status
- **Smart Money** (25 points): Quality wallet holdings
- **Volume** (20 points): Trading activity
- **Holder Distribution** (15 points): Decentralization
- **Contract Safety** (10 points): Verified, no red flags

Scores:
- 80-100: 🟢 Strong buy
- 60-79: 🟡 Moderate opportunity
- <60: 🔴 Avoid

## 🤖 LLM Trading Tools

Llama has direct access to:
- `trade.buy(token, amount)` - Execute purchases
- `trade.sell(token, amount)` - Execute sales
- `trade.analyze(token)` - Token analysis
- `trade.positions()` - Current holdings
- `trade.stats()` - Performance metrics
- `trade.emergency()` - Panic sell all

## 📈 Performance Tracking

Real-time metrics:
- Total P&L
- Win rate
- Average return per trade
- Best/worst trades
- Current positions
- Gas costs

## ⚠️ Trading Modes

### Simulation (Default)
- No real trades executed
- Perfect for testing strategies
- Uses real market data

### Mainnet (Live)
- Real money at risk
- Requires funded wallet
- Set `EXECUTE_REAL_TRADES=true`

## 🔒 Security

- **Private Keys**: Never committed, stored in .env
- **Simulation First**: Always test strategies
- **Position Limits**: Configurable max sizes
- **Gas Limits**: Protection from high fees

## ⚡ Commands

```bash
npm start                    # Launch meme trader
npm run start:aggressive     # High risk/reward mode
npm run start:conservative   # Low risk mode
npx tsx chat-with-llama.ts  # Interactive LLM
```

## 🚨 Disclaimer

**HIGH RISK WARNING**: Meme coin trading is extremely risky. This software can lose money. Features:
- Automated trading with real funds
- High volatility assets
- Experimental LLM decisions
- No guarantees of profit

Only trade what you can afford to lose. Start with simulation mode.

## 📄 License

MIT License - Use at your own risk

## 🙏 Built With

- [Viem](https://viem.sh/) - Ethereum interactions
- [Ollama](https://ollama.com/) - Local LLM
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**⚠️ FINANCIAL RISK: This bot trades autonomously. Always monitor and use stop losses.**