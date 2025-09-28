#!/bin/bash

echo "🤖 LLM Configuration Switcher"
echo "============================="
echo ""
echo "Select LLM provider:"
echo "1) OpenAI GPT-4 Turbo"
echo "2) OpenAI GPT-4o Mini (cheaper)"
echo "3) Local Ollama (Llama 3.1)"
echo ""
read -p "Choice (1-3): " choice

case $choice in
    1)
        echo "Switching to GPT-4 Turbo..."
        sed -i.bak 's/^# LLM_BASE_URL=https/LLM_BASE_URL=https/' ../../.env
        sed -i.bak 's/^LLM_BASE_URL=http:\/\/127/# LLM_BASE_URL=http:\/\/127/' ../../.env
        sed -i.bak 's/^LLM_MODEL=.*/LLM_MODEL=gpt-4-turbo-preview/' ../../.env
        echo "✅ Configured for GPT-4 Turbo"
        echo ""
        echo "⚠️  Make sure OPENAI_API_KEY is set in .env!"
        ;;
    2)
        echo "Switching to GPT-4o Mini..."
        sed -i.bak 's/^# LLM_BASE_URL=https/LLM_BASE_URL=https/' ../../.env
        sed -i.bak 's/^LLM_BASE_URL=http:\/\/127/# LLM_BASE_URL=http:\/\/127/' ../../.env
        sed -i.bak 's/^LLM_MODEL=.*/LLM_MODEL=gpt-4o-mini/' ../../.env
        echo "✅ Configured for GPT-4o Mini"
        echo ""
        echo "⚠️  Make sure OPENAI_API_KEY is set in .env!"
        ;;
    3)
        echo "Switching to Local Ollama..."
        sed -i.bak 's/^LLM_BASE_URL=https/# LLM_BASE_URL=https/' ../../.env
        sed -i.bak 's/^# LLM_BASE_URL=http:\/\/127/LLM_BASE_URL=http:\/\/127/' ../../.env
        sed -i.bak 's/^LLM_MODEL=.*/LLM_MODEL=llama3.1:8b/' ../../.env
        echo "✅ Configured for Local Ollama"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Current configuration:"
grep "^LLM_" ../../.env | head -3