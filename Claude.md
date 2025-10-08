# CLAUDE.md – Meme Coin Profit Maximization System

## 🎯 Primary Goal
**Maximize profits through autonomous meme coin trading using LLM-powered decision making**

The system gives Llama3 direct access to:
1. Ethereum mainnet for real-time data
2. Trading tools for autonomous execution
3. Analysis capabilities for opportunity detection
4. Risk management for capital preservation

---

## 1. Core Trading Principles
- **Profit First**: Every decision optimized for maximum returns
- **Autonomous Execution**: LLM makes independent buy/sell decisions
- **Risk Controlled**: Stop losses and position sizing limits
- **Meme Focus**: Specialized in high-volatility meme tokens
- **Smart Money**: Follow wallets that consistently profit

---

## 2. Architecture

```
Autonomous Llama3 Trader
         |
         v
   orchestrator.ts
         |
    +----+----+
    |         |
trading-   swing-trader-
tools.ts   llm.ts
    |         |
    +----+----+
         |
    Geth Node
  (localhost:8545)
```

### Key Components:
- **orchestrator.ts**: LLM-Ethereum bridge
- **trading-tools.ts**: Buy/sell execution
- **swing-trader-llm.ts**: Autonomous agent
- **meme-trader.ts**: Core trading logic
- **profit-engine.ts**: 10 profit rules

---

## 3. Trading Tools Available to LLM

### 3.1 Execution Tools (`trading-tools.ts`)
```typescript
trade.buy(tokenAddress, amountETH)     // Buy token
trade.sell(tokenAddress, amount)       // Sell token
trade.analyze(tokenAddress)            // Analyze opportunity
trade.positions()                       // Current holdings
trade.stats()                          // Performance metrics
trade.balance()                        // Wallet balance
trade.emergency()                      // Panic sell all
```

### 3.2 Analysis Tools
```typescript
honeypot.detect(token)                 // Scam detection
token.score(address)                   // 100-point evaluation
wallet.analyze(address)                // Smart money check
profit.evaluate(position)              // Exit strategy
```

### 3.3 Blockchain Tools
```typescript
eth.getBalance(address)                // Check balances
eth.getLogs(filter)                    // Event history
eth.getTransaction(hash)               // TX details
eth.gasPrice()                         // Gas optimization
```

---

## 4. Profit Maximization Rules

The system implements 10 sophisticated rules:

1. **Partial Exit at 2x**: Take 20% profit
2. **Scale Out at 5x**: Take 30% profit
3. **Major Exit at 10x**: Take 30% profit
4. **Moon Bag at 20x**: Hold 20% for massive gains
5. **Stop Loss**: Exit at -25% (configurable)
6. **Trailing Stop**: Activate after 3x gains
7. **Volume Exit**: Sell on declining volume
8. **Time Pruning**: Exit stagnant positions
9. **Kelly Sizing**: Optimal position sizes
10. **Smart Following**: Copy profitable wallets

---

## 5. Token Scoring System (100 points)

### Evaluation Criteria:
- **Liquidity (30 pts)**: Pool size, locks, stability
- **Smart Money (25 pts)**: Quality holder analysis
- **Volume (20 pts)**: Trading activity metrics
- **Distribution (15 pts)**: Holder decentralization
- **Safety (10 pts)**: Contract verification

### Score Thresholds:
- 80-100: Strong buy signal
- 60-79: Moderate opportunity
- <60: Avoid/sell signal

---

## 6. Autonomous Trading Modes

### Conservative
```typescript
MAX_POSITION = 0.005 ETH
STOP_LOSS = -10%
TARGET_PROFIT = 50%
HOLD_TIME = 24-48 hours
```

### Balanced (Default)
```typescript
MAX_POSITION = 0.01 ETH
STOP_LOSS = -25%
TARGET_PROFIT = 100%
HOLD_TIME = 1-24 hours
```

### Aggressive
```typescript
MAX_POSITION = 0.02 ETH
STOP_LOSS = -50%
TARGET_PROFIT = 200%+
HOLD_TIME = 10 min - 6 hours
```

---

## 7. LLM Decision Flow

```
1. SCAN: Check tokens every 60 seconds
2. ANALYZE: Score each opportunity
3. DECIDE: Buy/sell/hold decision
4. EXECUTE: Place trades via tools
5. MONITOR: Track positions
6. EXIT: Take profits or stop losses
```

### Example LLM Prompt:
```
You are an aggressive swing trader.
Analyze token 0x6982... for opportunity.
If score > 70, execute buy for 0.01 ETH.
Monitor and sell at 2x or -25% loss.
```

---

## 8. Safety Features

### Trade Safety
- Simulation mode for testing
- Maximum position limits
- Gas price checks
- Honeypot detection

### Capital Preservation
- Never trade more than MAX_TRADE_ETH
- Stop losses on all positions
- Emergency shutdown capability
- Drawdown limits

---

## 9. Implementation Files

### Core Trading
- `src/bot/meme-trader.ts` - Main trading logic
- `src/bot/profit-engine.ts` - Profit rules
- `src/tools/trading-tools.ts` - Execution

### Analysis
- `src/analysis/honeypot-detector.ts` - Scam detection
- `src/analysis/token-scorer.ts` - Scoring system
- `src/analysis/wallet-analyzer.ts` - Smart money

### LLM Integration
- `src/orchestrator.ts` - Tool calling bridge
- `src/agents/swing-trader-llm.ts` - Autonomous agent
- `chat-with-llama.ts` - Interactive mode

---

## 10. Quick Start

### Launch Autonomous Trader
```bash
npm start  # Meme trader with all features
```

### Give Llama Full Control
```bash
npx tsx src/agents/swing-trader-llm.ts aggressive
```

### Interactive Trading
```bash
npx tsx chat-with-llama.ts
> "Buy 0.01 ETH of PEPE"
> "Show my positions"
> "Take profits on winners"
```

---

## 11. Performance Metrics

Track success with:
- Total P&L (ETH and USD)
- Win rate percentage
- Average return per trade
- Best/worst trades
- Current positions
- Gas costs vs profits

---

## 12. Risk Warning

⚠️ **EXTREME RISK**: This system:
- Trades real money autonomously
- Focuses on highly volatile assets
- Makes decisions via experimental AI
- Can lose entire trading capital

**ALWAYS START IN SIMULATION MODE**

---

## Benefits of This Approach

- **No API limits** - Fully local execution
- **Direct node access** - Fastest possible trades
- **LLM reasoning** - Adaptive strategies
- **24/7 operation** - Never miss opportunities
- **Extensible** - Add new strategies easily