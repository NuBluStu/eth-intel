#!/usr/bin/env tsx
/**
 * Test script for LLM tool-calling functionality
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1',
  apiKey: 'not-needed',
});

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_current_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
          },
        },
        required: ['location'],
      },
    },
  },
];

async function testToolCalling() {
  console.log('Testing LLM tool-calling capability...');
  console.log(`Model: ${process.env.LLM_MODEL}`);
  console.log(`Endpoint: ${process.env.LLM_BASE_URL}\n`);

  try {
    const response = await client.chat.completions.create({
      model: process.env.LLM_MODEL || 'llama3.1:8b',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant with access to tools. Use them when needed.',
        },
        {
          role: 'user',
          content: 'What is the weather in San Francisco?',
        },
      ],
      tools,
      tool_choice: 'auto',
    });

    console.log('Response received:');
    console.log(JSON.stringify(response.choices[0], null, 2));

    if (response.choices[0].message.tool_calls) {
      console.log('\n✅ Tool calling is working!');
      console.log('Tool calls:', response.choices[0].message.tool_calls);
    } else {
      console.log('\n⚠️  No tool calls detected.');
      console.log('Message content:', response.choices[0].message.content);
      console.log('\nThis model may not support function calling properly.');
      console.log('Consider using mistral:7b-instruct or a different model.');
    }
  } catch (error) {
    console.error('Error testing tool calling:', error);
  }
}

testToolCalling().catch(console.error);