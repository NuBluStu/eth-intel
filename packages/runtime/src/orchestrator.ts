#!/usr/bin/env tsx
/**
 * LLM Orchestrator - Connects Llama to Ethereum Node
 *
 * This orchestrator allows Llama to directly access your local Ethereum node,
 * DuckDB, and all blockchain tools through a tool-calling interface.
 */

import * as ethRpc from './tools/data/ethRpc.js';
// import { database } from './tools/data/db.js';  // Commented out - DuckDB issue
import * as beaconApi from './tools/data/beaconApi.js';
import { TaskDecomposer } from './services/taskDecomposer.js';
import { tradingTools } from './tools/trading-tools.js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// LLM configuration
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'llama3.1:8b';

/**
 * Tool Registry - All functions Llama can call
 */
const TOOLS = {
  // Ethereum RPC Methods
  'eth.getBlock': ethRpc.getBlock,
  'eth.getBlockNumber': ethRpc.getBlockNumber,
  'eth.getTransaction': ethRpc.getTransaction,
  'eth.getTransactionReceipt': ethRpc.getTransactionReceipt,
  'eth.getBalance': ethRpc.getBalance,
  'eth.getCode': ethRpc.getCode,
  'eth.getLogs': ethRpc.getLogs,
  'eth.call': ethRpc.ethCall,
  'eth.gasPrice': ethRpc.gasPrice,

  // Database Methods (disabled for now - DuckDB issue)
  // 'db.query': database.query,
  // 'db.materialize': database.materialize,
  // 'db.getTopTokensByVolume': database.getTopTokensByVolume,
  // 'db.getWalletActivity': database.getWalletActivity,

  // Beacon Chain Methods (if Lighthouse is running)
  'beacon.getSlot': beaconApi.getCurrentSlot,
  'beacon.getValidators': beaconApi.getValidators,

  // Analysis Methods
  'task.decompose': TaskDecomposer.decompose,
  'task.expand': TaskDecomposer.expandPlan,

  // Trading Methods (WARNING: Can execute real trades!)
  'trade.buy': tradingTools.buyToken,
  'trade.sell': tradingTools.sellToken,
  'trade.positions': tradingTools.getCurrentPositions,
  'trade.stats': tradingTools.getTradingStats,
  'trade.analyze': tradingTools.analyzeToken,
  'trade.balance': tradingTools.getWalletBalance,
  'trade.emergency': tradingTools.emergencyStop,
};

/**
 * Tool descriptions for LLM context
 */
const TOOL_DESCRIPTIONS = `Available tools you can call:

ETHEREUM NODE TOOLS:
- eth.getBlock(numberOrHash, includeTransactions): Get block data
- eth.getBlockNumber(): Get current block number
- eth.getTransaction(hash): Get transaction details
- eth.getTransactionReceipt(hash): Get transaction receipt
- eth.getBalance(address): Get ETH balance of address
- eth.getCode(address): Check if address is a contract
- eth.getLogs(filter): Get event logs (filter has: fromBlock, toBlock, address, topics)
- eth.call(transaction): Call contract method without sending transaction
- eth.gasPrice(): Get current gas price

DATABASE TOOLS: (temporarily disabled - DuckDB dependency issue)

BEACON CHAIN TOOLS:
- beacon.getSlot(): Get current beacon chain slot
- beacon.getValidators(stateId): Get validator information

ANALYSIS TOOLS:
- task.decompose(question, context): Break complex question into subtasks
- task.expand(plan, question): Expand plan with more details

TRADING TOOLS (⚠️ WARNING: Can execute real trades!):
- trade.buy(tokenAddress, amountETH): Buy ERC-20 token with ETH
- trade.sell(tokenAddress, amountTokens): Sell ERC-20 token for ETH
- trade.positions(): Get current open positions
- trade.stats(): Get trading performance statistics
- trade.analyze(tokenAddress): Analyze token for trading opportunity
- trade.balance(): Get wallet balance
- trade.emergency(): Emergency close all positions

To call a tool, respond with:
TOOL_CALL: toolName(arg1, arg2, ...)

Example:
TOOL_CALL: eth.getBlockNumber()
TOOL_CALL: eth.getBalance("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb")
TOOL_CALL: trade.analyze("0x6982508145454Ce325dDbE47a25d4ec3d2311933")
TOOL_CALL: trade.buy("0x6982508145454Ce325dDbE47a25d4ec3d2311933", 0.001)`;

/**
 * Parse tool call from LLM response
 */
function parseToolCall(response: string): { tool: string; args: any[] } | null {
  const match = response.match(/TOOL_CALL:\s*([a-zA-Z.]+)\((.*?)\)/);
  if (!match) return null;

  const tool = match[1];
  const argsStr = match[2];

  // Parse arguments (simple JSON parsing)
  let args = [];
  if (argsStr) {
    try {
      // Handle both JSON and simple comma-separated args
      if (argsStr.includes('{') || argsStr.includes('[')) {
        args = [JSON.parse(argsStr)];
      } else {
        // Split by comma and clean up
        args = argsStr.split(',').map(arg => {
          arg = arg.trim();
          // Remove quotes if present
          if ((arg.startsWith('"') && arg.endsWith('"')) ||
              (arg.startsWith("'") && arg.endsWith("'"))) {
            return arg.slice(1, -1);
          }
          // Try to parse as number
          const num = Number(arg);
          if (!isNaN(num)) return num;
          // Return as string
          return arg;
        });
      }
    } catch (e) {
      console.error('Failed to parse args:', argsStr);
      args = [];
    }
  }

  return { tool, args };
}

