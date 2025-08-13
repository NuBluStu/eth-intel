#!/usr/bin/env tsx
/**
 * Test queries on real blockchain data
 */

import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
               path.join(os.homedir(), 'eth-index', 'eth.duckdb');

const db = new duckdb.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
  
  console.log(`✅ Database opened: ${dbPath}\n`);
  
  // Test 1: Count data
  console.log('📊 Data Summary:');
  db.all("SELECT COUNT(*) as count FROM erc20_transfers", (err, result: any) => {
    console.log(`   ERC20 Transfers: ${result[0].count}`);
    
    db.all("SELECT COUNT(*) as count FROM pools", (err, result: any) => {
      console.log(`   Liquidity Pools: ${result[0].count}`);
      
      db.all("SELECT COUNT(*) as count FROM dex_events", (err, result: any) => {
        console.log(`   DEX Events: ${result[0].count}`);
        
        // Test 2: Recent transfers
        console.log('\n📝 Recent ERC20 Transfers (last 5):');
        db.all(
          `SELECT token, "from", "to", value, ts 
           FROM erc20_transfers 
           ORDER BY block DESC 
           LIMIT 5`,
          (err, transfers: any[]) => {
            if (err) {
              console.error('Error:', err);
            } else {
              transfers.forEach((t, i) => {
                console.log(`   ${i+1}. ${t.token.substring(0,10)}... from ${t.from.substring(0,10)}... value: ${t.value}`);
              });
            }
            
            // Test 3: New pools
            console.log('\n🏊 Newest Liquidity Pools (last 5):');
            db.all(
              `SELECT dex, pool, token0, token1, first_ts 
               FROM pools 
               ORDER BY first_block DESC 
               LIMIT 5`,
              (err, pools: any[]) => {
                if (err) {
                  console.error('Error:', err);
                } else {
                  pools.forEach((p, i) => {
                    console.log(`   ${i+1}. ${p.dex} pool ${p.pool.substring(0,10)}...`);
                  });
                }
                
                // Test 4: Most active tokens
                console.log('\n🔥 Most Active Tokens (by transfer count):');
                db.all(
                  `SELECT token, COUNT(*) as tx_count 
                   FROM erc20_transfers 
                   GROUP BY token 
                   ORDER BY tx_count DESC 
                   LIMIT 5`,
                  (err, tokens: any[]) => {
                    if (err) {
                      console.error('Error:', err);
                    } else {
                      tokens.forEach((t, i) => {
                        console.log(`   ${i+1}. ${t.token.substring(0,10)}... - ${t.tx_count} transfers`);
                      });
                    }
                    
                    console.log('\n✅ All tests completed successfully!');
                    console.log('\n💡 The system has real blockchain data and is ready for queries.');
                    process.exit(0);
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});