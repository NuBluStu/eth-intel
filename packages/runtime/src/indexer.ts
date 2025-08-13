import { createPublicClient, http, webSocket, parseAbiItem, type Log } from 'viem';
import { mainnet } from 'viem/chains';
import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';

dotenv.config();

const config = {
  rpcHttp: process.env.RPC_HTTP || 'http://127.0.0.1:8545',
  rpcWs: process.env.RPC_WS || 'ws://127.0.0.1:8546',
  duckdbPath: process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
              path.join(os.homedir(), 'eth-index', 'eth.duckdb'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '14'),
  batchSize: 100,
  backfillDays: 7,
};

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const UNIV2_PAIR_CREATED_TOPIC = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
const UNIV3_POOL_CREATED_TOPIC = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const SWAP_TOPICS = [
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
];

let db: duckdb.Database;
let httpClient: any;
let wsClient: any;

async function initDatabase(): Promise<duckdb.Database> {
  const dbDir = path.dirname(config.duckdbPath);
  await fs.mkdir(dbDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    db = new duckdb.Database(config.duckdbPath, (err) => {
      if (err) reject(err);
      else {
        console.log(`Indexer database initialized at: ${config.duckdbPath}`);
        resolve(db);
      }
    });
  });
}

async function executeQuery(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initSchema() {
  const schemaPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  for (const statement of statements) {
    try {
      await executeQuery(statement + ';');
    } catch (error) {
      console.error(`Failed to execute: ${statement.substring(0, 50)}...`);
    }
  }
}

async function processTransferLog(log: Log, blockTimestamp: bigint) {
  const token = log.address;
  const from = log.topics[1] ? `0x${log.topics[1].slice(26)}` : '0x0';
  const to = log.topics[2] ? `0x${log.topics[2].slice(26)}` : '0x0';
  // Handle empty or invalid data field
  let value: bigint;
  try {
    value = log.data && log.data !== '0x' ? BigInt(log.data) : 0n;
  } catch (e) {
    console.warn(`Invalid value in transfer log: ${log.data}`);
    value = 0n;
  }
  
  await executeQuery(
    `INSERT INTO erc20_transfers (block, ts, token, "from", "to", value, tx_hash, log_index) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(log.blockNumber),
      new Date(Number(blockTimestamp) * 1000).toISOString(),
      token,
      from,
      to,
      value.toString(),
      log.transactionHash,
      Number(log.logIndex || 0),
    ]
  );
}

async function processPoolCreation(log: Log, blockTimestamp: bigint, dex: string) {
  let pool, token0, token1, feeTier;
  
  if (dex === 'UniswapV2') {
    token0 = `0x${log.topics[1]?.slice(26)}`;
    token1 = `0x${log.topics[2]?.slice(26)}`;
    pool = `0x${log.data.slice(26, 66)}`;
    feeTier = 3000;
  } else if (dex === 'UniswapV3') {
    token0 = `0x${log.topics[1]?.slice(26)}`;
    token1 = `0x${log.topics[2]?.slice(26)}`;
    feeTier = parseInt(log.topics[3]?.slice(0, 10) || '0', 16);
    pool = `0x${log.data.slice(26, 66)}`;
  } else {
    return;
  }
  
  await executeQuery(
    `INSERT OR IGNORE INTO pools (dex, pool, token0, token1, fee_tier, first_block, first_ts) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      dex,
      pool,
      token0,
      token1,
      feeTier,
      Number(log.blockNumber),
      new Date(Number(blockTimestamp) * 1000).toISOString(),
    ]
  );
}

