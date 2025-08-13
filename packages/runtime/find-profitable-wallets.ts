#!/usr/bin/env tsx
/**
 * Find the most profitable actively trading wallets in the last 24 hours
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
    console.error('DB Error:', err);
    process.exit(1);
  }
  
  console.log('🔍 Finding Most Profitable Wallets (Last 24 Hours)\n');
  
  // Query for profitable wallets
  const query = `
    WITH wallet_flows AS (
      -- Calculate inflows
      SELECT 
        "to" as wallet,
        token,
        SUM(CAST(value AS DECIMAL(38,0))) as inflow,
        0 as outflow,
        COUNT(*) as tx_count
      FROM erc20_transfers
      WHERE ts >= (SELECT MIN(ts) FROM erc20_transfers)
        AND "to" != '0x0'
        AND "to" != '0x0000000000000000000000000000000000000000'
      GROUP BY "to", token
      
      UNION ALL
      
      -- Calculate outflows
      SELECT 
        "from" as wallet,
        token,
        0 as inflow,
        SUM(CAST(value AS DECIMAL(38,0))) as outflow,
        COUNT(*) as tx_count
      FROM erc20_transfers
      WHERE ts >= (SELECT MIN(ts) FROM erc20_transfers)
        AND "from" != '0x0'
        AND "from" != '0x0000000000000000000000000000000000000000'
      GROUP BY "from", token
    ),
    wallet_summary AS (
      SELECT 
        wallet,
        COUNT(DISTINCT token) as tokens_traded,
        SUM(tx_count) as total_transactions,
        SUM(inflow) as total_inflow,
        SUM(outflow) as total_outflow,
        SUM(inflow) - SUM(outflow) as net_flow
      FROM wallet_flows
      GROUP BY wallet
      HAVING SUM(tx_count) >= 10  -- Active traders only (10+ transactions)
    ),
    token_info AS (
      -- Get token details for context
      SELECT DISTINCT token,
        CASE 
          WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
          WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
          WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
          WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
          ELSE SUBSTR(token, 1, 10) || '...'
        END as token_symbol
      FROM erc20_transfers
    )
    SELECT 
      ROW_NUMBER() OVER (ORDER BY net_flow DESC) as rank,
      wallet,
      tokens_traded,
      total_transactions as trades_24h,
      CASE 
        WHEN total_outflow > 0 THEN 
          ROUND((net_flow::DOUBLE / total_outflow::DOUBLE) * 100, 2)
        ELSE 100.0
      END as profit_percent,
      net_flow as net_profit_wei,
      total_inflow as total_in_wei,
      total_outflow as total_out_wei
    FROM wallet_summary
    WHERE net_flow > 0  -- Profitable only
    ORDER BY net_flow DESC
    LIMIT 10
  `;
  
  db.all(query, (err, results: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (results.length === 0) {
      console.log('No profitable wallets found in the last 24 hours.');
      process.exit(0);
    }
    
    console.log('📈 Top 10 Most Profitable Actively Trading Wallets (Last 24 Hours)\n');
    console.log('Rank | Wallet Address                              | Trades | Tokens | Profit % | Net Profit (Wei)');
    console.log('-----|---------------------------------------------|--------|--------|----------|------------------');
    
    results.forEach(w => {
      const shortAddr = `${w.wallet.substring(0, 6)}...${w.wallet.substring(38)}`;
      console.log(
        `${String(w.rank).padStart(4)} | ${shortAddr.padEnd(43)} | ${String(w.trades_24h).padStart(6)} | ${String(w.tokens_traded).padStart(6)} | ${String(w.profit_percent).padStart(8)}% | ${w.net_profit_wei}`
      );
    });
    
    console.log('\n📊 Additional Analysis:\n');
    
    // Get most traded tokens by these profitable wallets
    const topWallets = results.map(w => `'${w.wallet}'`).join(',');
    const tokenQuery = `
      SELECT 
        token,
        CASE 
          WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
          WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
          WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
          WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
          ELSE SUBSTR(token, 1, 10) || '...'
        END as symbol,
        COUNT(*) as trade_count
      FROM erc20_transfers
      WHERE ("from" IN (${topWallets}) OR "to" IN (${topWallets}))
        AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      GROUP BY token
      ORDER BY trade_count DESC
      LIMIT 5
    `;
    
    db.all(tokenQuery, (err, tokens: any[]) => {
      if (!err && tokens.length > 0) {
        console.log('Most Traded Tokens by Profitable Wallets:');
        tokens.forEach((t, i) => {
          console.log(`   ${i + 1}. ${t.symbol} - ${t.trade_count} trades`);
        });
      }
      
      console.log('\n💡 Insights:');
      const avgProfit = results.reduce((sum, w) => sum + w.profit_percent, 0) / results.length;
      const avgTrades = results.reduce((sum, w) => sum + w.trades_24h, 0) / results.length;
      
      console.log(`   • Average profit margin: ${avgProfit.toFixed(2)}%`);
      console.log(`   • Average trades per wallet: ${Math.round(avgTrades)}`);
      console.log(`   • Most profitable wallet: ${results[0].wallet}`);
      console.log(`   • Profit leader's return: ${results[0].profit_percent}%`);
      
      process.exit(0);
    });
  });
});