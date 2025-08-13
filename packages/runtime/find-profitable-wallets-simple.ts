#!/usr/bin/env tsx
/**
 * Find the most profitable actively trading wallets (simplified version)
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
  
  console.log('🔍 Finding Most Active Trading Wallets (Based on Available Data)\n');
  
  // Simplified query focusing on transaction count and unique tokens
  const query = `
    WITH wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours
      FROM (
        SELECT "to" as wallet, token, ts FROM erc20_transfers 
        WHERE "to" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
          AND LENGTH(value) < 20  -- Filter out abnormally large values
        UNION ALL
        SELECT "from" as wallet, token, ts FROM erc20_transfers 
        WHERE "from" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
          AND LENGTH(value) < 20
      ) t
      GROUP BY wallet
      HAVING COUNT(*) >= 10  -- Active traders only
    ),
    token_focus AS (
      -- Find what tokens each wallet trades most
      SELECT 
        wallet,
        token,
        COUNT(*) as token_trades,
        ROW_NUMBER() OVER (PARTITION BY wallet ORDER BY COUNT(*) DESC) as rn
      FROM (
        SELECT "to" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet, token
    )
    SELECT 
      ROW_NUMBER() OVER (ORDER BY wa.total_trades DESC) as rank,
      wa.wallet,
      wa.total_trades,
      wa.unique_tokens,
      wa.active_hours,
      ROUND(wa.total_trades::DOUBLE / wa.active_hours, 2) as trades_per_hour,
      tf.token as main_token,
      CASE 
        WHEN LOWER(tf.token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
        WHEN LOWER(tf.token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
        WHEN LOWER(tf.token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
        WHEN LOWER(tf.token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
        ELSE 'Other'
      END as main_token_symbol
    FROM wallet_activity wa
    LEFT JOIN token_focus tf ON wa.wallet = tf.wallet AND tf.rn = 1
    ORDER BY wa.total_trades DESC
    LIMIT 10
  `;
  
  db.all(query, (err, results: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (results.length === 0) {
      console.log('No active wallets found.');
      process.exit(0);
    }
    
    console.log('📈 Top 10 Most Active Trading Wallets\n');
    console.log('Rank | Wallet Address                              | Trades | Tokens | Hours | Rate/Hr | Main Token');
    console.log('-----|---------------------------------------------|--------|--------|-------|---------|------------');
    
    results.forEach(w => {
      const shortAddr = `${w.wallet.substring(0, 6)}...${w.wallet.substring(38)}`;
      console.log(
        `${String(w.rank).padStart(4)} | ${shortAddr.padEnd(43)} | ${String(w.total_trades).padStart(6)} | ${String(w.unique_tokens).padStart(6)} | ${String(w.active_hours).padStart(5)} | ${String(w.trades_per_hour).padStart(7)} | ${w.main_token_symbol}`
      );
    });
    
    // Additional analysis - time distribution
    console.log('\n📊 Trading Activity Analysis:\n');
    
    const hourlyQuery = `
      SELECT 
        DATE_TRUNC('hour', ts) as hour,
        COUNT(*) as trades,
        COUNT(DISTINCT "from") + COUNT(DISTINCT "to") as unique_wallets
      FROM erc20_transfers
      WHERE LENGTH(value) < 20
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 5
    `;
    
    db.all(hourlyQuery, (err, hours: any[]) => {
      if (!err && hours.length > 0) {
        console.log('Recent Hourly Activity:');
        hours.forEach(h => {
          const hourStr = new Date(h.hour).toLocaleTimeString();
          console.log(`   ${hourStr}: ${h.trades} trades, ${h.unique_wallets} unique wallets`);
        });
      }
      
      // Token distribution
      const tokenQuery = `
        SELECT 
          CASE 
            WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
            WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
            WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
            WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
            ELSE 'Other'
          END as symbol,
          COUNT(*) as trade_count,
          COUNT(DISTINCT "from") + COUNT(DISTINCT "to") as unique_traders
        FROM erc20_transfers
        WHERE LENGTH(value) < 20
        GROUP BY symbol
        ORDER BY trade_count DESC
        LIMIT 5
      `;
      
      db.all(tokenQuery, (err, tokens: any[]) => {
        if (!err && tokens.length > 0) {
          console.log('\nMost Traded Tokens:');
          tokens.forEach((t, i) => {
            console.log(`   ${i + 1}. ${t.symbol}: ${t.trade_count} trades, ${t.unique_traders} traders`);
          });
        }
        
        console.log('\n💡 Key Insights:');
        const avgTrades = results.reduce((sum, w) => sum + w.total_trades, 0) / results.length;
        const avgTokens = results.reduce((sum, w) => sum + w.unique_tokens, 0) / results.length;
        
        console.log(`   • Average trades per active wallet: ${Math.round(avgTrades)}`);
        console.log(`   • Average unique tokens traded: ${Math.round(avgTokens)}`);
        console.log(`   • Most active wallet: ${results[0].wallet}`);
        console.log(`   • Leader's trading volume: ${results[0].total_trades} trades across ${results[0].unique_tokens} tokens`);
        
        console.log('\n⚠️  Note: Profit calculation requires reliable price data.');
        console.log('   The wallets shown are ranked by trading activity, not profitability.');
        
        process.exit(0);
      });
    });
  });
});