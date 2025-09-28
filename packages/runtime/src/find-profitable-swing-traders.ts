#!/usr/bin/env tsx
/**
 * Find Profitable Swing Traders
 * Identifies wallets that consistently profit from new token launches
 * with a focus on swing trading ERC20 tokens
 */

import "dotenv/config";
import { orchestrate } from "./orchestrator-v2.js";

async function main() {
  console.log("🎯 Finding Profitable Swing Traders");
  console.log("=" .repeat(70));
  console.log("Analysis Period: Last 3 days");
  console.log("Focus: ERC20 swing trading (buy/sell within 24-48 hours)");
  console.log("=" .repeat(70) + "\n");

  const question = `
    Find all wallets that consistently profit from new token launches in the last 3 days.
    Focus on wallets that:
    1. Buy tokens within the first hour of launch
    2. Sell within 24-48 hours (swing trading)
    3. Have at least 3 profitable trades
    4. Show consistent profitability (>60% win rate)
    
    For each wallet, provide:
    - Wallet address
    - Number of trades
    - Win rate percentage
    - Total profit in ETH
    - Average hold time
    - Top 3 most profitable tokens traded
  `;

  try {
    console.log("🤖 Initiating analysis with Llama LLM...\n");
    const result = await orchestrate(question);
    
    console.log("\n" + "=" .repeat(70));
    console.log("📊 ANALYSIS RESULTS");
    console.log("=" .repeat(70) + "\n");
    console.log(result);
    
  } catch (error) {
    console.error("\n❌ Analysis failed:", error);
    process.exit(1);
  }
}

// Execute
main().catch(console.error);