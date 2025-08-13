# Story B1: RPC & Log Windowing Helper

## Story Details
**Epic**: B - Ingestion (DuckDB)  
**Status**: ✅ COMPLETED  
**Points**: 2  
**Type**: Technical Implementation  
**File**: `packages/runtime/src/tools.eth.ts`

## User Story
As a **system**, I need to **fetch blockchain data from local Geth node**, so that **I can provide real-time Ethereum intelligence**.

## Acceptance Criteria

### Functional Requirements
- [x] Connect to Geth via HTTP and WebSocket
- [x] Allowlist restricts RPC methods for safety
- [x] Fetch logs within time windows
- [x] Automatic chunking for large block ranges
- [x] Retry failed requests once
- [x] Estimate block ranges for day-based queries

### Technical Requirements
- [x] Viem client for Ethereum interactions
- [x] HTTP client for queries
- [x] WebSocket client for subscriptions
- [x] 2000 block maximum per chunk
- [x] Configurable endpoints via environment

### Implemented Tools
- [x] `eth_rpc`: Execute allowlisted methods
- [x] `get_logs_window`: Chunked log fetching
- [x] `get_block_timestamp`: Block to timestamp conversion
- [x] `estimate_blocks_for_days`: Day to block estimation

## Definition of Done
- [x] All RPC methods working with Geth
- [x] Chunking prevents RPC overload
- [x] Retry logic handles transient failures
- [x] Tools registered with runtime
- [x] Environment configuration working

## Test Scenarios

### Scenario 1: Allowlisted RPC
**Given**: eth_blockNumber in allowlist  
**When**: Tool called with eth_blockNumber  
**Then**: Current block number returned

### Scenario 2: Blocked RPC
**Given**: eth_sendTransaction not in allowlist  
**When**: Tool called with eth_sendTransaction  
**Then**: Error "Method not allowed" returned

### Scenario 3: Large Window Chunking
**Given**: 10,000 block range requested  
**When**: get_logs_window called  
**Then**: 5 chunks of 2000 blocks each processed

### Scenario 4: Retry on Failure
**Given**: First request fails  
**When**: Retry attempted after 1 second  
**Then**: Second attempt succeeds

## Implementation Notes
- Viem provides type-safe Ethereum interactions
- Chunking critical for large historical queries
- Allowlist prevents dangerous operations
- WebSocket client ready for future tailing

## Configuration
```env
RPC_HTTP=http://127.0.0.1:8545
RPC_WS=ws://127.0.0.1:8546
```

## Performance Metrics
- Single RPC call: < 100ms
- 2000 block log fetch: < 2s
- Retry delay: 1s
- Max chunk size: 2000 blocks

## Risks & Mitigations
- **Risk**: RPC rate limiting
  - **Mitigation**: Chunking and retry logic
- **Risk**: Large result sets
  - **Mitigation**: 2000 block chunks
- **Risk**: Connection failures
  - **Mitigation**: Automatic retry