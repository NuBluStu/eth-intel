/**
 * Enhanced Orchestrator with Intermediate Memory Store
 * Manages multi-step planning and execution with result storage
 */

import { OpenAI } from "openai";
import { z } from "zod";
import { ethRpc } from "./tools/data/ethRpc.js";
import { beaconApi } from "./tools/data/beaconApi.js";
import { database } from "./tools/data/db.js";
import { analysisUtils } from "./tools/analysis/utils.js";
import { swingTrading } from "./tools/analysis/swingTrading.js";

// Initialize OpenAI client
const isOpenAI = process.env.LLM_BASE_URL?.includes('openai.com');
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1",
  apiKey: isOpenAI ? process.env.OPENAI_API_KEY : "ollama"
});

if (isOpenAI && !process.env.OPENAI_API_KEY) {
  console.error("❌ OpenAI API key not found! Please set OPENAI_API_KEY in .env");
  process.exit(1);
}

const MODEL = process.env.LLM_MODEL || "llama3.1:8b";

// Step definition with enhanced tool list
const Step = z.object({
  id: z.string(),
  tool: z.string(), // Now supports namespaced tools like "ethRpc.getBlock"
  args: z.record(z.any()),
  dependsOn: z.array(z.string()).optional(), // Can reference previous step IDs
  parallel: z.boolean().optional(), // Can run in parallel with other steps
  saveAs: z.string().optional(), // Save result with this key
  description: z.string().optional()
});

const Plan = z.object({
  goal: z.string(),
  steps: z.array(Step).min(1).max(20) // Allow more complex plans
});

// Session memory store
class SessionMemory {
  private store: Map<string, any> = new Map();
  
  set(key: string, value: any) {
    this.store.set(key, value);
    console.log(`💾 Stored result as: ${key}`);
  }
  
  get(key: string): any {
    return this.store.get(key);
  }
  
  has(key: string): boolean {
    return this.store.has(key);
  }
  
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }
  
  clear() {
    this.store.clear();
  }
  
  // Replace references like {{stepId}} with actual values
  resolveReferences(obj: any): any {
    if (typeof obj === 'string') {
      // Check for references like {{step1}}
      const matches = obj.match(/\{\{(\w+)\}\}/g);
      if (matches) {
        let resolved = obj;
        for (const match of matches) {
          const key = match.slice(2, -2);
          if (this.has(key)) {
            const value = this.get(key);
            resolved = resolved.replace(match, JSON.stringify(value));
          }
        }
        return resolved;
      }
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveReferences(item));
    } else if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveReferences(value);
      }
      return resolved;
    }
    return obj;
  }
}

// Tool registry
const TOOLS = {
  // Ethereum RPC
  "ethRpc.getBlock": ethRpc.getBlock,
  "ethRpc.getBlockNumber": ethRpc.getBlockNumber,
  "ethRpc.getTransaction": ethRpc.getTransaction,
  "ethRpc.getTransactionReceipt": ethRpc.getTransactionReceipt,
  "ethRpc.getBalance": ethRpc.getBalance,
  "ethRpc.getCode": ethRpc.getCode,
  "ethRpc.getLogs": ethRpc.getLogs,
  "ethRpc.getLogsChunked": ethRpc.getLogsChunked,
  "ethRpc.ethCall": ethRpc.ethCall,
  "ethRpc.gasPrice": ethRpc.gasPrice,
  "ethRpc.getGasPrice": ethRpc.gasPrice, // Alias
  "ethRpc.traceTransaction": ethRpc.traceTransaction,
  "ethRpc.traceBlock": ethRpc.traceBlock,
  
  // Beacon API
  "beacon.getValidators": beaconApi.getValidators,
  "beacon.getValidatorBalances": beaconApi.getValidatorBalances,
  "beacon.getChainHead": beaconApi.getChainHead,
  "beacon.getBlock": beaconApi.getBlock,
  "beacon.getNetworkStatistics": beaconApi.getNetworkStatistics,
  "beacon.getValidatorPerformance": beaconApi.getValidatorPerformance,
  
  // Database
  "db.query": database.query,
  "db.materialize": database.materialize,
  "db.getTopTokensByVolume": database.getTopTokensByVolume,
  "db.getWalletActivity": database.getWalletActivity,
  "db.exportToParquet": database.exportToParquet,
  "db.importParquet": database.importParquet,
  
  // Analysis
  "analysis.detectPumpAndDump": analysisUtils.detectPumpAndDump,
  "analysis.detectWashTrading": analysisUtils.detectWashTrading,
  "analysis.findRelatedWallets": analysisUtils.findRelatedWallets,
  "analysis.analyzePortfolio": analysisUtils.analyzePortfolio,
  "analysis.backtest": analysisUtils.backtest,
  "analysis.mean": analysisUtils.mean,
  "analysis.median": analysisUtils.median,
  "analysis.standardDeviation": analysisUtils.standardDeviation,
  
  // Swing Trading Analysis
  "swingTrading.findNewERC20Tokens": swingTrading.findNewERC20Tokens,
  "swingTrading.findEarlyBuyers": swingTrading.findEarlyBuyers,
  "swingTrading.trackWalletProfits": swingTrading.trackWalletProfits,
  "swingTrading.findProfitableSwingTraders": swingTrading.findProfitableSwingTraders,
  "swingTrading.detectSwingPatterns": swingTrading.detectSwingPatterns
};

