#!/bin/bash

echo "🔍 MEME COIN BOT CONFIGURATION CHECK"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    exit 1
fi

# Load environment variables
source .env

echo "📡 NETWORK CONFIGURATION:"
echo "  • Ethereum RPC: $RPC_HTTP"
echo "  • WebSocket: $RPC_WS"

# Test Ethereum connection
if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    $RPC_HTTP > /dev/null 2>&1; then
    echo "  ✅ Ethereum node is connected"
else
    echo "  ❌ Cannot connect to Ethereum node"
fi

echo ""
echo "🤖 LLM CONFIGURATION:"
echo "  • LLM URL: $LLM_BASE_URL"
echo "  • Model: $LLM_MODEL"

# Test Ollama connection
if curl -s $LLM_BASE_URL > /dev/null 2>&1; then
    echo "  ✅ Ollama LLM is running"
else
    echo "  ⚠️ Ollama not accessible (optional for basic trading)"
fi

echo ""
echo "💰 TRADING CONFIGURATION:"
echo "  • Mode: $TRADING_MODE"
echo "  • Execute Real Trades: $EXECUTE_REAL_TRADES"
echo "  • Initial Capital: $INITIAL_CAPITAL_ETH ETH"
echo "  • Max Position Size: $MAX_POSITION_SIZE_ETH ETH"
echo "  • Max Positions: $MAX_PORTFOLIO_POSITIONS"

echo ""
echo "🛡️ RISK MANAGEMENT:"
echo "  • Stop Loss: $STOP_LOSS_PERCENT%"
echo "  • Trailing Stop: $TRAILING_STOP_PERCENT%"
echo "  • Min Liquidity: $$MIN_LIQUIDITY"
echo "  • Max Buy Tax: $MAX_BUY_TAX%"
echo "  • Max Sell Tax: $MAX_SELL_TAX%"

echo ""
echo "💎 PROFIT TARGETS:"
echo "  • 2x: Sell $TAKE_PROFIT_2X ($(echo "$TAKE_PROFIT_2X * 100" | bc)%)"
echo "  • 5x: Sell $TAKE_PROFIT_5X ($(echo "$TAKE_PROFIT_5X * 100" | bc)%)"
echo "  • 10x: Sell $TAKE_PROFIT_10X ($(echo "$TAKE_PROFIT_10X * 100" | bc)%)"
echo "  • 20x: Sell $TAKE_PROFIT_20X ($(echo "$TAKE_PROFIT_20X * 100" | bc)%)"

echo ""
echo "🔐 WALLET:"
echo "  • Address: $WALLET_ADDRESS"
echo "  • Private Key: [CONFIGURED]"

echo ""
if [ "$TRADING_MODE" = "simulation" ]; then
    echo "✅ READY TO RUN IN SIMULATION MODE (SAFE)"
    echo ""
    echo "To start the bot, run:"
    echo "  npm start"
    echo ""
    echo "⚠️ To enable REAL trading:"
    echo "  1. Edit .env and set TRADING_MODE=mainnet"
    echo "  2. Set EXECUTE_REAL_TRADES=true"
    echo "  3. Ensure wallet has ETH for gas"
else
    echo "⚠️ WARNING: CONFIGURED FOR REAL TRADING!"
    echo "Make sure you understand the risks before running."
fi

echo ""
echo "======================================"