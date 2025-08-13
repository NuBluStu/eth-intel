#!/usr/bin/env tsx
/**
 * Interactive Chat Interface for Ethereum Intelligence AI
 * Talk directly to Llama3 with blockchain access
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import readline from 'readline';
import { z } from 'zod';
import { registerEthTools } from './tools.eth.js';
import { registerSqlTools } from './tools.sql.js';
import { registerDexTools } from './tools.dex.js';
import { registerTokenTools } from './tools.token.js';
import { registerDeFiTools } from './tools.defi.js';

dotenv.config();

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const config = {
  mode: process.env.MODE || 'duckdb',
  llmBaseUrl: process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1',
  llmModel: process.env.LLM_MODEL || 'llama3.1:8b',
  maxIterations: 10,
  timeout: 30000,
};

const client = new OpenAI({
  baseURL: config.llmBaseUrl,
  apiKey: 'not-needed',
});

interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (params: any) => Promise<any>;
}

const tools: Map<string, Tool> = new Map();

function registerTool(tool: Tool) {
  tools.set(tool.name, tool);
}

function toolsToOpenAIFormat() {
  return Array.from(tools.values()).map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    }
  }));
}

function zodToJsonSchema(schema: z.ZodType<any>): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType<any>);
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
  
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }
  
  return { type: 'any' };
}

async function executeToolCall(toolCall: any): Promise<any> {
  const tool = tools.get(toolCall.function.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }
  
  const params = JSON.parse(toolCall.function.arguments);
  const validatedParams = tool.parameters.parse(params);
  
  console.log(`${colors.dim}[Calling ${tool.name}...]${colors.reset}`);
  
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Tool ${tool.name} timed out`)), config.timeout)
  );
  
  try {
    const result = await Promise.race([
      tool.execute(validatedParams),
      timeout
    ]);
    return result;
  } catch (error) {
    console.error(`${colors.red}Tool ${tool.name} failed:${colors.reset}`, error);
    throw error;
  }
}

class ChatSession {
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private rl: readline.Interface;
  
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}You>${colors.reset} `,
      historySize: 100,
    });
    
    this.messages.push({
      role: 'system',
      content: `You are an advanced Ethereum blockchain analyst with comprehensive access to on-chain data.

Your enhanced capabilities:
• 40+ Ethereum RPC methods (balances, transactions, blocks, gas, storage)
• Custom SQL queries on your DuckDB (write any SELECT query needed)
• Token analysis (info, balances, transfers, holder detection)
• DeFi protocols (Uniswap V2/V3, pools, liquidity, impermanent loss)
• Smart contracts (read functions, decode events, verify code)
• Network analysis (gas prices, mempool, MEV detection)

Key improvements:
- You can now check ANY wallet's balance with eth_getBalance
- Write custom SQL queries to analyze patterns not covered by predefined tools
- Get detailed token information and track transfers
- Analyze Uniswap pools and calculate impermanent loss
- Read smart contract storage and decode transactions
- Access gas prices and estimate transaction costs

Always choose the most appropriate tool and combine multiple tools for complex analysis.
Format large numbers for readability and explain technical concepts clearly.`
    });
  }
  
  async processQuery(query: string): Promise<string> {
    this.messages.push({ role: 'user', content: query });
    
    let iterations = 0;
    
    while (iterations < config.maxIterations) {
      iterations++;
      
      const response = await client.chat.completions.create({
        model: config.llmModel,
        messages: this.messages,
        tools: toolsToOpenAIFormat(),
        tool_choice: 'auto',
        temperature: 0.7,
      });
      
      const message = response.choices[0].message;
      this.messages.push(message);
      
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content || 'No response generated';
      }
      
      for (const toolCall of message.tool_calls) {
        try {
          const result = await executeToolCall(toolCall);
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    }
    
    throw new Error('Max iterations reached without completing query');
  }
  
  async start() {
    console.log(`${colors.bright}${colors.cyan}
╔════════════════════════════════════════════════════════════╗
║       Ethereum Intelligence AI - Interactive Chat          ║
║                                                            ║
║  Connected to: ${config.llmModel.padEnd(43)}║
║  Mode: ${config.mode.padEnd(52)}║
║  Tools: ETH RPC, SQL Queries, DEX Analytics               ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    console.log(`${colors.yellow}
Available queries:
• "Show me the most profitable wallets in the last 24 hours"
• "Find wallets related to 0x3815..."
• "What new tokens are trending?"
• "Analyze wallet 0x9e66..." (your wallet)
• "Show recent DEX activity"
• "Find new liquidity pools created today"

Type 'help' for more commands, 'clear' to reset, or 'exit' to quit.
${colors.reset}`);
    
    this.rl.prompt();
    
    this.rl.on('line', async (input) => {
      const query = input.trim();
      
      if (!query) {
        this.rl.prompt();
        return;
      }
      
      // Handle special commands
      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log(`${colors.yellow}\nGoodbye!${colors.reset}`);
        process.exit(0);
      }
      
      if (query.toLowerCase() === 'clear') {
        console.clear();
        // Keep system message but clear conversation
        this.messages = [this.messages[0]];
        console.log(`${colors.green}Conversation cleared.${colors.reset}\n`);
        this.rl.prompt();
        return;
      }
      
      if (query.toLowerCase() === 'help') {
        this.showHelp();
        this.rl.prompt();
        return;
      }
      
      if (query.toLowerCase() === 'status') {
        await this.showStatus();
        this.rl.prompt();
        return;
      }
      
      // Process actual query
      console.log(`${colors.dim}Thinking...${colors.reset}`);
      
      try {
        const response = await this.processQuery(query);
        console.log(`\n${colors.green}AI>${colors.reset} ${response}\n`);
      } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, error instanceof Error ? error.message : error);
      }
      
      this.rl.prompt();
    });
    
    this.rl.on('close', () => {
      console.log(`${colors.yellow}\nGoodbye!${colors.reset}`);
      process.exit(0);
    });
  }
  
  showHelp() {
    console.log(`${colors.cyan}
═══════════════════════════════════════════════════════════════
                      HELP - Commands & Queries
═══════════════════════════════════════════════════════════════

${colors.yellow}Special Commands:${colors.reset}
  help     - Show this help message
  clear    - Clear conversation history
  status   - Show system status
  exit     - Quit the chat

${colors.yellow}Example Queries:${colors.reset}

${colors.bright}Wallet Analysis:${colors.reset}
  • "Analyze wallet 0x3815f89682C7f42FA8a5b1Bc5ec8d1c953300c96"
  • "Show me the trading history of 0x9e66..."
  • "Find the most profitable wallets today"
  • "What tokens is wallet 0x4acb... holding?"

${colors.bright}Market Intelligence:${colors.reset}
  • "What tokens are trending in the last 6 hours?"
  • "Show me new liquidity pools on Uniswap"
  • "Find high-volume trading pairs"
  • "Which projects are attracting new wallets?"

${colors.bright}Related Wallets:${colors.reset}
  • "Find wallets similar to 0x3815..."
  • "Show wallets that trade the same tokens as 0x9e66..."
  • "Find wallet clusters in project X"

${colors.bright}Trading Insights:${colors.reset}
  • "Show recent large trades"
  • "Find wallets accumulating WETH"
  • "What are the top gainers today?"
  • "Show arbitrage opportunities"

${colors.bright}Your Wallet:${colors.reset}
  • "Check balance of 0x9e664689df698166a783880c29107596f5468049"
  • "Show my recent transactions"
  • "Compare my wallet to top traders"

${colors.dim}Tip: The AI has access to real-time blockchain data and can analyze
patterns, find relationships, and provide trading insights.${colors.reset}
`);
  }
  
  async showStatus() {
    console.log(`${colors.cyan}
═══════════════════════════════════════════════════════════════
                         SYSTEM STATUS
═══════════════════════════════════════════════════════════════${colors.reset}

${colors.yellow}Connection:${colors.reset}
  • LLM Model: ${colors.green}${config.llmModel}${colors.reset}
  • LLM Endpoint: ${colors.green}${config.llmBaseUrl}${colors.reset}
  • Mode: ${colors.green}${config.mode}${colors.reset}

${colors.yellow}Available Tools:${colors.reset}
  • ${colors.green}✓${colors.reset} ETH RPC (eth.rpc, eth.getBalance, eth.getLogs)
  • ${colors.green}✓${colors.reset} SQL Queries (sql.query, wallet.top_profit, wallet.related)
  • ${colors.green}✓${colors.reset} DEX Analytics (dex.scan_new_pools, project.trending)
  • ${colors.green}✓${colors.reset} Token Analysis (token.founders, token.info)

${colors.yellow}Database:${colors.reset}
  • Path: ~/eth-index/eth.duckdb
  • Tables: erc20_transfers, pools, dex_events
  • Records: 233,577+ transfers indexed

${colors.yellow}Your Wallet:${colors.reset}
  • Address: 0x9e664689df698166a783880c29107596f5468049
  • Balance: 0.05 ETH
  • Trading Bot: ${colors.yellow}Active (swing-trader-bot)${colors.reset}

${colors.dim}Messages in conversation: ${this.messages.length}${colors.reset}
`);
  }
}

async function main() {
  console.log(`${colors.dim}Initializing Ethereum Intelligence AI...${colors.reset}`);
  
  // Register all tools
  await registerEthTools(registerTool);
  await registerSqlTools(registerTool, config.mode);
  await registerDexTools(registerTool);
  await registerTokenTools(registerTool);
  await registerDeFiTools(registerTool);
  
  console.log(`${colors.green}✓ Loaded ${tools.size} blockchain tools${colors.reset}`);
  
  // Test LLM connection
  try {
    await client.models.list();
    console.log(`${colors.green}✓ Connected to LLM${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}✗ Failed to connect to LLM at ${config.llmBaseUrl}${colors.reset}`);
    console.error(`${colors.yellow}Make sure Ollama is running: ollama serve${colors.reset}`);
    process.exit(1);
  }
  
  // Start chat session
  const session = new ChatSession();
  await session.start();
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error(`${colors.red}Uncaught error:${colors.reset}`, error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}Unhandled rejection:${colors.reset}`, error);
  process.exit(1);
});

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});