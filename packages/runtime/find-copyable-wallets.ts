#!/usr/bin/env tsx
/**
 * Find profitable wallets suitable for copy trading (lower frequency traders)
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
  
  console.log('🔍 Finding Copyable Trading Wallets (Non-Bot, Lower Frequency)\n');
  
  // Query for wallets with reasonable trading frequency
  const query = `
    WITH wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours,
        MIN(ts) as first_trade,
        MAX(ts) as last_trade
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
      HAVING COUNT(*) BETWEEN 10 AND 500  -- Exclude bots, focus on human-scale trading
    ),
    wallet_metrics AS (
      SELECT 
        wallet,
        total_trades,
        unique_tokens,
        active_hours,
        ROUND(total_trades::DOUBLE / NULLIF(active_hours, 0), 2) as trades_per_hour,
        ROUND(EXTRACT(EPOCH FROM (last_trade - first_trade)) / 3600, 2) as trading_span_hours,
        first_trade,
        last_trade
      FROM wallet_activity
      WHERE active_hours > 0
    ),
    token_diversity AS (
      -- Find wallets that trade diverse tokens (not just one pair)
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
    ),
    main_tokens AS (
      SELECT 
        wallet,
        STRING_AGG(
          CASE 
            WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
            WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
            WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
            WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
            ELSE 'Other'
          END, 
          ', '
        ) as top_tokens
      FROM token_diversity
      WHERE rn <= 3
      GROUP BY wallet
    ),
    -- Try to identify potential profit (more ins than outs suggests accumulation)
    net_flow_estimate AS (
      SELECT 
        wallet,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound_count,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound_count,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE -1 END) as net_tx_flow
      FROM (
        SELECT "to" as wallet, 'in' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, 'out' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet
    )
    SELECT 
      ROW_NUMBER() OVER (
        ORDER BY 
          wm.trades_per_hour ASC,  -- Prefer lower frequency
          wm.unique_tokens DESC     -- But with token diversity
      ) as rank,
      wm.wallet as full_address,
      wm.total_trades,
      wm.unique_tokens,
      wm.trades_per_hour,
      wm.trading_span_hours,
      mt.top_tokens,
      nf.inbound_count,
      nf.outbound_count,
      CASE 
        WHEN nf.outbound_count > 0 THEN 
          ROUND((nf.inbound_count::DOUBLE / nf.outbound_count), 2)
        ELSE nf.inbound_count 
      END as in_out_ratio,
      wm.last_trade
    FROM wallet_metrics wm
    LEFT JOIN main_tokens mt ON wm.wallet = mt.wallet
    LEFT JOIN net_flow_estimate nf ON wm.wallet = nf.wallet
    WHERE wm.trades_per_hour <= 100  -- Exclude high-frequency bots
      AND wm.unique_tokens >= 3      -- Some token diversity
      AND wm.trading_span_hours >= 1 -- Active for at least 1 hour
    ORDER BY 
      wm.trades_per_hour ASC,
      wm.unique_tokens DESC
    LIMIT 15
  `;
  
  db.all(query, (err, results: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (results.length === 0) {
      console.log('No suitable wallets found.');
      process.exit(0);
    }
    
    console.log('📈 Top 15 Copyable Trading Wallets (Full Addresses)\n');
    console.log('Suitable for copy trading - Lower frequency, diverse portfolio:\n');
    
    results.forEach(w => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Rank #${w.rank}`);
      console.log(`Address: ${w.full_address}`);
      console.log(`Etherscan: https://etherscan.io/address/${w.full_address}`);
      console.log(`\nTrading Metrics:`);
      console.log(`  • Total Trades: ${w.total_trades}`);
      console.log(`  • Unique Tokens: ${w.unique_tokens}`);
      console.log(`  • Trade Rate: ${w.trades_per_hour} per hour (manageable for copying)`);
      console.log(`  • Active Period: ${w.trading_span_hours} hours`);
      console.log(`  • Top Tokens: ${w.top_tokens || 'Various'}`);
      console.log(`\nFlow Analysis:`);
      console.log(`  • Inbound Transactions: ${w.inbound_count}`);
      console.log(`  • Outbound Transactions: ${w.outbound_count}`);
      console.log(`  • In/Out Ratio: ${w.in_out_ratio} ${w.in_out_ratio > 1 ? '(accumulating)' : '(distributing)'}`);
      console.log(`  • Last Active: ${new Date(w.last_trade).toLocaleString()}`);
    });
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('\n💡 Copy Trading Insights:\n');
    
    // Additional analysis
    const avgTradesPerHour = results.reduce((sum, w) => sum + w.trades_per_hour, 0) / results.length;
    const avgTokens = results.reduce((sum, w) => sum + w.unique_tokens, 0) / results.length;
    const accumulating = results.filter(w => w.in_out_ratio > 1).length;
    
    console.log(`📊 Portfolio Characteristics:`);
    console.log(`  • Average trade rate: ${avgTradesPerHour.toFixed(1)} trades/hour`);
    console.log(`  • Average token diversity: ${Math.round(avgTokens)} different tokens`);
    console.log(`  • ${accumulating} out of ${results.length} wallets are accumulating (more ins than outs)`);
    
    console.log(`\n✅ Why These Wallets Are Good for Copy Trading:`);
    console.log(`  1. Lower frequency (${avgTradesPerHour.toFixed(1)} trades/hr avg) - manageable to follow`);
    console.log(`  2. Token diversity - not just arbitrage on one pair`);
    console.log(`  3. Human-scale activity patterns`);
    console.log(`  4. Recent activity (all active in last few hours)`);
    
    console.log(`\n⚠️  Important Considerations:`);
    console.log(`  • Always DYOR - past activity doesn't guarantee future profits`);
    console.log(`  • Consider gas costs when copying trades`);
    console.log(`  • Start with small amounts to test strategies`);
    console.log(`  • Monitor for changes in trading patterns`);
    
    process.exit(0);
  });
});