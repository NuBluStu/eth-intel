#!/usr/bin/env tsx
/**
 * Test Llama LLM Connection
 */

import "dotenv/config";
import { OpenAI } from "openai";

async function testLlama() {
  console.log("🧪 Testing Llama 3.1 Connection");
  console.log("=" .repeat(50));
  
  const baseURL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1";
  const model = process.env.LLM_MODEL || "llama3.1:8b";
  
  console.log(`Base URL: ${baseURL}`);
  console.log(`Model: ${model}`);
  console.log("");
  
  const client = new OpenAI({
    baseURL,
    apiKey: "ollama" // Ollama doesn't need real API key
  });
  
  try {
    console.log("📤 Sending test prompt...");
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 100,
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that analyzes Ethereum blockchain data." 
        },
        { 
          role: "user", 
          content: "What is a swing trader in cryptocurrency?" 
        }
      ]
    });
    
    console.log("\n✅ Connection successful!");
    console.log("\n📥 Response from Llama:");
    console.log("-" .repeat(50));
    console.log(response.choices[0]?.message?.content);
    console.log("-" .repeat(50));
    
  } catch (error) {
    console.error("\n❌ Connection failed:", error);
    console.log("\n💡 Make sure Ollama is running: ollama serve");
    process.exit(1);
  }
}

testLlama().catch(console.error);