#!/usr/bin/env tsx
/**
 * Direct test of the v2 system components
 */

import "dotenv/config";
import { ethRpc } from "./src/tools/data/ethRpc.js";
import { database } from "./src/tools/data/db.js";
import { analysisUtils } from "./src/tools/analysis/utils.js";

async function testSystem() {
  console.log("Testing Ethereum Intelligence System v2.0\n");
  console.log("=" .repeat(60));
  
  try {
    // Test 1: Get current block
    console.log("\n📊 Test 1: Get current block number");
    const blockNumber = await ethRpc.getBlockNumber();
    console.log(`   Current block: ${blockNumber}`);
    
    // Test 2: Get gas price
    console.log("\n⛽ Test 2: Get current gas price");
    const gasPrice = await ethRpc.gasPrice();
    console.log(`   Gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} Gwei)`);
    
    // Test 3: Get last 5 blocks with gas usage
    console.log("\n📦 Test 3: Get last 5 blocks with gas usage");
    for (let i = 0; i < 5; i++) {
      const block = await ethRpc.getBlock(blockNumber - i, false);
      console.log(`   Block ${parseInt(block.number, 16)}: Gas used ${parseInt(block.gasUsed, 16).toLocaleString()} / ${parseInt(block.gasLimit, 16).toLocaleString()}`);
    }
    
    // Test 4: Check if an address is a contract
    console.log("\n🔍 Test 4: Check if USDT is a contract");
    const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const isContract = await ethRpc.isContract(usdtAddress);
    console.log(`   USDT (${usdtAddress}): ${isContract ? "✅ Contract" : "❌ Not a contract"}`);
    
    // Test 5: Get some logs
    console.log("\n📝 Test 5: Get recent ERC20 Transfer events");
    const logs = await ethRpc.getLogs({
      fromBlock: blockNumber - 10,
      toBlock: blockNumber,
      topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"] // Transfer event
    });
    console.log(`   Found ${logs.length} Transfer events in last 10 blocks`);
    
    // Test 6: Pattern detection on sample data
    console.log("\n🔎 Test 6: Pattern detection (sample data)");
    const samplePrices = [
      { timestamp: 1000, price: 100 },
      { timestamp: 2000, price: 110 },
      { timestamp: 3000, price: 300 }, // 3x pump
      { timestamp: 4000, price: 280 },
      { timestamp: 5000, price: 90 }   // dump
    ];
    const pumpDump = analysisUtils.detectPumpAndDump(samplePrices, 2.0, 10000);
    if (pumpDump) {
      console.log(`   ⚠️  Pump & Dump detected! ${pumpDump.data.maxIncrease}x increase`);
    } else {
      console.log(`   ✅ No pump & dump pattern detected`);
    }
    
    // Test 7: Portfolio analysis (sample data)
    console.log("\n💼 Test 7: Portfolio analysis (sample data)");
    const sampleHoldings = [
      { token: "ETH", balance: BigInt("1000000000000000000") }, // 1 ETH
      { token: "USDT", balance: BigInt("1000000000") }, // 1000 USDT (6 decimals)
      { token: "SHIB", balance: BigInt("1000000000000000000000") } // Many SHIB
    ];
    const portfolio = analysisUtils.analyzePortfolio(sampleHoldings);
    console.log(`   Token count: ${portfolio.tokenCount}`);
    console.log(`   Diversification score: ${portfolio.diversification.toFixed(3)}`);
    console.log(`   Risk score: ${portfolio.riskScore.toFixed(3)}`);
    
    console.log("\n" + "=" .repeat(60));
    console.log("✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  }
}

testSystem();