/**
 * Execute tool call
 */
async function executeTool(toolName: string, args: any[]): Promise<any> {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { error: `Unknown tool: ${toolName}` };
  }

  try {
    console.log(`\n🔧 Executing: ${toolName}(${args.map(a => JSON.stringify(a)).join(', ')})`);
    const result = await tool(...args);

    // Convert BigInt to string for JSON serialization
    if (typeof result === 'bigint') {
      return result.toString();
    }

    return result;
  } catch (error) {
    return { error: `Tool execution failed: ${error.message}` };
  }
}

/**
 * Send prompt to Llama and get response
 */
async function queryLlama(prompt: string, context: string = ''): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: `You are an Ethereum blockchain analyst with direct access to a local Ethereum node and database.

${TOOL_DESCRIPTIONS}

${context}

Always explain what you're doing before making tool calls.
You can make multiple tool calls to answer complex questions.
After getting results, analyze them and provide insights.`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('❌ LLM query failed:', error);
    throw error;
  }
}

/**
 * Main orchestration loop
 */
async function orchestrate(question: string, maxIterations = 10): Promise<string> {
  let context = '';
  let iteration = 0;
  let finalAnswer = '';

  console.log(`\n🤖 Processing: "${question}"\n`);

  while (iteration < maxIterations) {
    iteration++;

    // Query Llama with current context
    const response = await queryLlama(question, context);
    console.log(`\n💭 Llama says:\n${response}\n`);

    // Check if Llama wants to call a tool
    const toolCall = parseToolCall(response);

    if (toolCall) {
      // Execute the tool
      const result = await executeTool(toolCall.tool, toolCall.args);

      // Add result to context for next iteration
      context += `\n\nTool call: ${toolCall.tool}(${toolCall.args.join(', ')})\n`;
      context += `Result: ${JSON.stringify(result, null, 2)}\n`;

      console.log(`\n📊 Result:`, result);

      // Continue conversation
      question = "Based on that result, continue your analysis or call another tool if needed.";
    } else {
      // No tool call, Llama is done
      finalAnswer = response;
      break;
    }
  }

  return finalAnswer || "Analysis complete.";
}

/**
 * Interactive CLI mode
 */
async function interactiveCLI() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     🤖 LLAMA + ETHEREUM ORCHESTRATOR                         ║
║                                                                ║
║     Your local Llama now has direct access to:               ║
║     • Ethereum node (Geth)                                   ║
║     • DuckDB database                                        ║
║     • Beacon chain (if running)                              ║
║                                                                ║
║     Type your questions in plain English!                    ║
║     Examples:                                                ║
║     - "What's the current block number?"                     ║
║     - "Find the top 10 most active wallets today"           ║
║     - "Which tokens had the most transfers in the last hour?"║
║     - "Analyze wallet 0x742d35Cc..."                        ║
║                                                                ║
║     Type 'exit' to quit                                      ║
╚════════════════════════════════════════════════════════════════╝
  `);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🔮 Ask Llama > '
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const question = input.trim();

    if (question.toLowerCase() === 'exit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (question) {
      try {
        const answer = await orchestrate(question);
        console.log(`\n✨ FINAL ANSWER:\n${answer}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }
    }

    rl.prompt();
  });
}

/**
 * Batch mode - process a single question
 */
async function batchMode(question: string) {
  try {
    const answer = await orchestrate(question);
    console.log(`\n✨ FINAL ANSWER:\n${answer}\n`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Test connectivity
 */
async function testConnections() {
  console.log('\n🔍 Testing connections...\n');

  // Test Ethereum node
  try {
    const blockNumber = await ethRpc.getBlockNumber();
    console.log(`✅ Ethereum node connected (block: ${blockNumber})`);
  } catch (e) {
    console.log(`❌ Ethereum node not accessible`);
  }

  // Test DuckDB (disabled for now)
  // try {
  //   const result = await database.query('SELECT 1 as test');
  //   console.log(`✅ DuckDB connected`);
  // } catch (e) {
  //   console.log(`❌ DuckDB not accessible`);
  // }

  // Test Llama
  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: 'Say "connected"' }],
        max_tokens: 10
      })
    });
    if (response.ok) {
      console.log(`✅ Llama LLM connected (${LLM_MODEL})`);
    } else {
      console.log(`❌ Llama not responding`);
    }
  } catch (e) {
    console.log(`❌ Llama not accessible at ${LLM_BASE_URL}`);
    console.log(`   Run: ollama serve`);
    console.log(`   Then: ollama pull ${LLM_MODEL}`);
  }

  console.log('');
}

/**
 * Main entry point
 */
async function main() {
  // Test connections first
  await testConnections();

  // Check for command line argument
  const args = process.argv.slice(2);
  if (args.length > 0) {
    // Batch mode - process single question
    const question = args.join(' ');
    await batchMode(question);
  } else {
    // Interactive mode
    await interactiveCLI();
  }
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export for use in other modules
export { orchestrate, executeTool, TOOLS };