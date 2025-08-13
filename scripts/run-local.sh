#!/bin/bash

set -e

echo "🚀 Ethereum Intelligence System - Local Setup"
echo "============================================"

cd "$(dirname "$0")/.."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+"
    exit 1
fi

if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama is not installed. Please install from https://ollama.ai"
    echo "   Or use llama.cpp with OpenAI-compatible server"
    exit 1
fi

echo "📦 Installing dependencies..."
cd packages/runtime
npm install

if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "   Please edit packages/runtime/.env to configure your settings"
fi

echo "🤖 Checking LLM availability..."
if ! ollama list | grep -q "llama3.1:8b"; then
    echo "📥 Pulling llama3.1:8b model..."
    ollama pull llama3.1:8b
fi

echo "🔧 Building TypeScript..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available commands:"
echo "  1. Start runtime (query mode):"
echo "     npm run dev \"your question here\""
echo ""
echo "  2. Start indexer (backfill + tail):"
echo "     node dist/indexer.js"
echo ""
echo "  3. Backfill specific days:"
echo "     node dist/indexer.js backfill 7"
echo ""
echo "  4. Tail new blocks only:"
echo "     node dist/indexer.js tail"
echo ""
echo "  5. Clean old data:"
echo "     node dist/indexer.js retention"
echo ""
echo "Prerequisites:"
echo "  - Geth node running at http://127.0.0.1:8545 (HTTP) and ws://127.0.0.1:8546 (WebSocket)"
echo "  - Ollama running with llama3.1:8b model"
echo ""
echo "Example queries:"
echo '  npm run dev "What are the most profitable wallets in the last 5 days?"'
echo '  npm run dev "Show me new liquidity pools created today"'
echo '  npm run dev "Find wallets related to 0x123..."'