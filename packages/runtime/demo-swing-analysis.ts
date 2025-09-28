#!/usr/bin/env tsx
/**
 * Demo Swing Trading Analysis with Llama
 * Uses sample data to demonstrate the analysis
 */

import "dotenv/config";
import { OpenAI } from "openai";

async function analyzeWithLlama(prompt: string): Promise<string> {
  const baseURL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1";
  const model = process.env.LLM_MODEL || "llama3.1:8b";
  
  const client = new OpenAI({
    baseURL,
    apiKey: "ollama"
  });
  
  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 2048,
    messages: [
      { 
        role: "system", 
        content: "You are an expert Ethereum blockchain analyst specializing in identifying profitable swing traders. Analyze the data and provide actionable insights." 
      },
      { role: "user", content: prompt }
    ]
  });
  
  return response.choices[0]?.message?.content || "No analysis available";
}

// Sample data representing profitable swing traders
const SAMPLE_DATA = {
  analysis_period: "Last 3 days (blocks 23135000-23157000)",
  new_tokens_found: 47,
  total_wallets_analyzed: 2341,
  profitable_swing_traders: [
    {
      wallet: "0x742d35Cc6634C0532925a3b844Bc8e70f1658f9c",
      metrics: {
        total_trades: 23,
        profitable_trades: 19,
        win_rate: 82.6,
        total_profit_eth: 12.4,
        avg_hold_time_hours: 18.3,
        strategy: "early_entry_quick_flip"
      },
      recent_trades: [
        {
          token: "0xAI2024...def",
          token_name: "AI Agent Token",
          buy_time: "Hour 1 after launch",
          sell_time: "Hour 24",
          profit_percent: 287,
          profit_eth: 3.2
        },
        {
          token: "0xMEME99...abc",
          token_name: "Viral Meme Coin",
          buy_time: "Hour 0.5 after launch",
          sell_time: "Hour 12",
          profit_percent: 156,
          profit_eth: 1.8
        },
        {
          token: "0xDEFI88...xyz",
          token_name: "New DeFi Protocol",
          buy_time: "Hour 2 after launch",
          sell_time: "Hour 36",
          profit_percent: 92,
          profit_eth: 0.9
        }
      ]
    },
    {
      wallet: "0x3a9f92B8C4A5d7E2f6C8B1a4D7E9F3c2B8A6D5E4",
      metrics: {
        total_trades: 31,
        profitable_trades: 22,
        win_rate: 71.0,
        total_profit_eth: 8.7,
        avg_hold_time_hours: 22.1,
        strategy: "momentum_swing"
      },
      recent_trades: [
        {
          token: "0xGAME77...qrs",
          token_name: "Gaming Token",
          buy_time: "Hour 3 after launch",
          sell_time: "Hour 28",
          profit_percent: 124,
          profit_eth: 2.1
        }
      ]
    },
    {
      wallet: "0x8B4E2f9C1D6A3e5F7b0a9c8d6e4f2a1b3c5d7e9f",
      metrics: {
        total_trades: 18,
        profitable_trades: 15,
        win_rate: 83.3,
        total_profit_eth: 6.3,
        avg_hold_time_hours: 14.7,
        strategy: "volume_surge_trader"
      }
    }
  ],
  patterns_detected: {
    common_entry_time: "0-3 hours after token launch",
    common_exit_time: "12-36 hours after entry",
    preferred_tokens: ["New launches with social buzz", "AI/Gaming narratives", "Small cap with high volume"],
    risk_management: "Quick exit on 20%+ gains or 10% losses"
  },
  top_performing_tokens: [
    { name: "AI Agent Token", total_volume_eth: 4520, early_buyer_profits: "150-400%" },
    { name: "Viral Meme Coin", total_volume_eth: 2890, early_buyer_profits: "80-250%" },
    { name: "Gaming Token", total_volume_eth: 1670, early_buyer_profits: "50-180%" }
  ]
};

async function runDemo() {
  console.log("🎯 Swing Trading Analysis Demo with Llama 3.1");
  console.log("=" .repeat(70));
  console.log("This demo analyzes sample data to identify profitable swing traders");
  console.log("=" .repeat(70) + "\n");
  
  const prompt = `Analyze this Ethereum swing trading data and provide insights:

${JSON.stringify(SAMPLE_DATA, null, 2)}

Based on this data, please provide:
1. Summary of the most profitable swing trading wallets
2. Common patterns and strategies they use
3. Specific recommendations for finding similar profitable opportunities
4. Risk factors to consider
5. Which wallets to follow for future trades

Format your response clearly with sections and bullet points.`;

  try {
    console.log("🤖 Sending data to Llama for analysis...\n");
    const analysis = await analyzeWithLlama(prompt);
    
    console.log("=" .repeat(70));
    console.log("📊 LLAMA ANALYSIS RESULTS");
    console.log("=" .repeat(70) + "\n");
    console.log(analysis);
    
    console.log("\n" + "=" .repeat(70));
    console.log("📈 KEY METRICS FROM DATA");
    console.log("=" .repeat(70));
    console.log(`• Top Trader: ${SAMPLE_DATA.profitable_swing_traders[0].wallet.slice(0, 10)}...`);
    console.log(`• Best Win Rate: ${SAMPLE_DATA.profitable_swing_traders[0].metrics.win_rate}%`);
    console.log(`• Highest Profit: ${SAMPLE_DATA.profitable_swing_traders[0].metrics.total_profit_eth} ETH`);
    console.log(`• Optimal Hold Time: ${SAMPLE_DATA.patterns_detected.common_exit_time}`);
    console.log(`• Best Entry Window: ${SAMPLE_DATA.patterns_detected.common_entry_time}`);
    
  } catch (error) {
    console.error("\n❌ Analysis failed:", error);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);