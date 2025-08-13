# Epic B: Ingestion (DuckDB)

## Epic Overview
**Status**: ✅ COMPLETED (Retroactive Documentation)  
**Priority**: P0 - Critical Foundation  
**Estimated Effort**: 5 Story Points  
**Actual Effort**: 5 Story Points  

## Business Value
Enable persistent storage and efficient querying of Ethereum blockchain data with automatic backfill and real-time tailing capabilities.

## Technical Scope
- DuckDB database initialization and schema management
- Historical data backfill from Ethereum RPC
- Real-time block tailing via WebSocket
- Data retention management
- Event decoding for transfers, pools, and DEX events

## Acceptance Criteria
- [x] DuckDB database created at configurable path
- [x] Schema with 3 core tables (erc20_transfers, pools, dex_events)
- [x] Backfill supports configurable day ranges
- [x] WebSocket tailing stays within 1 block of head
- [x] Retention automatically removes data older than N days
- [x] Batch processing with retry logic
- [x] Proper indexes for query performance

## Dependencies
- DuckDB Node.js bindings
- Viem for Ethereum interactions
- WebSocket connection to Geth

## Stories Completed

### Story B1: Database Schema & Tools
**File**: `packages/runtime/src/schema.sql`, `packages/runtime/src/tools.sql.ts`
**Points**: 2
**Acceptance Criteria**:
- [x] Core tables defined with proper types
- [x] Indexes on frequently queried columns
- [x] Views for analytics (wallet_profit, project_trending, wallet_links)
- [x] Named queries for all 6 flagship questions
- [x] Read-only query execution
- [x] Automatic schema initialization

### Story B2: RPC & Event Tools
**File**: `packages/runtime/src/tools.eth.ts`, `packages/runtime/src/tools.dex.ts`
**Points**: 2
**Acceptance Criteria**:
- [x] Allowlisted RPC methods (eth_blockNumber, eth_getLogs, etc.)
- [x] Log window fetching with chunking (2000 blocks max)
- [x] Automatic retry on failure
- [x] ERC20 Transfer decoder
- [x] UniV2/V3 pool creation decoders
- [x] Swap/Mint/Burn event decoders
- [x] Pool safety assessment heuristics

### Story B3: Indexer Implementation
**File**: `packages/runtime/src/indexer.ts`
**Points**: 1
**Acceptance Criteria**:
- [x] Backfill mode for historical data
- [x] Tail mode for real-time updates
- [x] Retention mode for cleanup
- [x] Batch processing with configurable size
- [x] Error handling and logging
- [x] Graceful shutdown handling

## Technical Decisions
1. Native DuckDB bindings for performance
2. Separate modes (backfill/tail/retention) for flexibility
3. 2000 block batch size to avoid RPC limits
4. WebSocket for real-time tailing
5. Parameterized queries to prevent SQL injection

## Performance Metrics
- Backfill speed: ~2000 blocks per batch
- Query performance: Views optimized with proper indexes
- Storage: Rolling 14-day window by default

## Risks Mitigated
- ✅ RPC rate limiting handled via batching
- ✅ Data loss prevented via transaction consistency
- ✅ Disk space managed via retention policy
- ✅ Connection failures handled with retry logic

## Testing Evidence
- Backfill tested with 7-day historical data
- Tail mode validated against live blocks
- Retention successfully removes old data