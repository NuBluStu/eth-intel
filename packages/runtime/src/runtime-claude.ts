#!/usr/bin/env tsx
/**
 * Claude-powered Runtime
 * Entry point for Anthropic Claude-based orchestration
 */

import "dotenv/config";
import { orchestrate } from "./orchestrator-claude.js";
import { database } from "./tools/data/db.js";
import readline from "readline";

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Ethereum Intelligence System - Claude Edition        ║
║     Powered by Anthropic Claude                          ║
╚══════════════════════════════════════════════════════════╝
`);

  // Initialize database tables
  console.log("📊 Initializing database...");
  try {
    await database.createBlockchainTables();
    console.log("✅ Database ready\n");
  } catch (error) {
    console.log("⚠️  Database initialization warning:", error);
  }

  // Check if a question was provided via command line
  const cliQuestion = process.argv.slice(2).join(" ");
  
  if (cliQuestion) {
    // Single question mode
    console.log("─".repeat(60));
    const answer = await orchestrate(cliQuestion);
    console.log("\n" + "═".repeat(60));
    console.log("📝 ANSWER:");
    console.log("═".repeat(60));
    console.log(answer);
    console.log("═".repeat(60) + "\n");
  } else {
    // Interactive mode
    console.log("💡 Interactive mode - type 'exit' to quit");
    console.log("💡 Claude excels at:");
    console.log("   - Complex multi-step analysis");
    console.log("   - Pattern detection and relationship mapping");
    console.log("   - Following detailed instructions");
    console.log("   - Generating structured outputs");
    console.log("");
    console.log("💡 Example questions:");
    console.log("   - Find wallets that bought tokens that later 10x'd");
    console.log("   - Detect wash trading patterns in the last 1000 blocks");
    console.log("   - Analyze validator performance and slashing risks");
    console.log("   - Map relationships between top DEX traders");
    console.log("─".repeat(60) + "\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🔍 Claude> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const question = line.trim();
      
      if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
        console.log("\n👋 Goodbye!");
        rl.close();
        process.exit(0);
      }
      
      if (question.length === 0) {
        rl.prompt();
        return;
      }

      try {
        console.log("\n" + "─".repeat(60));
        const answer = await orchestrate(question);
        console.log("\n" + "═".repeat(60));
        console.log("📝 ANSWER:");
        console.log("═".repeat(60));
        console.log(answer);
        console.log("═".repeat(60) + "\n");
      } catch (error) {
        console.error("\n❌ Error:", error);
        console.log("─".repeat(60) + "\n");
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    });
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});