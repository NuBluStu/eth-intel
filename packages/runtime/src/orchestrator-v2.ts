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

// Initialize OpenAI client
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1",
  apiKey: process.env.OPENAI_API_KEY || "ollama"
});

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
  const systemPrompt = `You are an Ethereum research assistant with access to comprehensive blockchain tools.

Available tools (use exact names):
- ethRpc.getBlock, ethRpc.getBlockNumber, ethRpc.getTransaction, ethRpc.getBalance, ethRpc.getLogs, ethRpc.getLogsChunked
- beacon.getValidators, beacon.getChainHead, beacon.getNetworkStatistics, beacon.getValidatorPerformance
- db.query, db.materialize, db.getTopTokensByVolume, db.getWalletActivity
- analysis.detectPumpAndDump, analysis.findRelatedWallets, analysis.analyzePortfolio

Create a detailed plan to answer the question. Output ONLY valid JSON.

You can reference previous step results using {{stepId}} in args.
Mark steps as parallel:true if they can run simultaneously.

Example plan:
{
  "goal": "Analyze wallet activity",
  "steps": [
    {
      "id": "s1",
      "tool": "ethRpc.getBlockNumber",
      "args": {},
      "description": "Get current block"
    },
    {
      "id": "s2", 
      "tool": "ethRpc.getBalance",
      "args": {"address": "0x123...", "blockTag": "latest"},
      "description": "Check wallet balance"
    },
    {
      "id": "s3",
      "tool": "db.getWalletActivity",
      "args": {"address": "0x123..."},
      "parallel": true,
      "description": "Get transaction history"
    }
  ]
}`;

  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${question}\n\nGenerate a JSON plan to answer this question.` }
        ]
      });
      
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