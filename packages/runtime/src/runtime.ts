import OpenAI from 'openai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { registerEthTools } from './tools.eth.js';
import { registerSqlTools } from './tools.sql.js';
import { registerDexTools } from './tools.dex.js';
import { registerTokenTools } from './tools.token.js';
import { registerDeFiTools } from './tools.defi.js';

dotenv.config();

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
  console.log(`Registered tool: ${tool.name}`);
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
    console.error(`Tool ${tool.name} failed:`, error);
    throw error;
  }
}

export async function processQuery(query: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are an advanced Ethereum blockchain analyst with comprehensive access to on-chain data.

Your capabilities include:
- Complete Ethereum RPC access (40+ methods including balance, code, storage, gas analysis)
- Custom SQL queries on indexed blockchain data (transfers, pools, DEX events)
- Token analysis (ERC20 info, balances, transfers, holder analysis)
- DeFi protocol analysis (Uniswap V2/V3, lending, liquidity, impermanent loss)
- Smart contract interaction (read functions, decode events, check code)
- MEV and arbitrage detection
- Gas optimization and network statistics

When answering questions:
1. Use the most appropriate tool for the task
2. For complex analysis, combine multiple tools
3. Write custom SQL queries when predefined tools are insufficient
4. Verify data freshness and accuracy
5. Format large numbers for readability
6. Explain blockchain concepts when needed

You can now answer ANY Ethereum-related question, not just predefined queries.`
    },
    { role: 'user', content: query }
  ];
  
  let iterations = 0;
  
  while (iterations < config.maxIterations) {
    iterations++;
    
    const response = await client.chat.completions.create({
      model: config.llmModel,
      messages,
      tools: toolsToOpenAIFormat(),
      tool_choice: 'auto',
    });
    
    const message = response.choices[0].message;
    messages.push(message);
    
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || 'No response generated';
    }
    
    for (const toolCall of message.tool_calls) {
      try {
        const result = await executeToolCall(toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  }
  
  throw new Error('Max iterations reached without completing query');
}

async function main() {
  console.log('Ethereum Intelligence Runtime starting...');
  console.log(`Mode: ${config.mode}`);
  console.log(`LLM: ${config.llmModel} at ${config.llmBaseUrl}`);
  
  await registerEthTools(registerTool);
  await registerSqlTools(registerTool, config.mode);
  await registerDexTools(registerTool);
  await registerTokenTools(registerTool);
  await registerDeFiTools(registerTool);
  
  console.log(`Registered ${tools.size} tools`);
  
  if (process.argv[2]) {
    const query = process.argv.slice(2).join(' ');
    console.log(`\nProcessing query: ${query}\n`);
    
    try {
      const result = await processQuery(query);
      console.log('\nResult:');
      console.log(result);
    } catch (error) {
      console.error('Error processing query:', error);
      process.exit(1);
    }
  } else {
    console.log('\nReady for queries. Usage: npm run dev "your question here"');
  }
}

main().catch(console.error);