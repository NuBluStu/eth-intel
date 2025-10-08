#!/usr/bin/env tsx
/**
 * Simple CLI to chat with Llama about Ethereum
 * This is a wrapper around the orchestrator for easy access
 */

import { orchestrate } from './src/orchestrator.js';

// Get the question from command line or use interactive mode
const question = process.argv.slice(2).join(' ');

if (question) {
  // Direct question mode
  console.log('\n🤖 Querying Llama with Ethereum access...\n');
  orchestrate(question).then(answer => {
    console.log(answer);
  }).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
} else {
  // Import and run the orchestrator in interactive mode
  import('./src/orchestrator.js').then(module => {
    // The orchestrator will handle interactive mode
  });
}