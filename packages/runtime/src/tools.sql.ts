import duckdb from 'duckdb';
import { z } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: duckdb.Database | null = null;

async function initDatabase(): Promise<duckdb.Database> {
  if (db) return db;
  
  const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
                 path.join(os.homedir(), 'eth-index', 'eth.duckdb');
  
  const dbDir = path.dirname(dbPath);
  await fs.mkdir(dbDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    db = new duckdb.Database(dbPath, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`DuckDB initialized at: ${dbPath}`);
        resolve(db!);
      }
    });
  });
}

async function executeQuery(sql: string, params: any[] = []): Promise<any[]> {
  const database = await initDatabase();
  
  return new Promise((resolve, reject) => {
    database.all(sql, ...params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  for (const statement of statements) {
    try {
      await executeQuery(statement + ';');
    } catch (error) {
      console.error(`Failed to execute schema statement: ${statement.substring(0, 50)}...`);
      console.error(error);
    }
  }
  
  console.log('Database schema initialized');
}

const NAMED_QUERIES = {
  top_profit: `
    WITH recent_wallets AS (
      SELECT DISTINCT wallet
      FROM wallet_day_inout
      WHERE day >= CURRENT_DATE - INTERVAL ? DAY
    )
    SELECT 
      w.wallet,
      w.total_inflow,
      w.total_outflow,
      w.net_flow,
      w.profit_percentage
    FROM wallet_profit w
    INNER JOIN recent_wallets r ON w.wallet = r.wallet
    WHERE w.net_flow > 0
    ORDER BY w.net_flow DESC
    LIMIT ?
  `,
  
  new_pools: `
    SELECT 
      dex,
      pool,
      token0,
      token1,
      fee_tier,
      first_block,
      first_ts
    FROM pools
    WHERE first_ts >= CURRENT_TIMESTAMP - INTERVAL ? DAY
    ORDER BY first_ts DESC
  `,
  
  related_wallets: `
    SELECT 
      CASE 
        WHEN wallet1 = ? THEN wallet2
        ELSE wallet1
      END as related_wallet,
      common_tokens,
      total_interactions
    FROM wallet_links
    WHERE (wallet1 = ? OR wallet2 = ?)
      AND EXISTS (
        SELECT 1 FROM wallet_day_inout
        WHERE wallet IN (wallet1, wallet2)
          AND day >= CURRENT_DATE - INTERVAL ? DAY
      )
    ORDER BY total_interactions DESC
    LIMIT 50
  `,
  
  project_trending: `
    SELECT 
      project,
      MAX(unique_wallets) as peak_wallets,
      MAX(tx_count) as peak_tx,
      AVG(wallet_7d_avg) as avg_wallets_7d,
      AVG(tx_7d_avg) as avg_tx_7d
    FROM project_trending
    WHERE day >= CURRENT_DATE - INTERVAL ? DAY
    GROUP BY project
    HAVING MAX(unique_wallets) > 10
    ORDER BY AVG(wallet_7d_avg) DESC
    LIMIT 100
  `,
  
  token_founders: `
    WITH first_transfers AS (
      SELECT 
        token,
        "from" as founder,
        MIN(block) as first_block,
        MIN(ts) as first_ts
      FROM erc20_transfers
      WHERE token = ?
        AND ts >= CURRENT_TIMESTAMP - INTERVAL ? DAY
      GROUP BY token, "from"
    ),
    ranked_founders AS (
      SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY token ORDER BY first_block) as rn
      FROM first_transfers
    )
    SELECT 
      founder,
      first_block,
      first_ts
    FROM ranked_founders
    WHERE rn <= 5
    ORDER BY first_block
  `
};

export async function registerSqlTools(registerTool: any, mode: string) {
  if (mode !== 'duckdb') {
    console.log('SQL tools disabled in no-DB mode');
    return;
  }
  
  await initDatabase();
  await initSchema();
  
  registerTool({
    name: 'sql_query',
    description: 'Execute a named query against DuckDB (read-only)',
    parameters: z.object({
      queryName: z.enum(['top_profit', 'new_pools', 'related_wallets', 'project_trending', 'token_founders']),
      params: z.array(z.any()).optional(),
    }),
    execute: async ({ queryName, params = [] }: any) => {
      const query = (NAMED_QUERIES as any)[queryName];
      if (!query) {
        throw new Error(`Unknown query: ${queryName}`);
      }
      
      try {
        const results = await executeQuery(query, params);
        return {
          query: queryName,
          rowCount: results.length,
          data: results.slice(0, 1000),
        };
      } catch (error) {
        console.error(`Query ${queryName} failed:`, error);
        throw error;
      }
    },
  });
  
  registerTool({
    name: 'wallet_top_profit',
    description: 'Get the most profitable wallets in the last N days',
    parameters: z.object({
      days: z.number().min(1).max(30).default(5),
      limit: z.number().min(1).max(100).default(10),
    }),
    execute: async ({ days, limit }: any) => {
      const results = await executeQuery(NAMED_QUERIES.top_profit, [days, limit]);
      return {
        days,
        limit,
        wallets: results,
      };
    },
  });
  
  registerTool({
    name: 'dex_scan_new_pools',
    description: 'Scan for new liquidity pools created in the last N days',
    parameters: z.object({
      days: z.number().min(1).max(30).default(1),
    }),
    execute: async ({ days }: any) => {
      const results = await executeQuery(NAMED_QUERIES.new_pools, [days]);
      return {
        days,
        poolCount: results.length,
        pools: results,
      };
    },
  });
  
  registerTool({
    name: 'wallet_related',
    description: 'Find wallets related to a given address',
    parameters: z.object({
      address: z.string(),
      days: z.number().min(1).max(30).default(7),
    }),
    execute: async ({ address, days }: any) => {
      const results = await executeQuery(
        NAMED_QUERIES.related_wallets, 
        [address, address, address, days]
      );
      return {
        address,
        days,
        relatedCount: results.length,
        related: results,
      };
    },
  });
  
  registerTool({
    name: 'project_trending',
    description: 'Find trending projects based on wallet activity',
    parameters: z.object({
      windowDays: z.number().min(1).max(30).default(7),
    }),
    execute: async ({ windowDays }: any) => {
      const results = await executeQuery(NAMED_QUERIES.project_trending, [windowDays]);
      return {
        windowDays,
        projectCount: results.length,
        projects: results,
      };
    },
  });
  
  registerTool({
    name: 'token_founders',
    description: 'Identify potential founders/early holders of a token',
    parameters: z.object({
      tokenAddress: z.string(),
      days: z.number().min(1).max(30).default(30),
    }),
    execute: async ({ tokenAddress, days }: any) => {
      const results = await executeQuery(
        NAMED_QUERIES.token_founders,
        [tokenAddress, days]
      );
      return {
        tokenAddress,
        days,
        founderCount: results.length,
        founders: results,
      };
    },
  });
  
  // Add flexible SQL query tool
  registerTool({
    name: 'sql_custom',
    description: 'Execute custom read-only SQL queries for blockchain analysis. Use this for complex or unique queries not covered by other tools.',
    parameters: z.object({
      query: z.string().describe('The SQL query to execute (SELECT only)'),
      explanation: z.string().describe('Brief explanation of what this query analyzes'),
    }),
    execute: async ({ query, explanation }: any) => {
      // Security: Only allow SELECT queries
      const normalizedQuery = query.trim().toUpperCase();
      if (!normalizedQuery.startsWith('SELECT') && !normalizedQuery.startsWith('WITH')) {
        throw new Error('Only SELECT and WITH queries are allowed for safety');
      }
      
      // Prevent dangerous operations
      const dangerousKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];
      for (const keyword of dangerousKeywords) {
        if (normalizedQuery.includes(keyword)) {
          throw new Error(`Query contains forbidden keyword: ${keyword}`);
        }
      }
      
      try {
        const results = await executeQuery(query);
        return {
          explanation,
          rowCount: results.length,
          data: results.slice(0, 1000), // Limit results for performance
        };
      } catch (error) {
        console.error(`Custom query failed:`, error);
        throw error;
      }
    },
  });
  
  console.log('SQL tools registered');
}