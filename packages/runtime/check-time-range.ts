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
  
  db.all(
    `SELECT 
      MIN(ts) as earliest,
      MAX(ts) as latest,
      COUNT(DISTINCT DATE_TRUNC('hour', ts)) as hours_covered,
      COUNT(*) as total_transfers
     FROM erc20_transfers`,
    (err, result: any) => {
      if (err) {
        console.error('Query error:', err);
      } else {
        const r = result[0];
        console.log('📊 Data Time Range:');
        console.log(`   Earliest: ${r.earliest}`);
        console.log(`   Latest: ${r.latest}`);
        console.log(`   Hours covered: ${r.hours_covered}`);
        console.log(`   Total transfers: ${r.total_transfers}`);
        
        const earliest = new Date(r.earliest);
        const latest = new Date(r.latest);
        const hoursOfData = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60);
        console.log(`   Actual time span: ${hoursOfData.toFixed(2)} hours`);
      }
      process.exit(0);
    }
  );
});