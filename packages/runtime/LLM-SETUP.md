# LLM Setup Guide for Ethereum Intelligence System

## Available LLM Providers

### 1. Anthropic Claude (Recommended) 🎯
Best for complex reasoning, multi-step planning, and structured outputs.

**Setup:**
1. Get API key: https://console.anthropic.com/settings/keys
2. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. Run: `npm run dev:claude "your question"`

**Models:**
- `claude-3-opus-20240229` - Most capable ($15/1M input, $75/1M output)
- `claude-3-sonnet-20240229` - Balanced performance ($3/1M input, $15/1M output) ✨
- `claude-3-haiku-20240307` - Fast & cheap ($0.25/1M input, $1.25/1M output)

**Pros:**
- Excellent at following complex instructions
- Superior JSON generation
- Great at multi-step reasoning
- Strong code understanding

---

### 2. OpenAI GPT-4
Good alternative with wide ecosystem support.

**Setup:**
1. Get API key: https://platform.openai.com/api-keys
2. Update `.env`:
   ```
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4-turbo-preview
   OPENAI_API_KEY=sk-...
   ```
3. Run: `npm run dev:v2 "your question"`

**Models:**
- `gpt-4-turbo-preview` - Latest GPT-4 Turbo ($10/1M input, $30/1M output)
- `gpt-4o-mini` - Cheaper alternative ($0.15/1M input, $0.60/1M output)
- `gpt-3.5-turbo` - Fast but limited ($0.50/1M input, $1.50/1M output)

**Pros:**
- Large context window (128k)
- JSON mode available
- Fast response times
- Good general knowledge

---

### 3. Local Ollama
Free but limited capabilities.

**Setup:**
1. Install: `brew install ollama`
2. Pull model: `ollama pull llama3.1:8b`
3. Update `.env`:
   ```
   LLM_BASE_URL=http://127.0.0.1:11434/v1
   LLM_MODEL=llama3.1:8b
   ```
4. Run: `npm run dev:v2 "your question"`

**Models:**
- `llama3.1:8b` - Good for simple queries
- `mixtral:8x7b` - Better reasoning (needs 48GB RAM)
- `llama3:70b` - Best local option (needs 64GB+ RAM)

**Pros:**
- Completely free
- Private/offline
- No rate limits

**Cons:**
- Struggles with complex JSON
- Poor at multi-step planning
- Limited context understanding

---

## Quick Comparison

| Feature | Claude 3 | GPT-4 | Local Llama |
|---------|----------|-------|-------------|
| **Complex Planning** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **JSON Generation** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Cost (per complex query)** | $0.02-0.05 | $0.03-0.06 | Free |
| **Speed** | Fast | Fast | Slow |
| **Privacy** | API | API | Local |
| **Reliability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## Example Queries by Complexity

### Simple (All LLMs work)
- "What is the current block number?"
- "Get the gas price"
- "Check if address X is a contract"

### Medium (Claude/GPT-4 recommended)
- "Get the last 10 blocks and analyze gas usage patterns"
- "Find ERC20 transfers in the last hour"
- "Check validator performance for validator X"

### Complex (Claude strongly recommended)
- "Find wallets that bought tokens that later 10x'd"
- "Detect wash trading patterns across multiple DEXs"
- "Map relationships between top traders and identify clusters"
- "Analyze MEV bot strategies in the last 1000 blocks"

---

## Cost Optimization Tips

1. **Development**: Use Claude Haiku or GPT-4o-mini
2. **Complex Analysis**: Use Claude Sonnet or GPT-4 Turbo
3. **Simple Queries**: Use local Ollama
4. **Batch Processing**: Aggregate questions to reduce API calls

---

## Switching Between Providers

```bash
# Use Claude (recommended)
npm run dev:claude "your question"

# Use OpenAI GPT-4
npm run dev:v2 "your question"

# Interactive mode with Claude
npm run dev:claude
# Then type questions interactively
```

---

## Troubleshooting

### "API key not found"
- Check `.env` file has the correct key
- Ensure key starts with correct prefix (sk-ant- for Claude, sk- for OpenAI)

### "JSON parsing failed"
- Claude and GPT-4 rarely have this issue
- For local models, simplify your question

### "Tool not found"
- The LLM generated an incorrect tool name
- Try rephrasing the question or use a better model

### "Timeout errors"
- Complex queries may take 30-60 seconds
- Be patient or break into smaller questions