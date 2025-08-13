#!/usr/bin/env tsx
/**
 * Clear all data from database to prepare for real data
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
  
  // Clear data from tables
  const tables = ['erc20_transfers', 'pools', 'dex_events'];
  
  Promise.all(tables.map(table => 
    new Promise((resolve) => {
      db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
          console.log(`⚠️  Could not clear ${table}: ${err.message}`);
        } else {
          db.all(`SELECT COUNT(*) as count FROM ${table}`, (err, result: any) => {
            if (!err && result) {
              console.log(`✅ Cleared ${table}: now has ${result[0].count} rows`);
            }
          });
        }
        resolve(null);
      });
    })
  )).then(() => {
    setTimeout(() => {
      console.log('\n✅ Database cleared and ready for real data.');
      console.log('Now run: node dist/indexer.js backfill 1');
      process.exit(0);
    }, 500);
  });
});