#!/usr/bin/env tsx
/**
 * Find active swing traders (higher frequency, not arbitrage)
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
  
  console.log('🔍 Finding Active Swing Traders (Non-Arbitrage)...\n');
  console.log('Criteria:');
  console.log('  • 20-200 trades total (active but not HFT)');
  console.log('  • Both buying AND selling (swing trading)');
  console.log('  • Multiple tokens (not single pair arbitrage)');
  console.log('  • Consistent activity throughout the day\n');
  
  const query = `
    WITH wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours,
        MIN(ts) as first_trade,
        MAX(ts) as last_trade,
        COUNT(DISTINCT DATE_TRUNC('minute', ts)) as active_periods
      FROM (
        SELECT "to" as wallet, token, ts FROM erc20_transfers 
        WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token, ts FROM erc20_transfers 
        WHERE LENGTH(value) < 20
      ) t
      WHERE wallet NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
      GROUP BY wallet
      HAVING COUNT(*) BETWEEN 20 AND 200  -- Active range
    ),
    wallet_flow AS (
      SELECT 
        wallet,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as sell_count
      FROM (
        SELECT "to" as wallet, 'in' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, 'out' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet
    ),
    token_pairs AS (
      -- Check if wallet trades same pairs repeatedly (likely arbitrage)
      SELECT 
        wallet,
        token,
        COUNT(*) as pair_trades
      FROM (
        SELECT "to" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet, token
    ),
    wallet_patterns AS (
      SELECT 
        wallet,
        MAX(pair_trades) as max_pair_trades,
        COUNT(DISTINCT token) as traded_tokens
      FROM token_pairs
      GROUP BY wallet
    ),
    recent_activity AS (
      SELECT 
        wallet,
        COUNT(*) as recent_trades,
        COUNT(DISTINCT DATE_TRUNC('minute', ts)) as recent_periods
      FROM (
        SELECT "to" as wallet, ts FROM erc20_transfers 
        WHERE ts >= (SELECT MAX(ts) - INTERVAL '6 hours' FROM erc20_transfers)
          AND LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, ts FROM erc20_transfers 
        WHERE ts >= (SELECT MAX(ts) - INTERVAL '6 hours' FROM erc20_transfers)
          AND LENGTH(value) < 20
      ) t
      GROUP BY wallet
    ),
    token_names AS (
      SELECT DISTINCT 
        wallet,
        STRING_AGG(
          CASE 
            WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
            WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
            WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
            WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
            ELSE NULL
          END,
          ', '
        ) as known_tokens
      FROM (
        SELECT "to" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet
    )
    SELECT 
      wa.wallet,
      wa.total_trades,
      wa.unique_tokens,
      wa.active_hours,
      wa.active_periods,
      ROUND(wa.total_trades::DOUBLE / NULLIF(wa.active_hours, 0), 2) as trades_per_hour,
      wf.buy_count,
      wf.sell_count,
      ROUND(wf.buy_count::DOUBLE / NULLIF(wf.sell_count, 0), 2) as buy_sell_ratio,
      wp.max_pair_trades,
      ROUND(wp.max_pair_trades::DOUBLE / wa.total_trades, 2) as concentration,
      COALESCE(ra.recent_trades, 0) as recent_trades,
      COALESCE(ra.recent_periods, 0) as recent_periods,
      tn.known_tokens,
      wa.last_trade,
      -- Swing trading score
      (
        -- Active trading bonus
        CASE 
          WHEN wa.total_trades BETWEEN 50 AND 150 THEN 30
          WHEN wa.total_trades BETWEEN 30 AND 200 THEN 20
          ELSE 10
        END +
        -- Balanced buy/sell (swing trading)
        CASE 
          WHEN wf.buy_count > 5 AND wf.sell_count > 5 THEN 30
          WHEN wf.buy_count > 0 AND wf.sell_count > 0 THEN 15
          ELSE 0
        END +
        -- Token diversity (not arbitrage)
        CASE 
          WHEN wa.unique_tokens >= 5 THEN 20
          WHEN wa.unique_tokens >= 3 THEN 10
          ELSE 0
        END +
        -- Not concentrated in one pair
        CASE 
          WHEN wp.max_pair_trades::DOUBLE / wa.total_trades < 0.5 THEN 20
          WHEN wp.max_pair_trades::DOUBLE / wa.total_trades < 0.7 THEN 10
          ELSE 0
        END +
        -- Recent activity
        CASE 
          WHEN ra.recent_trades > 10 THEN 20
          WHEN ra.recent_trades > 5 THEN 10
          ELSE 0
        END +
        -- Consistent periods
        CASE 
          WHEN wa.active_periods > 10 THEN 10
          ELSE 5
        END
      ) as swing_score
    FROM wallet_activity wa
    JOIN wallet_flow wf ON wa.wallet = wf.wallet
    JOIN wallet_patterns wp ON wa.wallet = wp.wallet
    LEFT JOIN recent_activity ra ON wa.wallet = ra.wallet
    LEFT JOIN token_names tn ON wa.wallet = tn.wallet
    WHERE wf.buy_count > 5 AND wf.sell_count > 5  -- Must do both
      AND wa.unique_tokens >= 3  -- Multiple tokens
      AND wp.max_pair_trades::DOUBLE / wa.total_trades < 0.8  -- Not focused on one pair
    ORDER BY swing_score DESC, recent_trades DESC
    LIMIT 15
  `;
  
  db.all(query, (err, results: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (results.length === 0) {
      console.log('No active swing traders found.');
      process.exit(0);
    }
    
    console.log(`✅ Found ${results.length} Active Swing Traders\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const selectedWallets: any[] = [];
    
    results.slice(0, 10).forEach((w, i) => {
      const isArbitrage = w.concentration > 0.7 || w.unique_tokens < 3;
      
      if (isArbitrage) {
        console.log(`${i + 1}. ${w.wallet} [SKIPPED - LIKELY ARBITRAGE]`);
        return;
      }
      
      console.log(`${i + 1}. ${w.wallet}`);
      console.log(`   Etherscan: https://etherscan.io/address/${w.wallet}`);
      console.log('');
      console.log(`   📊 Trading Activity:`);
      console.log(`      • Total Trades: ${w.total_trades} (${w.trades_per_hour}/hour)`);
      console.log(`      • Buy/Sell: ${w.buy_count}/${w.sell_count} (ratio: ${w.buy_sell_ratio || 'N/A'})`);
      console.log(`      • Unique Tokens: ${w.unique_tokens}`);
      console.log(`      • Active Periods: ${w.active_periods} (minute intervals)`);
      console.log('');
      console.log(`   🔄 Swing Trading Metrics:`);
      console.log(`      • Concentration: ${(w.concentration * 100).toFixed(1)}% on main pair`);
      console.log(`      • Recent Activity: ${w.recent_trades} trades in last 6h`);
      console.log(`      • Known Tokens: ${w.known_tokens || 'Various altcoins'}`);
      console.log(`      • Last Trade: ${new Date(w.last_trade).toLocaleString()}`);
      console.log('');
      console.log(`   🏆 Swing Score: ${w.swing_score}/130`);
      
      if (w.buy_count > 10 && w.sell_count > 10) {
        console.log(`      • ✅ Active swing trader (${w.buy_count + w.sell_count} total trades)`);
      }
      if (w.recent_trades > 10) {
        console.log(`      • 🔥 Very active recently`);
      }
      if (w.unique_tokens >= 5) {
        console.log(`      • 💎 Diverse portfolio`);
      }
      
      console.log('');
      console.log('─────────────────────────────────────────────────────────────────────────────');
      console.log('');
      
      selectedWallets.push({
        address: w.wallet,
        total_trades: w.total_trades,
        trades_per_hour: w.trades_per_hour,
        buy_count: w.buy_count,
        sell_count: w.sell_count,
        unique_tokens: w.unique_tokens,
        recent_trades: w.recent_trades,
        swing_score: w.swing_score,
        confidence: Math.min(0.9, w.swing_score / 100)
      });
    });
    
    console.log('\n🎯 SWING TRADING ANALYSIS:\n');
    
    const avgTrades = selectedWallets.reduce((s, w) => s + w.total_trades, 0) / selectedWallets.length;
    const avgRecent = selectedWallets.reduce((s, w) => s + w.recent_trades, 0) / selectedWallets.length;
    const avgTokens = selectedWallets.reduce((s, w) => s + w.unique_tokens, 0) / selectedWallets.length;
    
    console.log(`   • Average total trades: ${avgTrades.toFixed(0)}`);
    console.log(`   • Average recent activity: ${avgRecent.toFixed(0)} trades/6h`);
    console.log(`   • Average token diversity: ${avgTokens.toFixed(0)} tokens`);
    console.log(`   • Selected wallets: ${selectedWallets.length}`);
    
    console.log('\n📋 RECOMMENDED STRATEGY FOR SWING TRADERS:\n');
    console.log('   1. Copy both buys AND sells');
    console.log('   2. Use 0.008 ETH per trade (more trades expected)');
    console.log('   3. Quick execution - 1 block delay only');
    console.log('   4. Take profits when 3+ wallets sell');
    console.log('   5. Set tighter stop loss at 5%');
    console.log('   6. Monitor every 5 minutes for opportunities');
    
    // Save selected wallets
    const fs = require('fs');
    fs.writeFileSync(
      path.join(process.cwd(), 'swing-traders.json'),
      JSON.stringify(selectedWallets, null, 2)
    );
    
    console.log('\n💾 Saved to swing-traders.json');
    console.log('\n✅ Ready to copy these active swing traders!');
    
    process.exit(0);
  });
});