#!/usr/bin/env tsx
/**
 * Reset database with updated schema
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
  
  // Drop existing tables
  const tables = ['erc20_transfers', 'pools', 'dex_events', 'wallet_day_inout', 'wallet_profit', 'project_trending', 'wallet_links'];
  
  Promise.all(tables.map(table => 
    new Promise((resolve) => {
      db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
        if (err) {
          console.log(`⚠️  Could not drop ${table}: ${err.message}`);
        } else {
          console.log(`✅ Dropped table: ${table}`);
        }
        resolve(null);
      });
    })
  )).then(() => {
    console.log('\n✅ All tables dropped. Database reset complete.');
    console.log('Run the indexer to recreate tables with new schema:');
    console.log('  node dist/indexer.js backfill 0.04');
    process.exit(0);
  });
});