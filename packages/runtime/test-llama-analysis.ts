#!/usr/bin/env tsx
/**
 * Test Llama LLM Analysis for Meme Coin Trading
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function testLlamaAnalysis() {
  console.log('🤖 Testing Llama3.1 Analysis for Meme Coin Trading\n');

  const baseUrl = process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
  const model = process.env.LLM_MODEL || 'llama3.1:8b';

  // Simulate market data for LLM analysis
  const marketScenario = {
    currentBlock: 23524722,
    gasPrice: '15 gwei',
    topMemeCoins: [
      { symbol: 'PEPE', liquidity: '$2.5M', volume24h: '$500k', holders: 15000, smartMoney: 5 },
      { symbol: 'WOJAK', liquidity: '$800k', volume24h: '$150k', holders: 5000, smartMoney: 2 },
      { symbol: 'SHIB2.0', liquidity: '$50k', volume24h: '$10k', holders: 500, smartMoney: 0 },
    ],
    walletStats: {
      address: '0xc8B7C7dCFE4C0EB1fCE760336C58350CcBa35BB2',
      balance: 0.064,
      currentPositions: 0,
      totalProfit: 0
    }
  };

  const prompt = `You are an expert crypto trader analyzing meme coins on Ethereum. Based on this market data, provide trading recommendations:

Market Data:
- Current Block: ${marketScenario.currentBlock}
- Gas Price: ${marketScenario.gasPrice}
- Wallet Balance: ${marketScenario.walletStats.balance} ETH

Top Meme Coins Found:
${marketScenario.topMemeCoins.map((coin, i) => `
${i + 1}. ${coin.symbol}
   - Liquidity: ${coin.liquidity}
   - 24h Volume: ${coin.volume24h}
   - Holders: ${coin.holders}
   - Smart Money Wallets: ${coin.smartMoney}
`).join('')}

Trading Rules:
- Stop loss at -30%
- Take profit: 20% at 2x, 30% at 5x, 30% at 10x, 20% at 20x
- Max position size: 0.005 ETH
- Avoid tokens with <$50k liquidity

Provide:
1. Which token looks most promising and why?
2. Risk assessment for each token
3. Recommended action (BUY/WAIT/AVOID)
4. Any red flags or honeypot indicators`;

  try {
    console.log('📤 Sending analysis request to Llama...\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are an expert meme coin trader focused on maximizing profits while avoiding scams.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.log('⚠️ Llama not responding. Checking connection...');

      // Try simpler request
      const testResponse = await fetch('http://127.0.0.1:11434/api/tags');
      if (!testResponse.ok) {
        console.log('❌ Ollama service not accessible');
        console.log('   Run: ollama serve');
        console.log('   Then: ollama pull llama3.1:8b');
      }
      return;
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    console.log('🎯 LLAMA ANALYSIS:\n');
    console.log('═'.repeat(60));
    console.log(analysis);
    console.log('═'.repeat(60));

  } catch (error) {
    console.log('📡 Simulating Llama analysis (service not available):\n');

    // Provide simulated analysis
    console.log('═'.repeat(60));
    console.log(`
🤖 SIMULATED LLAMA3.1 ANALYSIS:

Based on the market data, here's my analysis:

1. MOST PROMISING TOKEN: PEPE
   - Strong liquidity at $2.5M (well above $50k minimum)
   - High 24h volume of $500k (20% of liquidity - healthy)
   - 15,000 holders shows good distribution
   - 5 smart money wallets are tracking it

2. RISK ASSESSMENT:

   PEPE: LOW-MEDIUM RISK (Score: 7/10)
   ✅ Excellent liquidity
   ✅ Smart money presence
   ✅ High holder count
   ⚠️ Already established (less upside potential)

   WOJAK: MEDIUM RISK (Score: 5/10)
   ✅ Good liquidity at $800k
   ✅ Some smart money interest
   ⚠️ Lower volume/liquidity ratio
   ⚠️ Moderate holder base

   SHIB2.0: HIGH RISK - AVOID (Score: 2/10)
   ❌ Liquidity at minimum threshold
   ❌ No smart money interest
   ❌ Very low holder count
   ❌ Possible honeypot risk

3. RECOMMENDED ACTION: WAIT

   While PEPE shows strong fundamentals, current market conditions suggest:
   - Gas price is reasonable at 15 gwei
   - No immediate entry signals from smart money
   - Better to wait for a dip or new token launch

4. RED FLAGS DETECTED:
   ⚠️ SHIB2.0 shows honeypot characteristics:
      - Exactly at $50k liquidity (suspicious round number)
      - Zero smart money (they may know something)
      - Very low holder/liquidity ratio
      - Name riding on existing token (SHIB)

STRATEGY RECOMMENDATION:
- Set alerts for PEPE if it dips 10-15%
- Monitor for new token launches with smart money
- Avoid SHIB2.0 completely
- Keep scanning every 60 seconds for opportunities

With 0.064 ETH available and 0.005 ETH max position:
- You can open up to 12 positions
- Focus on quality over quantity
- Wait for high-confidence setups
`);
    console.log('═'.repeat(60));
  }
}

// Run the test
testLlamaAnalysis().catch(console.error);