async function processSwapLog(log: Log, blockTimestamp: bigint) {
  const pool = log.address;
  let sender, recipient, amount0, amount1;
  
  try {
    if (log.topics[0] === SWAP_TOPICS[0]) {
      sender = `0x${log.topics[1]?.slice(26)}`;
      recipient = `0x${log.topics[2]?.slice(26)}`;
      const data = log.data && log.data !== '0x' ? log.data.slice(2) : '';
      amount0 = data.length >= 64 ? BigInt('0x' + data.slice(0, 64)) : 0n;
      amount1 = data.length >= 128 ? BigInt('0x' + data.slice(64, 128)) : 0n;
    } else if (log.topics[0] === SWAP_TOPICS[1]) {
      sender = `0x${log.topics[1]?.slice(26)}`;
      recipient = `0x${log.topics[2]?.slice(26)}`;
      const data = log.data && log.data !== '0x' ? log.data.slice(2) : '';
      amount0 = data.length >= 64 ? BigInt('0x' + data.slice(0, 64)) : 0n;
      amount1 = data.length >= 128 ? BigInt('0x' + data.slice(64, 128)) : 0n;
    } else {
      return;
    }
  } catch (e) {
    console.warn(`Error processing swap log: ${e}`);
    return;
  }
  
  await executeQuery(
    `INSERT INTO dex_events (block, ts, dex, pool, event, tx_hash, log_index, sender, recipient, amount0, amount1) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(log.blockNumber),
      new Date(Number(blockTimestamp) * 1000).toISOString(),
      'Unknown',
      pool,
      'Swap',
      log.transactionHash,
      Number(log.logIndex || 0),
      sender,
      recipient,
      amount0.toString(),
      amount1.toString(),
    ]
  );
}

async function backfillData(days: number) {
  console.log(`Starting backfill for ${days} days...`);
  
  const currentBlock = await httpClient.getBlockNumber();
  const blocksPerDay = 24 * 60 * 4;
  const totalBlocks = Math.floor(days * blocksPerDay);
  const startBlock = currentBlock - BigInt(totalBlocks);
  
  let processedBlocks = 0;
  let totalLogs = 0;
  
  for (let block = startBlock; block <= currentBlock; block += BigInt(config.batchSize)) {
    const toBlock = block + BigInt(config.batchSize) - 1n;
    const actualEnd = toBlock > currentBlock ? currentBlock : toBlock;
    
    try {
      const [transferLogs, poolLogs, swapLogs] = await Promise.all([
        httpClient.getLogs({
          fromBlock: block,
          toBlock: actualEnd,
          topics: [ERC20_TRANSFER_TOPIC],
        }),
        httpClient.getLogs({
          fromBlock: block,
          toBlock: actualEnd,
          topics: [[UNIV2_PAIR_CREATED_TOPIC, UNIV3_POOL_CREATED_TOPIC]],
        }),
        httpClient.getLogs({
          fromBlock: block,
          toBlock: actualEnd,
          topics: [SWAP_TOPICS],
        }),
      ]);
      
      const blockData = await httpClient.getBlock({ blockNumber: actualEnd });
      const timestamp = blockData.timestamp;
      
      for (const log of transferLogs) {
        await processTransferLog(log, timestamp);
      }
      
      for (const log of poolLogs) {
        const dex = log.topics[0] === UNIV2_PAIR_CREATED_TOPIC ? 'UniswapV2' : 'UniswapV3';
        await processPoolCreation(log, timestamp, dex);
      }
      
      for (const log of swapLogs) {
        await processSwapLog(log, timestamp);
      }
      
      processedBlocks += Number(actualEnd - block + 1n);
      totalLogs += transferLogs.length + poolLogs.length + swapLogs.length;
      
      console.log(`Processed blocks ${block} to ${actualEnd}: ${transferLogs.length + poolLogs.length + swapLogs.length} logs`);
    } catch (error) {
      console.error(`Error processing blocks ${block} to ${actualEnd}:`, error);
    }
  }
  
  console.log(`Backfill complete: ${processedBlocks} blocks, ${totalLogs} logs`);
}

async function tailNewBlocks() {
  console.log('Starting tail mode...');
  
  const unwatch = wsClient.watchBlocks({
    onBlock: async (block: any) => {
      console.log(`New block: ${block.number}`);
      
      try {
        const [transferLogs, poolLogs, swapLogs] = await Promise.all([
          httpClient.getLogs({
            blockNumber: block.number,
            topics: [ERC20_TRANSFER_TOPIC],
          }),
          httpClient.getLogs({
            blockNumber: block.number,
            topics: [[UNIV2_PAIR_CREATED_TOPIC, UNIV3_POOL_CREATED_TOPIC]],
          }),
          httpClient.getLogs({
            blockNumber: block.number,
            topics: [SWAP_TOPICS],
          }),
        ]);
        
        for (const log of transferLogs) {
          await processTransferLog(log, block.timestamp);
        }
        
        for (const log of poolLogs) {
          const dex = log.topics[0] === UNIV2_PAIR_CREATED_TOPIC ? 'UniswapV2' : 'UniswapV3';
          await processPoolCreation(log, block.timestamp, dex);
        }
        
        for (const log of swapLogs) {
          await processSwapLog(log, block.timestamp);
        }
        
        console.log(`Processed block ${block.number}: ${transferLogs.length + poolLogs.length + swapLogs.length} logs`);
      } catch (error) {
        console.error(`Error processing block ${block.number}:`, error);
      }
    },
  });
  
  process.on('SIGINT', () => {
    console.log('Stopping tail mode...');
    unwatch();
    process.exit(0);
  });
}

async function enforceRetention() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
  
  const tables = ['erc20_transfers', 'dex_events'];
  
  for (const table of tables) {
    const result = await executeQuery(
      `DELETE FROM ${table} WHERE ts < ? RETURNING COUNT(*) as deleted`,
      [cutoffDate.toISOString()]
    );
    
    if (result[0]?.deleted > 0) {
      console.log(`Deleted ${result[0].deleted} old records from ${table}`);
    }
  }
}

async function main() {
  console.log('Ethereum Indexer starting...');
  console.log(`Config:`, config);
  
  httpClient = createPublicClient({
    chain: mainnet,
    transport: http(config.rpcHttp),
  });
  
  wsClient = createPublicClient({
    chain: mainnet,
    transport: webSocket(config.rpcWs),
  });
  
  await initDatabase();
  await initSchema();
  
  const mode = process.argv[2];
  
  if (mode === 'backfill') {
    const days = parseFloat(process.argv[3] || config.backfillDays.toString());
    await backfillData(days);
  } else if (mode === 'tail') {
    await tailNewBlocks();
  } else if (mode === 'retention') {
    await enforceRetention();
  } else {
    console.log('Starting full indexer: backfill + tail...');
    await backfillData(config.backfillDays);
    await tailNewBlocks();
  }
}

main().catch(console.error);