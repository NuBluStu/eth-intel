# 🚀 Ethereum Intelligence System

An advanced AI-powered blockchain analysis system for Ethereum mainnet, featuring real-time data indexing, intelligent token safety analysis, and automated copy trading capabilities.

## 🌟 Features

### Core Capabilities
- **🤖 AI-Powered Analysis**: Local Llama3 integration for intelligent blockchain queries
- **📊 Real-Time Indexing**: Continuous blockchain data ingestion via Geth RPC
- **💾 Local Database**: DuckDB-powered analytics with rolling data windows
- **🔍 27+ Analysis Tools**: Comprehensive blockchain investigation toolkit

### Advanced Features
- **Token Safety Analyzer**: Multi-factor scoring system for new token launches
- **Copy Trading Bot**: Automated trading following successful wallets
- **DEX Analytics**: Uniswap V2/V3 pool analysis and liquidity tracking
- **Custom SQL Queries**: Flexible data analysis beyond predefined queries
- **MEV Detection**: Identify arbitrage and sandwich attack opportunities
- **Gas Optimization**: Real-time gas price tracking and optimal timing

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Local Llama3 AI                       │
│                 (Ollama at :11434)                      │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   Runtime Orchestrator   │
        │   (27+ Tools Available)  │
        └────────────┬────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼───┐      ┌─────▼─────┐    ┌────▼────┐
│  RPC  │      │  DuckDB   │    │  Token  │
│ Tools │      │   Tools   │    │Analysis │
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
- Local Geth node running (http://127.0.0.1:8545)
- Ollama with Llama3 model
- macOS (optimized for local development)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/NuBluStu/eth-intel.git
cd eth-intel
```

2. **Install dependencies**
```bash
cd packages/runtime
npm install

cd ../trading-bot
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your settings:
# - RPC endpoints
# - Database path
# - LLM configuration
```

4. **Install Ollama and Llama3**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Llama3 model
ollama pull llama3.1:8b
```

5. **Start the system**
```bash
# Start interactive chat
npm run chat

# Or run specific queries
npm run dev "What are the most profitable wallets?"
```

## 💬 Usage Examples

### Interactive Chat Mode
```bash
npm run chat
```

Ask questions like:
- "Find safe tokens launched in the last 24 hours"
- "Show me wallets related to 0x3815..."
- "What's the current gas price?"
- "Analyze Uniswap V3 WETH/USDC pool"

### Token Safety Analysis
```bash
npx tsx src/analyze-new-tokens.ts
```

Analyzes new token launches with:
- Deployer reputation scoring
- Organic traffic detection
- Liquidity safety checks
- Honeypot detection

### Find Deployer-Created Pools
```bash
npx tsx src/find-deployer-pools.ts
```

Identifies safer tokens where deployers provided initial liquidity.

## 🛠️ Available Tools

### Ethereum RPC (40+ methods)
- `eth_getBalance` - Check wallet balances
- `eth_getTransactionByHash` - Get transaction details
- `eth_call` - Read smart contracts
- `eth_gasPrice` - Current gas prices
- And many more...

### SQL Analysis
- `sql_custom` - Write any SELECT query
- `wallet_top_profit` - Find profitable wallets
- `project_trending` - Trending projects
- `token_founders` - Token deployer analysis

### Token Tools
- `token_info` - Get token details
- `token_balance` - Check balances
- `token_transfers` - Track movements
- `is_token` - Verify contracts

### DeFi Tools
- `uniswap_v2_pool` - V2 pool analysis
- `uniswap_v3_pool` - V3 pool data
- `calculate_il` - Impermanent loss
- `detect_mev` - MEV opportunities

## 🔒 Security

- **Local-Only**: All data processing happens locally
- **No API Keys**: No external service dependencies
- **Private Keys**: Never committed to repository
- **Encrypted Storage**: Wallet keys use AES-256-GCM

## 📊 Database Schema

The system uses DuckDB with three main tables:
- `erc20_transfers` - Token transfer events
- `pools` - Liquidity pool information
- `dex_events` - DEX swaps, mints, burns

## 🚦 Token Safety Scoring

Tokens are scored on a 100-point scale:
- **Deployer Reputation** (30 points)
- **Trading Patterns** (25 points)
- **Liquidity Safety** (25 points)
- **Contract Security** (20 points)

Scores:
- 80-100: ✅ Safe (Low Risk)
- 60-79: ⚠️ Moderate Risk
- <60: ❌ High Risk (Avoid)

## 🤝 Contributing

Contributions are welcome! Please ensure:
- No private keys or sensitive data in commits
- Follow existing code patterns
- Add tests for new features
- Update documentation

## ⚠️ Disclaimer

This software is for educational purposes only. Cryptocurrency trading carries significant risk. Always do your own research and never invest more than you can afford to lose.

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Built with [Viem](https://viem.sh/) for Ethereum interactions
- Powered by [DuckDB](https://duckdb.org/) for analytics
- AI capabilities via [Ollama](https://ollama.com/)
- Trading infrastructure inspired by DeFi best practices

---

**Created with ❤️ for the Ethereum community**