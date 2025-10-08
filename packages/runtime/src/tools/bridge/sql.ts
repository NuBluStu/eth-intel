/**
 * Bridge module to provide backwards compatibility for SQL tools
 * Maps old tools.sql.ts interface registration to new tools/data/db.ts
 */

import { z } from "zod";
import { database } from "../data/db.js";

export async function registerSqlTools(registerTool: any, mode: string = 'duckdb') {
  registerTool({
    name: 'sql_query',
    description: 'Execute DuckDB SQL query with automatic LIMIT',
    parameters: z.object({
      sql: z.string().describe('SQL query to execute'),
      params: z.array(z.any()).optional().describe('Query parameters')
    }),
    execute: async ({ sql, params }: { sql: string; params?: any[] }) => {
      return database.query(sql, params);
    }
  });

  registerTool({
    name: 'sql_materialize',
    description: 'Create a table from a SELECT query',
    parameters: z.object({
      name: z.string().describe('Table name to create'),
      sql: z.string().describe('SELECT query to materialize')
    }),
    execute: async ({ name, sql }: { name: string; sql: string }) => {
      return database.materialize(name, sql);
    }
  });

  // Add other database tools based on mode
  if (mode === 'duckdb') {
    registerTool({
      name: 'sql_export_parquet',
      description: 'Export table to Parquet file',
      parameters: z.object({
        tableName: z.string().describe('Table to export'),
        outputFile: z.string().optional().describe('Output filename')
      }),
      execute: async ({ tableName, outputFile }: { tableName: string; outputFile?: string }) => {
        return database.exportToParquet(tableName, outputFile);
      }
    });

    registerTool({
      name: 'sql_import_parquet',
      description: 'Import Parquet file as table',
      parameters: z.object({
        parquetPath: z.string().describe('Path to Parquet file'),
        tableName: z.string().optional().describe('Table name to create')
      }),
      execute: async ({ parquetPath, tableName }: { parquetPath: string; tableName?: string }) => {
        return database.importParquet(parquetPath, tableName);
      }
    });
  }
}