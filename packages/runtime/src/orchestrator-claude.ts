/**
 * Claude-powered Orchestrator
 * Uses Anthropic's Claude API for superior reasoning and JSON generation
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ethRpc } from "./tools/data/ethRpc.js";
import { beaconApi } from "./tools/data/beaconApi.js";
import { database } from "./tools/data/db.js";
import { analysisUtils } from "./tools/analysis/utils.js";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ""
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Anthropic API key not found! Please set ANTHROPIC_API_KEY in .env");
  console.error("   Get your key at: https://console.anthropic.com/settings/keys");
  process.exit(1);
}

const MODEL = process.env.CLAUDE_MODEL || "claude-3-sonnet-20240229";

// Step definition
const Step = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.record(z.any()),
  dependsOn: z.array(z.string()).optional(),
  parallel: z.boolean().optional(),
  saveAs: z.string().optional(),
  description: z.string().optional()
});

const Plan = z.object({
  goal: z.string(),
  steps: z.array(Step).min(1).max(20)
});

// Session memory store (same as v2)
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
  
  resolveReferences(obj: any): any {
    if (typeof obj === 'string') {
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

// Tool registry (same as v2)
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
  "analysis.standardDeviation": analysisUtils.standardDeviation
};

// Main orchestration function
export async function orchestrate(question: string): Promise<string> {
  console.log("🎯 Question:", question);
  console.log("🤖 Using Claude:", MODEL);
  console.log("📝 Generating plan...\n");
  
  const memory = new SessionMemory();
  const plan = await generatePlan(question);
  
  console.log("📋 Plan:", JSON.stringify(plan, null, 2));
  console.log("\n🚀 Executing steps...\n");
  
  // Execute steps (same logic as v2)
  const completedSteps = new Set<string>();
  const stepResults = new Map<string, any>();
  
  while (completedSteps.size < plan.steps.length) {
    const executableSteps = plan.steps.filter(step => {
      if (completedSteps.has(step.id)) return false;
      if (step.dependsOn && step.dependsOn.length > 0) {
        return step.dependsOn.every(dep => completedSteps.has(dep));
      }
      return true;
    });
    
    const parallelSteps = executableSteps.filter(s => s.parallel !== false);
    const sequentialSteps = executableSteps.filter(s => s.parallel === false);
    
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
  
  const answer = await synthesizeAnswer(question, plan, memory.getAll());
  
  return answer;
}

async function generatePlan(question: string): Promise<z.infer<typeof Plan>> {
  const prompt = `You are an expert Ethereum research assistant. Your task is to create a JSON plan to answer the user's question using available blockchain tools.

<available_tools>
Ethereum RPC:
- ethRpc.getBlockNumber() → returns current block number
- ethRpc.getBlock(numberOrHash, includeTransactions) → returns block details
- ethRpc.getBalance(address, blockTag) → returns address balance
- ethRpc.getLogs({fromBlock, toBlock, address?, topics?}) → returns event logs
- ethRpc.getLogsChunked({fromBlock, toBlock, address?, topics?}, chunkSize?) → auto-chunks large log queries
- ethRpc.getTransaction(hash) → returns transaction details
- ethRpc.gasPrice() → returns current gas price
- ethRpc.isContract(address) → checks if address is a contract

Beacon/Consensus:
- beacon.getChainHead() → returns consensus layer head info
- beacon.getValidators(stateId, status?) → returns validator list
- beacon.getNetworkStatistics() → returns network statistics

Database:
- db.query(sql, params?) → execute SQL query
- db.materialize(name, selectSql) → save query result as table
- db.getTopTokensByVolume(days?) → returns most active tokens
- db.getWalletActivity(address) → returns wallet activity summary

Analysis:
- analysis.detectPumpAndDump(prices, threshold?, timeWindow?) → detect pump & dump patterns
- analysis.detectWashTrading(trades, timeWindow?) → detect wash trading
- analysis.findRelatedWallets(transactions) → find wallet relationships
- analysis.analyzePortfolio(holdings) → analyze portfolio metrics
</available_tools>

<important_notes>
- Always get the current block number first for any time-based queries
- ERC20 Transfer event topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
- For block ranges: 1 hour ≈ 300 blocks, 1 day ≈ 7200 blocks
- You can reference previous step results using {{stepId}}
- Mark independent steps with parallel:true for concurrent execution
</important_notes>

<question>${question}</question>

Generate a JSON plan with this exact structure:
{
  "goal": "Brief description of what we're trying to achieve",
  "steps": [
    {
      "id": "s1",
      "tool": "exact.toolName",
      "args": { "arg1": value },
      "description": "What this step does"
    }
  ]
}

Important: Return ONLY the JSON object, no markdown formatting, no explanations.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });
    
    // Extract text from Claude's response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    let jsonText = content.text.trim();
    
    // Clean up if Claude added markdown despite instructions
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/, '');
    
    // Extract JSON if there's extra text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const json = JSON.parse(jsonText);
    return Plan.parse(json);
    
  } catch (error: any) {
    console.error("Plan generation failed:", error);
    
    // Fallback plan
    return {
      goal: "Get basic blockchain info",
      steps: [
        {
          id: "s1",
          tool: "ethRpc.getBlockNumber",
          args: {},
          description: "Get current block number"
        }
      ]
    };
  }
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
  // Prepare a summary of results
  const resultSummary = Object.entries(results).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: Array with ${value.length} items (sample: ${JSON.stringify(value.slice(0, 2))})`;
    } else if (typeof value === 'object' && value !== null) {
      return `${key}: ${JSON.stringify(value, null, 2).substring(0, 500)}...`;
    } else {
      return `${key}: ${value}`;
    }
  }).join("\n");

  const prompt = `You are an Ethereum analyst. Based on the execution results below, provide a comprehensive answer to the user's question.

<question>${question}</question>

<plan_goal>${plan.goal}</plan_goal>

<execution_results>
${resultSummary}
</execution_results>

Please provide:
1. A direct answer to the question
2. Key findings with specific numbers
3. Any important insights or patterns noticed
4. Recommendations if applicable

Be concise but thorough. Use markdown formatting for clarity.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return "Unable to generate answer";
  }
  
  return content.text;
}