# Story A1: LLM Tool-Calling Runtime

## Story Details
**Epic**: A - Runtime & LLM Loop  
**Status**: ✅ COMPLETED  
**Points**: 3  
**Type**: Technical Implementation  
**File**: `packages/runtime/src/runtime.ts`

## User Story
As a **local power user**, I want to **query Ethereum data using natural language**, so that **I can get blockchain intelligence without writing code**.

## Acceptance Criteria

### Functional Requirements
- [x] System connects to local LLM at configurable URL
- [x] LLM model is configurable via environment variable
- [x] Tool registration accepts name, description, parameters, and execute function
- [x] Query processing maintains conversation history
- [x] Maximum 10 iterations prevents infinite loops
- [x] 30-second timeout per tool execution
- [x] Error messages returned to LLM for recovery

### Technical Requirements
- [x] OpenAI SDK integration with custom base URL
- [x] Zod schemas for all tool parameters
- [x] Zod to JSON Schema conversion for OpenAI format
- [x] Promise-based async tool execution
- [x] Map-based tool registry with O(1) lookup
- [x] Environment variable configuration

### Configuration
- [x] MODE: duckdb or no-db
- [x] LLM_BASE_URL: Ollama endpoint
- [x] LLM_MODEL: Model identifier
- [x] Timeout and iteration limits

## Definition of Done
- [x] Code implemented and TypeScript compiles
- [x] All acceptance criteria met
- [x] Manual testing completed
- [x] Configuration documented
- [x] Error handling implemented

## Test Scenarios

### Scenario 1: Simple Query
**Given**: LLM is running and tools are registered  
**When**: User asks "What is the current block number?"  
**Then**: System calls eth_rpc tool and returns block number

### Scenario 2: Multi-tool Query
**Given**: DuckDB has data  
**When**: User asks "Show me the most profitable wallets"  
**Then**: System calls wallet_top_profit and formats results

### Scenario 3: Error Recovery
**Given**: A tool fails with error  
**When**: LLM receives error message  
**Then**: LLM can retry with different parameters or provide user feedback

### Scenario 4: Timeout Protection
**Given**: A tool hangs  
**When**: 30 seconds elapsed  
**Then**: Tool times out and error returned to LLM

## Implementation Notes
- Used OpenAI SDK for maximum compatibility
- Zod provides runtime type safety
- Tool timeout critical for user experience
- Message history enables context-aware responses

## Dependencies
- OpenAI SDK 4.57.0
- Zod 3.23.8
- Node.js 20+

## Risks & Mitigations
- **Risk**: LLM hallucinations cause invalid tool calls
  - **Mitigation**: Zod validation rejects invalid parameters
- **Risk**: Infinite tool calling loops
  - **Mitigation**: 10 iteration maximum enforced
- **Risk**: Slow tools block queries
  - **Mitigation**: 30-second timeout per tool