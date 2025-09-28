#!/usr/bin/env tsx
/**
 * Advanced Runtime - Entry point for complex Ethereum analysis
 */

import "dotenv/config";
import { orchestrateAdvanced } from "./orchestrator-advanced.js";
import { database } from "./tools/data/db.js";
import readline from "readline";

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Ethereum Intelligence System - ADVANCED              ║
║     Complex Multi-Step Analysis Engine                   ║
║     Powered by Claude + Advanced Pattern Detection       ║
╚══════════════════════════════════════════════════════════╝
`);

  // Initialize database tables
  console.log("📊 Initializing database...");
  try {
    await database.createBlockchainTables();
    console.log("✅ Database ready");
  } catch (error) {
    console.log("⚠️  Database initialization warning:", error);
  }

  // Show capabilities
  console.log("\n🚀 Advanced Capabilities:");
  console.log("   • Recursive task decomposition (50-100+ parallel tasks)");
  console.log("   • Swing trading pattern detection");
  console.log("   • Profitable wallet identification");
  console.log("   • Token launch analysis");
  console.log("   • Arbitrage opportunity detection");
  console.log("   • Long-running analysis (2-5 minutes for complex queries)");
  console.log("");

  // Check if a question was provided via command line
  const cliQuestion = process.argv.slice(2).join(" ");
  
  if (cliQuestion) {
    // Single question mode
    console.log("─".repeat(60));
    const startTime = Date.now();
    
    try {
      const answer = await orchestrateAdvanced(cliQuestion);
      
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log("\n" + "═".repeat(60));
      console.log(`📝 ANSWER (completed in ${elapsed}s):`);
      console.log("═".repeat(60));
      console.log(answer);
      console.log("═".repeat(60) + "\n");
    } catch (error) {
      console.error("❌ Analysis failed:", error);
    }
  } else {
    // Interactive mode
    console.log("💡 Interactive mode - type 'exit' to quit");
    console.log("💡 Example complex questions:");
    console.log('   "Find all wallets that consistently profit from new token launches in the last 7 days"');
    console.log('   "Identify swing traders focusing on ERC20 tokens with >50% success rate"');
    console.log('   "Detect arbitrage opportunities across major DEXs in the last 24 hours"');
    console.log('   "Map relationships between top 100 most profitable wallets"');
    console.log('   "Analyze pump and dump patterns in tokens launched this week"');
    console.log("");
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "🔍 Advanced> "
    });
    
    rl.prompt();
    
    rl.on("line", async (line) => {
      const question = line.trim();
      
      if (question.toLowerCase() === "exit") {
        console.log("👋 Goodbye!");
        rl.close();
        process.exit(0);
      }
      
      if (question) {
        console.log("─".repeat(60));
        const startTime = Date.now();
        
        try {
          const answer = await orchestrateAdvanced(question);
          
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log("\n" + "═".repeat(60));
          console.log(`📝 ANSWER (completed in ${elapsed}s):`);
          console.log("═".repeat(60));
          console.log(answer);
          console.log("═".repeat(60) + "\n");
        } catch (error) {
          console.error("❌ Analysis failed:", error);
        }
      }
      
      rl.prompt();
    });
    
    rl.on("close", () => {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    });
  }
}

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});

// Run main function
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});