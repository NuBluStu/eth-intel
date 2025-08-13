#!/usr/bin/env tsx
/**
 * Validation Test Suite for Ethereum Intelligence System
 * Tests all 6 flagship queries and performance metrics
 */

import { config } from 'dotenv';
import { processQuery } from './src/runtime.js';

config();

interface TestCase {
  name: string;
  query: string;
  validateResponse: (response: string) => boolean;
  maxLatencyMs: number;
}

const testCases: TestCase[] = [
  {
    name: 'Q1: Most Profitable Wallets',
    query: 'What are the most profitable wallets in the last 5 days?',
    validateResponse: (resp) => 
      resp.includes('wallet') || resp.includes('profit') || resp.includes('net_flow'),
    maxLatencyMs: 3000,
  },
  {
    name: 'Q2: New Liquidity Pools',
    query: 'Show me new liquidity pools created today and assess their safety',
    validateResponse: (resp) => 
      resp.includes('pool') || resp.includes('liquidity') || resp.includes('safety'),
    maxLatencyMs: 3000,
  },
  {
    name: 'Q3: Trending Projects',
    query: 'Which projects are attracting the most new wallets this week?',
    validateResponse: (resp) => 
      resp.includes('project') || resp.includes('wallet') || resp.includes('trending'),
    maxLatencyMs: 3000,
  },
  {
    name: 'Q4: Related Wallets',
    query: 'Find wallets related to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
    validateResponse: (resp) => 
      resp.includes('related') || resp.includes('wallet') || resp.includes('interaction'),
    maxLatencyMs: 3000,
  },
  {
    name: 'Q5: Wallet Groups',
    query: 'Show wallet clusters active in trending projects',
    validateResponse: (resp) => 
      resp.includes('wallet') || resp.includes('group') || resp.includes('cluster'),
    maxLatencyMs: 3000,
  },
  {
    name: 'Q6: Token Founders',
    query: 'Who were the foundational wallets for token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?',
    validateResponse: (resp) => 
      resp.includes('founder') || resp.includes('early') || resp.includes('first'),
    maxLatencyMs: 3000,
  },
];

const performanceMetrics: { query: string; latency: number }[] = [];

async function runTest(test: TestCase): Promise<boolean> {
  console.log(`\n📊 Testing: ${test.name}`);
  console.log(`   Query: "${test.query}"`);
  
  const startTime = Date.now();
  
  try {
    const response = await processQuery(test.query);
    const latency = Date.now() - startTime;
    
    performanceMetrics.push({ query: test.name, latency });
    
    console.log(`   Response length: ${response.length} chars`);
    console.log(`   Latency: ${latency}ms`);
    
    const valid = test.validateResponse(response);
    const performanceOk = latency <= test.maxLatencyMs;
    
    if (!valid) {
      console.log(`   ❌ Response validation failed`);
      console.log(`   Response preview: ${response.substring(0, 200)}...`);
    }
    
    if (!performanceOk) {
      console.log(`   ⚠️  Performance requirement not met (${latency}ms > ${test.maxLatencyMs}ms)`);
    }
    
    const passed = valid && performanceOk;
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    performanceMetrics.push({ query: test.name, latency: -1 });
    return false;
  }
}

async function runValidationSuite() {
  console.log('🚀 Ethereum Intelligence System - Validation Test Suite');
  console.log('=' .repeat(60));
  
  console.log('\n📋 Pre-flight Checks:');
  console.log(`   LLM URL: ${process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1'}`);
  console.log(`   LLM Model: ${process.env.LLM_MODEL || 'llama3.1:8b'}`);
  console.log(`   Mode: ${process.env.MODE || 'duckdb'}`);
  console.log(`   DuckDB: ${process.env.DUCKDB_PATH || '~/eth-index/eth.duckdb'}`);
  
  const results: boolean[] = [];
  
  for (const test of testCases) {
    const passed = await runTest(test);
    results.push(passed);
    
    // Add delay between tests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📈 Performance Summary:');
  
  const latencies = performanceMetrics
    .filter(m => m.latency > 0)
    .map(m => m.latency);
  
  if (latencies.length > 0) {
    const p50 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)];
    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    console.log(`   P50 Latency: ${p50}ms`);
    console.log(`   P95 Latency: ${p95}ms`);
    console.log(`   Average: ${avg.toFixed(0)}ms`);
    console.log(`   Success Requirement: P95 ≤ 3000ms`);
    console.log(`   Result: ${p95 <= 3000 ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Results Summary:');
  
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  const passRate = (passed / results.length * 100).toFixed(1);
  
  console.log(`   Passed: ${passed}/${results.length}`);
  console.log(`   Failed: ${failed}/${results.length}`);
  console.log(`   Pass Rate: ${passRate}%`);
  
  console.log('\n' + '=' .repeat(60));
  
  if (passed === results.length) {
    console.log('✅ All tests passed! System validated successfully.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review and fix issues.');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidationSuite().catch(console.error);
}

export { runValidationSuite, testCases };