import "dotenv/config";
import { answer } from "./orchestrator.js";

async function main() {
  const q = process.argv.slice(2).join(" ") || "Find the most profitable wallets in the last 5 days.";
  console.log(`\n📋 Question: ${q}\n`);
  console.log("🤔 Planning and executing...\n");
  
  try {
    const out = await answer(q);
    console.log("\n=== ANSWER ===\n" + out);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
});