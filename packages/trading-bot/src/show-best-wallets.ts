#!/usr/bin/env tsx
/**
 * Show the best wallets to follow for copy trading
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
  
  console.log('🔍 Finding the best wallets to copy trade...\n');
  
  // Query for profitable, actively trading wallets
  const query = `
    WITH wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours,
        MAX(ts) as last_trade,
        MIN(ts) as first_trade
      FROM (
        SELECT "to" as wallet, token, ts FROM erc20_transfers 
        WHERE "to" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
          AND LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token, ts FROM erc20_transfers 
        WHERE "from" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
          AND LENGTH(value) < 20
      ) t
      GROUP BY wallet
      HAVING COUNT(*) BETWEEN 50 AND 1000  -- Active but not bots
    ),
    wallet_flow AS (
      SELECT 
        wallet,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound_count,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound_count
      FROM (
        SELECT "to" as wallet, 'in' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, 'out' as direction FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet
    ),
    recent_performance AS (
      SELECT 
        wallet,
        COUNT(*) as recent_trades,
        COUNT(DISTINCT token) as recent_tokens
      FROM (
        SELECT "to" as wallet, token FROM erc20_transfers 
        WHERE ts >= (SELECT MAX(ts) - INTERVAL '6 hours' FROM erc20_transfers)
          AND LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token FROM erc20_transfers 
        WHERE ts >= (SELECT MAX(ts) - INTERVAL '6 hours' FROM erc20_transfers)
          AND LENGTH(value) < 20
      ) t
      GROUP BY wallet
    )
    SELECT 
      wa.wallet,
      wa.total_trades,
      wa.unique_tokens,
      wa.active_hours,
      wf.inbound_count,
      wf.outbound_count,
      CASE 
        WHEN wf.outbound_count > 0 THEN 
          ROUND(CAST(wf.inbound_count AS DOUBLE) / wf.outbound_count, 2)
        ELSE CAST(wf.inbound_count AS DOUBLE)
      END as profit_ratio,
      COALESCE(rp.recent_trades, 0) as recent_trades,
      COALESCE(rp.recent_tokens, 0) as recent_tokens,
      wa.last_trade,
      ROUND(wa.total_trades::DOUBLE / wa.active_hours, 2) as trades_per_hour,
      -- Scoring: favor profitable, diverse, recently active wallets
      (CASE 
        WHEN wf.outbound_count > 0 THEN 
          CAST(wf.inbound_count AS DOUBLE) / wf.outbound_count
        ELSE 1.0
      END) * 
      SQRT(wa.unique_tokens) * 
      (1.0 + COALESCE(rp.recent_trades, 0) / 10.0) as score
    FROM wallet_activity wa
    JOIN wallet_flow wf ON wa.wallet = wf.wallet
    LEFT JOIN recent_performance rp ON wa.wallet = rp.wallet
    WHERE wf.inbound_count > wf.outbound_count  -- Only profitable wallets
      AND wa.active_hours > 5  -- Active for at least 5 hours
    ORDER BY score DESC
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
    
    console.log('✅ TOP 15 WALLETS TO COPY TRADE:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const selectedWallets: any[] = [];
    
    results.forEach((w, i) => {
      // Calculate confidence score (0-1)
      const confidence = Math.min(0.9, (w.score / 100) * (w.profit_ratio / 2));
      
      console.log(`${i + 1}. ${w.wallet}`);
      console.log(`   Etherscan: https://etherscan.io/address/${w.wallet}`);
      console.log('');
      console.log(`   📊 Performance Metrics:`);
      console.log(`      • Profit Ratio: ${w.profit_ratio}x (${w.inbound_count} in / ${w.outbound_count} out)`);
      console.log(`      • Total Trades: ${w.total_trades}`);
      console.log(`      • Unique Tokens: ${w.unique_tokens}`);
      console.log(`      • Trade Rate: ${w.trades_per_hour} per hour`);
      console.log('');
      console.log(`   🕐 Activity:`);
      console.log(`      • Active Hours: ${w.active_hours}`);
      console.log(`      • Recent Trades (6h): ${w.recent_trades}`);
      console.log(`      • Last Trade: ${new Date(w.last_trade).toLocaleString()}`);
      console.log('');
      console.log(`   🎯 Copy Trading Score:`);
      console.log(`      • Overall Score: ${w.score.toFixed(2)}`);
      console.log(`      • Confidence: ${(confidence * 100).toFixed(1)}%`);
      console.log(`      • Priority: ${i <= 4 ? '🔥 HIGH' : i <= 9 ? '⚡ MEDIUM' : '📊 MONITOR'}`);
      console.log('');
      console.log('─────────────────────────────────────────────────────────────────────────────');
      console.log('');
      
      if (i < 10) {
        selectedWallets.push({
          rank: i + 1,
          address: w.wallet,
          confidence: confidence,
          profit_ratio: w.profit_ratio,
          recent_activity: w.recent_trades,
          score: w.score
        });
      }
    });
    
    console.log('\n🎯 RECOMMENDED COPY TRADING STRATEGY:\n');
    console.log('Top 10 Wallets Selected for Copy Trading:');
    console.log('');
    
    selectedWallets.forEach(w => {
      console.log(`${w.rank}. ${w.address.substring(0, 10)}... - Confidence: ${(w.confidence * 100).toFixed(1)}%`);
    });
    
    console.log('\n📋 Strategy Configuration:');
    console.log('   • Budget: 0.05 ETH total');
    console.log('   • Position Size: 0.005-0.01 ETH per trade');
    console.log('   • Stop Loss: 8%');
    console.log('   • Copy Delay: 2 blocks (~24 seconds)');
    console.log('   • Consensus Trades: 0.02 ETH when 3+ wallets agree');
    console.log('');
    console.log('💡 Key Insights:');
    
    const avgProfitRatio = selectedWallets.reduce((sum, w) => sum + w.profit_ratio, 0) / selectedWallets.length;
    const activeWallets = selectedWallets.filter(w => w.recent_activity > 0).length;
    
    console.log(`   • Average profit ratio: ${avgProfitRatio.toFixed(2)}x`);
    console.log(`   • Currently active wallets: ${activeWallets}/10`);
    console.log(`   • High confidence wallets (>70%): ${selectedWallets.filter(w => w.confidence > 0.7).length}`);
    
    if (avgProfitRatio > 1.5) {
      console.log('   • ✅ Excellent group profitability - strong copy trading potential');
    }
    if (activeWallets > 7) {
      console.log('   • ✅ High recent activity - good for real-time copying');
    }
    
    // Save the selected wallets
    const fs = require('fs');
    fs.writeFileSync(
      path.join(process.cwd(), 'selected-wallets.json'),
      JSON.stringify(selectedWallets, null, 2)
    );
    
    console.log('\n💾 Saved to selected-wallets.json');
    console.log('\n🚀 Ready to start copy trading these wallets!');
    
    process.exit(0);
  });
});