// Main orchestration function
export async function orchestrate(question: string): Promise<string> {
  console.log("🎯 Question:", question);
  console.log("📝 Generating plan...\n");
  
  const memory = new SessionMemory();
  const plan = await generatePlan(question);
  
  console.log("📋 Plan:", JSON.stringify(plan, null, 2));
  console.log("\n🚀 Executing steps...\n");
  
  // Execute steps
  const completedSteps = new Set<string>();
  const stepResults = new Map<string, any>();
  
  while (completedSteps.size < plan.steps.length) {
    // Find steps that can be executed
    const executableSteps = plan.steps.filter(step => {
      if (completedSteps.has(step.id)) return false;
      
      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        return step.dependsOn.every(dep => completedSteps.has(dep));
      }
      
      return true;
    });
    
    // Execute in parallel if possible
    const parallelSteps = executableSteps.filter(s => s.parallel !== false);
    const sequentialSteps = executableSteps.filter(s => s.parallel === false);
    
    // Execute parallel steps
    if (parallelSteps.length > 0) {
      const promises = parallelSteps.map(async step => {
        const resolvedArgs = memory.resolveReferences(step.args);
        const result = await executeStep(step, resolvedArgs);
        
        if (step.saveAs) {
          memory.set(step.saveAs, result);
        }
        memory.set(step.id, result);
        stepResults.set(step.id, result);
        
        return { step, result };
      });
      
      await Promise.all(promises);
      parallelSteps.forEach(step => completedSteps.add(step.id));
    }
    
    // Execute sequential steps one by one
    for (const step of sequentialSteps) {
      const resolvedArgs = memory.resolveReferences(step.args);
      const result = await executeStep(step, resolvedArgs);
      
      if (step.saveAs) {
        memory.set(step.saveAs, result);
      }
      memory.set(step.id, result);
      stepResults.set(step.id, result);
      completedSteps.add(step.id);
    }
  }
  
  console.log("\n✅ All steps completed\n");
  console.log("🧠 Generating final answer...\n");
  
  // Generate final answer
  const answer = await synthesizeAnswer(question, plan, memory.getAll());
  
  return answer;
}

