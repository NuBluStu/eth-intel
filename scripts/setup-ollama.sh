#!/bin/bash

set -e

echo "🤖 Configuring Ollama for Ethereum Intelligence System"
echo "======================================================="

# Set resource limits for Ollama to work alongside Geth + Lighthouse
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_NUM_PARALLEL=2
export OLLAMA_MEMORY_LIMIT=8gb
export OLLAMA_KEEP_ALIVE=5m

echo "📝 Resource limits configured:"
echo "   Max loaded models: 1"
echo "   Parallel requests: 2"
echo "   Memory limit: 8GB"
echo "   Model keep-alive: 5 minutes"

# Start Ollama service if not running
if ! pgrep -x "ollama" > /dev/null; then
    echo "🚀 Starting Ollama service..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
    echo "   Ollama service started"
else
    echo "✅ Ollama service already running"
fi

# Check available models
echo ""
echo "📦 Available models:"
ollama list

# Pull the recommended model
echo ""
echo "📥 Pulling recommended model: llama3.1:8b..."
echo "   This is a 4.7GB download, please wait..."

# Try to pull the quantized version first, fallback to regular
if ollama pull llama3.1:8b-instruct-q4_K_M 2>/dev/null; then
    echo "✅ Successfully pulled quantized model (Q4_K_M)"
    MODEL="llama3.1:8b-instruct-q4_K_M"
elif ollama pull llama3.1:8b 2>/dev/null; then
    echo "✅ Successfully pulled standard model"
    MODEL="llama3.1:8b"
else
    echo "⚠️  Could not pull llama3.1:8b, trying alternative..."
    ollama pull mistral:7b-instruct-q4_0
    MODEL="mistral:7b-instruct-q4_0"
    echo "✅ Using Mistral 7B as alternative (3.8GB)"
fi

# Test the model
echo ""
echo "🧪 Testing model with simple query..."
echo "Test: 'What is 2+2?'" | ollama run $MODEL "What is 2+2? Answer in one word only."

echo ""
echo "✅ Ollama setup complete!"
echo ""
echo "Configuration for .env file:"
echo "----------------------------"
echo "LLM_BASE_URL=http://127.0.0.1:11434/v1"
echo "LLM_MODEL=$MODEL"
echo ""
echo "To make resource limits permanent, add to ~/.zshrc or ~/.bash_profile:"
echo "export OLLAMA_MAX_LOADED_MODELS=1"
echo "export OLLAMA_NUM_PARALLEL=2"
echo "export OLLAMA_MEMORY_LIMIT=8gb"
echo "export OLLAMA_KEEP_ALIVE=5m"