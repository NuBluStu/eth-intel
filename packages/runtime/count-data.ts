#!/usr/bin/env tsx
import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
               path.join(os.homedir(), 'eth-index', 'eth.duckdb');

const db = new duckdb.Database(dbPath, (err) => {
  if (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
  
  db.all("SELECT COUNT(*) as count FROM erc20_transfers", (err, result: any) => {
    const transfers = err ? 0 : result[0]?.count || 0;
    
    db.all("SELECT COUNT(*) as count FROM pools", (err, result: any) => {
      const pools = err ? 0 : result[0]?.count || 0;
      
      db.all("SELECT COUNT(*) as count FROM dex_events", (err, result: any) => {
        const events = err ? 0 : result[0]?.count || 0;
        
        console.log(`Transfers: ${transfers}, Pools: ${pools}, DEX Events: ${events}`);
        process.exit(0);
      });
    });
  });
});