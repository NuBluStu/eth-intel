#!/usr/bin/env tsx
/**
 * Direct Swing Trading Analysis
 * Finds profitable swing traders without orchestrator compilation issues
 */

import "dotenv/config";
import { OpenAI } from "openai";

// Direct imports to avoid compilation issues
async function getBlockNumber(): Promise<number> {
  const RPC_URL = process.env.RPC_HTTP || "http://127.0.0.1:8545";
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: []
    })
  });
  const json = await response.json();
  return parseInt(json.result, 16);
}

async function getLogs(filter: any): Promise<any[]> {
  const RPC_URL = process.env.RPC_HTTP || "http://127.0.0.1:8545";
  const params: any = {};
  
  if (filter.fromBlock !== undefined) {
    params.fromBlock = typeof filter.fromBlock === 'number' 
      ? `0x${filter.fromBlock.toString(16)}` 
      : filter.fromBlock;
  }
  
  if (filter.toBlock !== undefined) {
    params.toBlock = typeof filter.toBlock === 'number' 
      ? `0x${filter.toBlock.toString(16)}` 
      : filter.toBlock;
  }
  
  if (filter.address) params.address = filter.address;
  if (filter.topics) params.topics = filter.topics;
  
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [params]
    })
  });
  const json = await response.json();
  return json.result || [];
}

async function analyzeWithLlama(data: any): Promise<string> {
  const baseURL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1";
  const model = process.env.LLM_MODEL || "llama3.1:8b";
  
  const client = new OpenAI({
    baseURL,
    apiKey: "ollama"
  });
  
  const prompt = `Analyze this Ethereum trading data and identify profitable swing traders.
Focus on wallets that:
1. Buy tokens early (within first hour of launch)
2. Sell within 24-48 hours
3. Have consistent profitability

Data: ${JSON.stringify(data, null, 2)}

Provide a summary of:
- Top profitable wallets
- Their trading patterns
- Win rates
- Average hold times`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 2048,
    messages: [
      { role: "system", content: "You are an expert Ethereum blockchain analyst specializing in swing trading patterns." },
      { role: "user", content: prompt }
    ]
  });
  
  return response.choices[0]?.message?.content || "No analysis available";
}

async function findSwingTraders() {
  console.log("🎯 Swing Trading Analysis - Direct Mode");
  console.log("=" .repeat(70));
  console.log("Period: Last 3 days");
  console.log("Focus: ERC20 swing trading patterns");
  console.log("=" .repeat(70) + "\n");
  
  try {
    // Step 1: Get current block
    console.log("📊 Getting current block number...");
    const currentBlock = await getBlockNumber();
    console.log(`   Current block: ${currentBlock}`);
    
    // Step 2: Calculate block range (3 days = ~21,600 blocks)
    const blocksIn3Days = 21600;
    const fromBlock = currentBlock - blocksIn3Days;
    console.log(`   Analyzing blocks ${fromBlock} to ${currentBlock}`);
    
    // Step 3: Find ERC20 Transfer events in chunks
    console.log("\n🔍 Searching for ERC20 transfers...");
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    
    const allLogs = [];
    const chunkSize = 2000;
    let processed = 0;
    
    for (let start = fromBlock; start <= currentBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, currentBlock);
      
      const logs = await getLogs({
        fromBlock: start,
        toBlock: end,
        topics: [transferTopic]
      });
      
      allLogs.push(...logs);
      processed += chunkSize;
      
      const progress = Math.min(100, (processed / blocksIn3Days) * 100);
      process.stdout.write(`\r   Progress: ${progress.toFixed(1)}% (${allLogs.length} transfers found)`);
    }
    console.log("\n");
    
    // Step 4: Process transfer data
    console.log("📈 Processing transfer data...");
    
    // Group transfers by token
    const tokenTransfers = new Map<string, any[]>();
    for (const log of allLogs) {
      const token = log.address.toLowerCase();
      if (!tokenTransfers.has(token)) {
        tokenTransfers.set(token, []);
      }
      tokenTransfers.get(token)!.push(log);
    }
    
    console.log(`   Found ${tokenTransfers.size} unique tokens`);
    console.log(`   Total transfers: ${allLogs.length}`);
    
    // Find new tokens (those with first transfer in our range)
    const newTokens = [];
    for (const [token, transfers] of tokenTransfers) {
      const firstBlock = Math.min(...transfers.map((t: any) => parseInt(t.blockNumber, 16)));
      if (firstBlock >= fromBlock + 7200) { // Token appeared in last 2 days
        newTokens.push({
          token,
          firstBlock,
          transferCount: transfers.length,
          uniqueAddresses: new Set(transfers.map((t: any) => [
            "0x" + t.topics[1]?.slice(26),
            "0x" + t.topics[2]?.slice(26)
          ]).flat()).size
        });
      }
    }
    
    console.log(`   Found ${newTokens.length} new tokens`);
    
    // Step 5: Analyze with Llama
    console.log("\n🤖 Analyzing with Llama 3.1...");
    
    const analysisData = {
      summary: {
        totalTokens: tokenTransfers.size,
        newTokens: newTokens.length,
        totalTransfers: allLogs.length,
        blockRange: { from: fromBlock, to: currentBlock }
      },
      topNewTokens: newTokens
        .sort((a, b) => b.transferCount - a.transferCount)
        .slice(0, 10)
        .map(t => ({
          token: t.token,
          launchBlock: t.firstBlock,
          transfers: t.transferCount,
          uniqueTraders: t.uniqueAddresses
        })),
      sampleTransfers: allLogs.slice(0, 100).map((log: any) => ({
        token: log.address,
        from: "0x" + log.topics[1]?.slice(26),
        to: "0x" + log.topics[2]?.slice(26),
        block: parseInt(log.blockNumber, 16),
        tx: log.transactionHash
      }))
    };
    
    const analysis = await analyzeWithLlama(analysisData);
    
    console.log("\n" + "=" .repeat(70));
    console.log("📊 ANALYSIS RESULTS");
    console.log("=" .repeat(70) + "\n");
    console.log(analysis);
    
    // Step 6: Summary statistics
    console.log("\n" + "=" .repeat(70));
    console.log("📈 SUMMARY STATISTICS");
    console.log("=" .repeat(70));
    console.log(`• Blocks analyzed: ${blocksIn3Days.toLocaleString()}`);
    console.log(`• Total transfers: ${allLogs.length.toLocaleString()}`);
    console.log(`• Unique tokens: ${tokenTransfers.size}`);
    console.log(`• New tokens (last 2 days): ${newTokens.length}`);
    console.log(`• Most active new token: ${newTokens[0]?.transferCount || 0} transfers`);
    
  } catch (error) {
    console.error("\n❌ Analysis failed:", error);
    process.exit(1);
  }
}

// Run the analysis
findSwingTraders().catch(console.error);