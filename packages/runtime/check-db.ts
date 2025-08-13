#!/usr/bin/env tsx
/**
 * Check database status and data availability
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
  
  // Check tables
  db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'", (err, tables) => {
    if (err) {
      console.error('Error checking tables:', err);
      return;
    }
    
    console.log('📊 Tables found:', tables.length);
    tables.forEach((t: any) => console.log(`   - ${t.table_name}`));
    
    // Check row counts
    const checkTables = ['erc20_transfers', 'pools', 'dex_events'];
    
    checkTables.forEach(table => {
      db.all(`SELECT COUNT(*) as count FROM ${table}`, (err, result: any) => {
        if (err) {
          console.log(`   ❌ ${table}: Error checking`);
        } else {
          const count = result[0]?.count || 0;
          console.log(`   📈 ${table}: ${count} rows`);
        }
      });
    });
    
    // Check if we need to populate data
    setTimeout(() => {
      db.all("SELECT COUNT(*) as count FROM erc20_transfers", (err, result: any) => {
        const count = result?.[0]?.count || 0;
        if (count === 0) {
          console.log('\n⚠️  Database is empty. You need to run the indexer:');
          console.log('   1. Make sure Geth is running at http://127.0.0.1:8545');
          console.log('   2. Run: npm run build');
          console.log('   3. Run: node dist/indexer.js backfill 1');
          console.log('      (This will backfill 1 day of data)');
        } else {
          console.log(`\n✅ Database has data (${count} transfers)`);
        }
        process.exit(0);
      });
    }, 1000);
  });
});