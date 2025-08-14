#!/usr/bin/env tsx
/**
 * Enhanced Runtime - Entry point for the upgraded eth-intel system
 */

import "dotenv/config";
import { orchestrate } from "./orchestrator-v2.js";
import { database } from "./tools/data/db.js";
import readline from "readline";

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Ethereum Intelligence System v2.0                    ║
║     Local Research Assistant                             ║
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
    console.log("💡 Examples:");
    console.log("   - Find wallets that bought tokens that later 10x'd");
    console.log("   - What's the current validator participation rate?");
    console.log("   - Analyze wash trading in the last 1000 blocks");
    console.log("   - Compare gas usage patterns between MEV and regular txs");
    console.log("─".repeat(60) + "\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🔍 Question> '
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