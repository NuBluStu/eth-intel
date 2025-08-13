# Epic D: ETH Traces Add-on

## Epic Overview
**Status**: 📋 PLANNED  
**Priority**: P1 - Enhancement  
**Estimated Effort**: 8 Story Points  
**Target Sprint**: Next  

## Business Value
Enable deep transaction analysis through Ethereum trace data, providing insights into internal transactions, contract calls, and value flows that are invisible in standard logs.

## User Stories Summary
As a **power trader**, I want to **analyze internal transactions and contract interactions**, so that **I can identify MEV opportunities and complex DeFi strategies**.

## Technical Scope
- Integrate debug_traceTransaction RPC method
- Parse and store trace data in DuckDB
- Create tools for MEV detection
- Analyze contract interaction patterns
- Track internal ETH transfers

## Acceptance Criteria
- [ ] Trace data collection via debug namespace
- [ ] Storage schema for call traces
- [ ] MEV sandwich attack detection
- [ ] Internal transaction analysis
- [ ] Gas optimization insights
- [ ] Contract dependency graphs

## Dependencies
- Epic A, B, C completed ✅
- Geth with debug namespace enabled
- Additional DuckDB tables for traces
- Extended tool APIs

## Planned Stories

### Story D1: Trace Collection Infrastructure
**Points**: 3  
**Priority**: P0  
**Acceptance Criteria**:
- [ ] Enable debug_traceTransaction in RPC allowlist
- [ ] Create trace decoder for call frames
- [ ] Handle nested internal calls
- [ ] Store traces in new DuckDB tables
- [ ] Implement trace backfill for existing transactions

### Story D2: MEV Detection Tools
**Points**: 3  
**Priority**: P1  
**Acceptance Criteria**:
- [ ] Identify sandwich attacks (front-run + back-run)
- [ ] Detect arbitrage transactions
- [ ] Calculate MEV extracted per block
- [ ] Flag suspicious transaction ordering
- [ ] Generate MEV leaderboard

### Story D3: Contract Analysis Tools
**Points**: 2  
**Priority**: P2  
**Acceptance Criteria**:
- [ ] Map contract interaction graphs
- [ ] Identify commonly called contracts
- [ ] Track gas consumption patterns
- [ ] Detect contract upgrade patterns
- [ ] Analyze delegate call chains

## Data Model Extension

```sql
-- New tables for Epic D
CREATE TABLE eth_traces (
  block BIGINT,
  tx_hash BLOB,
  trace_address TEXT[], -- [0,1,2] for nested calls
  from_address TEXT,
  to_address TEXT,
  value DECIMAL(38,0),
  input BLOB,
  output BLOB,
  gas_used BIGINT,
  error TEXT
);

CREATE TABLE mev_transactions (
  block BIGINT,
  victim_tx BLOB,
  frontrun_tx BLOB,
  backrun_tx BLOB,
  mev_type TEXT, -- sandwich, arbitrage, liquidation
  profit_eth DECIMAL(38,0),
  searcher_address TEXT
);
```

## New Tool APIs

```typescript
// Trace analysis tools
trace.get_internal_txs(txHash: string)
trace.analyze_mev(block: number)
trace.get_contract_calls(address: string, days: number)
trace.calculate_gas_waste(txHash: string)

// MEV specific tools
mev.detect_sandwiches(days: number)
mev.top_searchers(days: number)
mev.victim_analysis(address: string)
```

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Trace data volume | High | Selective tracing, longer retention |
| Debug RPC availability | Medium | Fallback to standard logs |
| Complex nested calls | Medium | Depth limits, timeout protection |
| Performance impact | High | Separate trace indexer process |

## Success Metrics
- Detect 90% of known MEV transactions
- Trace processing < 5s per transaction
- Support 1000-deep call stacks
- Storage overhead < 2x current size

## Implementation Plan

### Sprint 1 (Story D1)
1. Extend RPC allowlist
2. Design trace schema
3. Implement trace decoder
4. Create storage layer
5. Test with sample transactions

### Sprint 2 (Story D2)
1. Research MEV patterns
2. Implement detection algorithms
3. Create MEV tools
4. Validate against known MEV
5. Generate reports

### Sprint 3 (Story D3)
1. Build contract graph logic
2. Implement analysis tools
3. Create gas optimization reports
4. Test with DeFi protocols
5. Documentation

## Definition of Done
- [ ] All stories completed with tests
- [ ] Performance metrics achieved
- [ ] Documentation updated
- [ ] Validation suite extended
- [ ] Integration with existing tools

## Notes
- This epic follows proper BMAD process
- Each story will be created and validated separately
- Implementation will be iterative with checkpoints
- User feedback incorporated after each story

## Approval
**Status**: PENDING APPROVAL  
**Next Step**: Create Story D1 detailed specification