async function generatePlan(question: string): Promise<z.infer<typeof Plan>> {
  const systemPrompt = `You are an expert Ethereum research assistant. Create a JSON plan to answer questions using available blockchain tools.

AVAILABLE TOOLS:
Ethereum RPC:
- ethRpc.getBlockNumber() → returns number
- ethRpc.getBlock(numberOrHash, includeTransactions) → returns block object
- ethRpc.getBalance(address, blockTag) → returns bigint
- ethRpc.getLogs({fromBlock, toBlock, address?, topics?}) → returns logs array
- ethRpc.getLogsChunked({fromBlock, toBlock, address?, topics?}, chunkSize?) → auto-chunks large ranges
- ethRpc.getTransaction(hash) → returns tx object
- ethRpc.gasPrice() → returns bigint
- ethRpc.isContract(address) → returns boolean

Beacon/Consensus:
- beacon.getChainHead() → returns head info
- beacon.getValidators(stateId, status?) → returns validators
- beacon.getNetworkStatistics() → returns network stats

Database:
- db.query(sql, params?) → execute SQL query
- db.materialize(name, selectSql) → save query as table
- db.getTopTokensByVolume(days?) → returns top tokens
- db.getWalletActivity(address) → returns activity summary

Analysis:
- analysis.detectPumpAndDump(prices, threshold?, timeWindow?) → detect pump & dump
- analysis.findRelatedWallets(transactions) → find wallet relationships
- analysis.analyzePortfolio(holdings) → analyze portfolio metrics
- analysis.mean(values), analysis.median(values), analysis.standardDeviation(values)

Swing Trading:
- swingTrading.findNewERC20Tokens(days) → find tokens launched in last N days
- swingTrading.findEarlyBuyers(token, withinBlocks?) → find early token buyers
- swingTrading.trackWalletProfits(wallet, tokens[]) → track wallet's profits
- swingTrading.findProfitableSwingTraders(days?, minWinRate?, minTrades?) → find profitable traders
- swingTrading.detectSwingPatterns(transactions) → detect swing trading patterns

IMPORTANT RULES:
1. Output ONLY valid JSON, no markdown or explanations
2. Use exact tool names from the list above
3. For block ranges: get current block first, then calculate ranges as numbers
4. ERC20 Transfer event topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
5. You can reference previous results with {{stepId}} notation
6. Use parallel:true for independent steps

Example for "Find profitable wallets in last 24 hours":
{
  "goal": "Find profitable wallets in last 24 hours",
  "steps": [
    {
      "id": "s1",
      "tool": "ethRpc.getBlockNumber",
      "args": {},
      "description": "Get current block"
    },
    {
      "id": "s2",
      "tool": "ethRpc.getLogsChunked",
      "args": {
        "fromBlock": 23131000,
        "toBlock": 23138000,
        "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
      },
      "description": "Get Transfer events for last 24h (assuming current block ~23138000)"
    },
    {
      "id": "s3",
      "tool": "analysis.findRelatedWallets",
      "args": {"transactions": "{{s2}}"},
      "description": "Analyze wallet relationships"
    }
  ]
}`;

  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const chatOptions: any = {
        model: MODEL,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${question}\n\nGenerate a JSON plan to answer this question.` }
        ]
      };
      
      // Use JSON mode for GPT-4
      if (isOpenAI && MODEL.includes('gpt-4')) {
        chatOptions.response_format = { type: "json_object" };
      }
      
      const response = await client.chat.completions.create(chatOptions);
      
      let content = response.choices[0]?.message?.content || "{}";
      
      // Clean up response
      content = content.trim();
      content = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      
      const json = JSON.parse(content);
      return Plan.parse(json);
    } catch (e) {
      lastError = e;
      console.log(`Plan generation attempt ${attempt} failed:`, e);
    }
  }
  
  // Fallback plan
  console.log("Using fallback plan");
  return {
    goal: "Get basic blockchain info",
    steps: [
      {
        id: "s1",
        tool: "ethRpc.getBlockNumber",
        args: {}
      }
    ]
  };
}

async function executeStep(step: z.infer<typeof Step>, args: any): Promise<any> {
  console.log(`⚡ Executing ${step.id}: ${step.tool}`);
  if (step.description) {
    console.log(`   ${step.description}`);
  }
  
  const tool = TOOLS[step.tool as keyof typeof TOOLS];
  if (!tool) {
    throw new Error(`Unknown tool: ${step.tool}`);
  }
  
  try {
    const result = await tool(args);
    console.log(`   ✓ ${step.id} completed`);
    return result;
  } catch (error) {
    console.error(`   ✗ ${step.id} failed:`, error);
    throw error;
  }
}

async function synthesizeAnswer(
  question: string,
  plan: z.infer<typeof Plan>,
  results: Record<string, any>
): Promise<string> {
  const systemPrompt = `You are an Ethereum analyst. 
Using the plan execution results, provide a comprehensive answer to the user's question.
Include concrete numbers, specific findings, and actionable insights.
Format your response clearly with sections if needed.`;

  // Prepare a summary of results
  const resultSummary = Object.entries(results).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: Array with ${value.length} items`;
    } else if (typeof value === 'object' && value !== null) {
      return `${key}: ${JSON.stringify(value, null, 2).substring(0, 200)}...`;
    } else {
      return `${key}: ${value}`;
    }
  }).join("\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: `Question: ${question}

Plan goal: ${plan.goal}

Execution results:
${resultSummary}

Please provide a complete answer to the original question.`
      }
    ]
  });

  return response.choices[0]?.message?.content || "Unable to generate answer";
}