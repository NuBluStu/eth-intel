# Epic A: Runtime & LLM Loop

## Epic Overview
**Status**: ✅ COMPLETED (Retroactive Documentation)  
**Priority**: P0 - Critical Foundation  
**Estimated Effort**: 3 Story Points  
**Actual Effort**: 3 Story Points  

## Business Value
Enable local LLM-based intelligence queries against Ethereum blockchain data through a flexible tool-calling architecture.

## Technical Scope
- OpenAI-compatible LLM client integration
- Tool registration and execution framework
- Query processing loop with guardrails
- Error handling and timeout management

## Acceptance Criteria
- [x] LLM client connects to local Ollama/llama.cpp
- [x] Tool registration system supports dynamic tool addition
- [x] Query processing handles multi-turn conversations
- [x] Guardrails prevent infinite loops (max 10 iterations)
- [x] Timeout protection (30s per tool call)
- [x] Zod schema validation for all tool parameters

## Dependencies
- Node.js 20+
- OpenAI SDK
- Zod for schema validation

## Stories Completed

### Story A1: Core Runtime Implementation
**File**: `packages/runtime/src/runtime.ts`
**Points**: 3
**Acceptance Criteria**:
- [x] OpenAI client initialization with configurable base URL
- [x] Tool registration mechanism
- [x] Zod to JSON Schema converter
- [x] Tool execution with timeout protection
- [x] Query processing loop with message history
- [x] Configuration via environment variables

## Technical Decisions
1. Used OpenAI SDK for compatibility with local LLMs
2. Zod for runtime type validation
3. Map-based tool registry for O(1) lookups
4. Promise.race for timeout implementation

## Risks Mitigated
- ✅ Infinite loop prevention via iteration limit
- ✅ Tool execution timeouts
- ✅ Schema validation prevents malformed parameters

## Testing Evidence
- Manual testing with sample queries completed
- All 6 flagship questions validated

## Lessons Learned
- OpenAI SDK works seamlessly with Ollama's OpenAI-compatible endpoint
- Zod schema conversion to JSON Schema required custom implementation
- Tool timeout critical for preventing hanging queries