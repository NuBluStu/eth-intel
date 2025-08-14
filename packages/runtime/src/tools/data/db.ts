/**
 * DuckDB + Parquet Data Layer
 * Handles SQL queries and Parquet file management
 */

import duckdb from "duckdb";
import fs from "fs/promises";
import path from "path";

const DB_PATH = process.env.DUCKDB_PATH || ":memory:";
const PARQUET_DIR = process.env.PARQUET_DIR || "./data/parquet";

// Initialize DuckDB connection
const db = new duckdb.Database(DB_PATH);

// Core SQL execution
function exec(sqlText: string, params?: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sqlText, ...(params || []), (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Query with automatic LIMIT for SELECT statements
export async function query(sql: string, params?: any[]): Promise<any[]> {
  // Only add LIMIT to SELECT statements without existing LIMIT
  const isSelect = /^\s*select\b/i.test(sql);
  const hasLimit = /\blimit\b/i.test(sql);
  const finalSql = (isSelect && !hasLimit) ? `${sql}\nLIMIT 10000` : sql;
  
  return exec(finalSql, params);
}

// Create or replace a table from a query
export async function materialize(tableName: string, selectSql: string): Promise<{name: string, rows: number}> {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "_");
  await exec(`CREATE OR REPLACE TABLE ${safeName} AS ${selectSql}`);
  const result = await exec(`SELECT COUNT(*) AS n FROM ${safeName}`);
  return { name: safeName, rows: result[0]?.n || 0 };
}

// Export data to Parquet file
export async function exportToParquet(
  tableName: string,
  outputFile?: string
): Promise<string> {
  // Ensure Parquet directory exists
  await fs.mkdir(PARQUET_DIR, { recursive: true });
  
  const filename = outputFile || `${tableName}_${Date.now()}.parquet`;
  const filepath = path.join(PARQUET_DIR, filename);
  
  await exec(`
    COPY ${tableName} 
    TO '${filepath}' 
    (FORMAT PARQUET, COMPRESSION SNAPPY)
  `);
  
  return filepath;
}

// Import Parquet file as a table
export async function importParquet(
  parquetPath: string,
  tableName?: string
): Promise<string> {
  const name = tableName || path.basename(parquetPath, '.parquet');
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, "_");
  
  // Create view directly from Parquet file
  await exec(`
    CREATE OR REPLACE VIEW ${safeName} AS 
    SELECT * FROM read_parquet('${parquetPath}')
  `);
  
  return safeName;
}

// Register multiple Parquet files as a single table
export async function registerParquetGlob(
  pattern: string,
  tableName: string
): Promise<string> {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "_");
  
  await exec(`
    CREATE OR REPLACE VIEW ${safeName} AS 
    SELECT * FROM read_parquet('${pattern}')
  `);
  
  return safeName;
}

// Blockchain-specific table schemas
export async function createBlockchainTables() {
  // Blocks table
  await exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      number BIGINT PRIMARY KEY,
      hash VARCHAR,
      parent_hash VARCHAR,
      timestamp BIGINT,
      miner VARCHAR,
      gas_used BIGINT,
      gas_limit BIGINT,
      base_fee_per_gas BIGINT,
      transaction_count INTEGER
    )
  `);
  
  // Transactions table
  await exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      hash VARCHAR PRIMARY KEY,
      block_number BIGINT,
      from_address VARCHAR,
      to_address VARCHAR,
      value DECIMAL(38, 0),
      gas_price BIGINT,
      gas_used BIGINT,
      input_data TEXT,
      status INTEGER,
      INDEX idx_block (block_number),
      INDEX idx_from (from_address),
      INDEX idx_to (to_address)
    )
  `);
  
  // Logs/Events table
  await exec(`
    CREATE TABLE IF NOT EXISTS logs (
      log_index INTEGER,
      transaction_hash VARCHAR,
      block_number BIGINT,
      address VARCHAR,
      topic0 VARCHAR,
      topic1 VARCHAR,
      topic2 VARCHAR,
      topic3 VARCHAR,
      data TEXT,
      PRIMARY KEY (block_number, log_index),
      INDEX idx_address (address),
      INDEX idx_topic0 (topic0)
    )
  `);
  
  // ERC20 transfers view
  await exec(`
    CREATE OR REPLACE VIEW erc20_transfers AS
    SELECT 
      block_number,
      transaction_hash,
      address as token,
      topic1 as from_address,
      topic2 as to_address,
      data as amount
    FROM logs
    WHERE topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  `);
}

// Insert blockchain data
export async function insertBlocks(blocks: any[]) {
  const stmt = `
    INSERT INTO blocks (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, base_fee_per_gas, transaction_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  for (const block of blocks) {
    await exec(stmt, [
      parseInt(block.number, 16),
      block.hash,
      block.parentHash,
      parseInt(block.timestamp, 16),
      block.miner,
      parseInt(block.gasUsed, 16),
      parseInt(block.gasLimit, 16),
      block.baseFeePerGas ? parseInt(block.baseFeePerGas, 16) : null,
      block.transactions.length
    ]);
  }
}

export async function insertTransactions(transactions: any[]) {
  const stmt = `
    INSERT INTO transactions (hash, block_number, from_address, to_address, value, gas_price, gas_used, input_data, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  for (const tx of transactions) {
    await exec(stmt, [
      tx.hash,
      parseInt(tx.blockNumber, 16),
      tx.from,
      tx.to,
      BigInt(tx.value).toString(),
      parseInt(tx.gasPrice, 16),
      tx.gasUsed ? parseInt(tx.gasUsed, 16) : null,
      tx.input,
      tx.status ? parseInt(tx.status, 16) : 1
    ]);
  }
}

export async function insertLogs(logs: any[]) {
  const stmt = `
    INSERT INTO logs (log_index, transaction_hash, block_number, address, topic0, topic1, topic2, topic3, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  for (const log of logs) {
    await exec(stmt, [
      parseInt(log.logIndex, 16),
      log.transactionHash,
      parseInt(log.blockNumber, 16),
      log.address,
      log.topics[0] || null,
      log.topics[1] || null,
      log.topics[2] || null,
      log.topics[3] || null,
      log.data
    ]);
  }
}

// Analytical queries
export async function getTopTokensByVolume(days = 7): Promise<any[]> {
  return query(`
    SELECT 
      token,
      COUNT(*) as transfer_count,
      COUNT(DISTINCT from_address) as unique_senders,
      COUNT(DISTINCT to_address) as unique_receivers
    FROM erc20_transfers
    WHERE block_number > (SELECT MAX(block_number) - ${days * 7200} FROM blocks)
    GROUP BY token
    ORDER BY transfer_count DESC
    LIMIT 100
  `);
}

export async function getWalletActivity(address: string): Promise<any> {
  const sent = await query(`
    SELECT COUNT(*) as count, SUM(CAST(value AS DECIMAL)) as total
    FROM transactions
    WHERE from_address = ?
  `, [address.toLowerCase()]);
  
  const received = await query(`
    SELECT COUNT(*) as count, SUM(CAST(value AS DECIMAL)) as total
    FROM transactions
    WHERE to_address = ?
  `, [address.toLowerCase()]);
  
  return { sent: sent[0], received: received[0] };
}

// Export namespace for tool integration
export const database = {
  // Core operations
  query,
  materialize,
  exec,
  
  // Parquet operations
  exportToParquet,
  importParquet,
  registerParquetGlob,
  
  // Schema management
  createBlockchainTables,
  
  // Data insertion
  insertBlocks,
  insertTransactions,
  insertLogs,
  
  // Analytics
  getTopTokensByVolume,
  getWalletActivity
};