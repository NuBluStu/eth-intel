#!/usr/bin/env tsx
/**
 * Insert test data for validation
 */

import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
               path.join(os.homedir(), 'eth-index', 'eth.duckdb');

const db = new duckdb.Database(dbPath, async (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
  
  console.log(`✅ Database opened: ${dbPath}\n`);
  
  // Insert test ERC20 transfers
  const testTransfers = [
    [23103545, '2024-01-10T12:00:00Z', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', '0x3410b38c94B85af6c5C6c4c0d', '1000000', '0xabc123', 1],
    [23103546, '2024-01-10T12:01:00Z', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x3410b38c94B85af6c5C6c4c0d', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', '500000', '0xdef456', 2],
    [23103547, '2024-01-10T12:02:00Z', '0xdAC17F958D2ee523a2206206994597C13D831ec7', '0x8888888888888888888888888888888888888888', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', '2000000', '0xghi789', 3],
  ];
  
  for (const transfer of testTransfers) {
    db.run(
      `INSERT INTO erc20_transfers (block, ts, token, "from", "to", value, tx_hash, log_index) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ...transfer,
      (err) => {
        if (err) console.error('Failed to insert transfer:', err);
        else console.log('✅ Inserted test transfer');
      }
    );
  }
  
  // Insert test pools
  const testPools = [
    ['UniswapV3', '0xPool123', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 3000, 23100000, '2024-01-09T10:00:00Z'],
    ['UniswapV2', '0xPool456', '0xdAC17F958D2ee523a2206206994597C13D831ec7', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 3000, 23101000, '2024-01-09T14:00:00Z'],
  ];
  
  for (const pool of testPools) {
    db.run(
      `INSERT OR IGNORE INTO pools (dex, pool, token0, token1, fee_tier, first_block, first_ts) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ...pool,
      (err) => {
        if (err) console.error('Failed to insert pool:', err);
        else console.log('✅ Inserted test pool');
      }
    );
  }
  
  // Verify data
  setTimeout(() => {
    db.all('SELECT COUNT(*) as count FROM erc20_transfers', (err, result: any) => {
      if (err) console.error('Error counting transfers:', err);
      else console.log(`\n📊 Total transfers: ${result[0].count}`);
    });
    
    db.all('SELECT COUNT(*) as count FROM pools', (err, result: any) => {
      if (err) console.error('Error counting pools:', err);
      else console.log(`📊 Total pools: ${result[0].count}`);
      
      console.log('\n✅ Test data inserted successfully!');
      process.exit(0);
    });
  }, 1000);
});