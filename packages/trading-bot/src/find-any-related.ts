#!/usr/bin/env tsx
/**
 * Find related wallets based on trading patterns
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
  
  console.log('🔍 Finding wallets with similar trading patterns...\n');
  
  // Find wallets that trade at similar times and tokens
  const query = `
    WITH hourly_patterns AS (
      SELECT 
        wallet,
        DATE_TRUNC('hour', ts) as trade_hour,
        token,
        COUNT(*) as trades_in_hour
      FROM (
        SELECT "from" as wallet, token, ts FROM erc20_transfers
        WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "to" as wallet, token, ts FROM erc20_transfers
        WHERE LENGTH(value) < 20
      ) t
      WHERE wallet NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
      GROUP BY wallet, trade_hour, token
    ),
    wallet_pairs AS (
      SELECT 
        h1.wallet as wallet1,
        h2.wallet as wallet2,
        COUNT(DISTINCT h1.token) as shared_tokens,
        COUNT(*) as shared_hours,
        AVG(ABS(h1.trades_in_hour - h2.trades_in_hour)) as avg_trade_diff
      FROM hourly_patterns h1
      JOIN hourly_patterns h2 
        ON h1.trade_hour = h2.trade_hour 
        AND h1.token = h2.token
        AND h1.wallet < h2.wallet
      GROUP BY h1.wallet, h2.wallet
      HAVING COUNT(DISTINCT h1.token) >= 3
        AND COUNT(*) >= 5
    ),
    wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound
      FROM (
        SELECT "to" as wallet, token, ts, 'in' as direction FROM erc20_transfers
        WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token, ts, 'out' as direction FROM erc20_transfers
        WHERE LENGTH(value) < 20
      ) t
      WHERE wallet NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
      GROUP BY wallet
      HAVING COUNT(*) BETWEEN 20 AND 500  -- Active but not bots
    ),
    related_groups AS (
      SELECT 
        wallet1,
        wallet2,
        shared_tokens,
        shared_hours,
        avg_trade_diff,
        wa1.total_trades as w1_trades,
        wa2.total_trades as w2_trades,
        wa1.inbound as w1_in,
        wa1.outbound as w1_out,
        wa2.inbound as w2_in,
        wa2.outbound as w2_out,
        CASE WHEN wa1.outbound > 0 THEN CAST(wa1.inbound AS DOUBLE) / wa1.outbound ELSE 999 END as w1_ratio,
        CASE WHEN wa2.outbound > 0 THEN CAST(wa2.inbound AS DOUBLE) / wa2.outbound ELSE 999 END as w2_ratio
      FROM wallet_pairs wp
      JOIN wallet_activity wa1 ON wp.wallet1 = wa1.wallet
      JOIN wallet_activity wa2 ON wp.wallet2 = wa2.wallet
      WHERE wa1.inbound > wa1.outbound  -- Both profitable
        AND wa2.inbound > wa2.outbound
      ORDER BY shared_hours DESC, shared_tokens DESC
      LIMIT 20
    )
    SELECT * FROM related_groups
  `;
  
  db.all(query, [], (err, groups: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (groups.length === 0) {
      console.log('No related wallet groups found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${groups.length} related wallet pairs\n`);
    
    // Build a graph of related wallets
    const walletGraph = new Map<string, Set<string>>();
    const walletStats = new Map<string, any>();
    
    groups.forEach(g => {
      if (!walletGraph.has(g.wallet1)) walletGraph.set(g.wallet1, new Set());
      if (!walletGraph.has(g.wallet2)) walletGraph.set(g.wallet2, new Set());
      
      walletGraph.get(g.wallet1)!.add(g.wallet2);
      walletGraph.get(g.wallet2)!.add(g.wallet1);
      
      walletStats.set(g.wallet1, {
        trades: g.w1_trades,
        ratio: g.w1_ratio,
        inbound: g.w1_in,
        outbound: g.w1_out
      });
      
      walletStats.set(g.wallet2, {
        trades: g.w2_trades,
        ratio: g.w2_ratio,
        inbound: g.w2_in,
        outbound: g.w2_out
      });
    });
    
    // Find the largest connected component
    const visited = new Set<string>();
    let largestGroup: string[] = [];
    
    for (const [wallet, connections] of walletGraph.entries()) {
      if (!visited.has(wallet)) {
        const group: string[] = [];
        const queue = [wallet];
        
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) continue;
          
          visited.add(current);
          group.push(current);
          
          const neighbors = walletGraph.get(current);
          if (neighbors) {
            for (const neighbor of neighbors) {
              if (!visited.has(neighbor)) {
                queue.push(neighbor);
              }
            }
          }
        }
        
        if (group.length > largestGroup.length) {
          largestGroup = group;
        }
      }
    }
    
    console.log(`🔗 Largest related group has ${largestGroup.length} wallets\n`);
    
    // Score and sort wallets
    const scoredWallets = largestGroup.map(wallet => {
      const stats = walletStats.get(wallet) || { trades: 0, ratio: 0, inbound: 0, outbound: 0 };
      const connections = walletGraph.get(wallet)?.size || 0;
      
      return {
        wallet,
        connections,
        ...stats,
        score: stats.ratio * Math.sqrt(connections) * (stats.trades / 100)
      };
    }).sort((a, b) => b.score - a.score);
    
    // Select top 10
    const top10 = scoredWallets.slice(0, 10);
    
    console.log('✅ TOP 10 RELATED PROFITABLE WALLETS:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    top10.forEach((w, i) => {
      console.log(`${i + 1}. ${w.wallet}`);
      console.log(`   • Profit ratio: ${w.ratio.toFixed(2)}x`);
      console.log(`   • Related wallets: ${w.connections}`);
      console.log(`   • Total trades: ${w.trades}`);
      console.log(`   • Inbound/Outbound: ${w.inbound}/${w.outbound}`);
      console.log(`   • Score: ${w.score.toFixed(2)}`);
      console.log();
    });
    
    // Save for copy trading
    const fs = require('fs');
    const walletsToFollow = top10.map((w, i) => ({
      address: w.wallet,
      confidence: Math.max(0.5, Math.min(0.9, w.score / 10)),
      profit_ratio: w.ratio,
      connections: w.connections,
      priority: 10 - i
    }));
    
    fs.writeFileSync(
      path.join(process.cwd(), 'related-wallets.json'),
      JSON.stringify(walletsToFollow, null, 2)
    );
    
    console.log('💾 Saved to related-wallets.json\n');
    
    console.log('🤖 ML ANALYSIS:\n');
    console.log(`   • Group shows ${(top10.reduce((s, w) => s + w.ratio, 0) / 10).toFixed(2)}x average profit ratio`);
    console.log(`   • Average connections: ${(top10.reduce((s, w) => s + w.connections, 0) / 10).toFixed(1)}`);
    console.log(`   • Total group trades: ${top10.reduce((s, w) => s + w.trades, 0)}`);
    
    if (top10[0].connections > 5) {
      console.log('   • 🎯 High connectivity suggests coordinated trading or same entity');
    }
    
    if (top10.filter(w => w.ratio > 1.5).length > 5) {
      console.log('   • 💎 Group shows consistent profitability - excellent for copy trading');
    }
    
    console.log('\n📋 RECOMMENDED STRATEGY:');
    console.log('   1. Start with top 5 wallets (highest scores)');
    console.log('   2. Use 0.01 ETH per trade initially');
    console.log('   3. Increase to 0.02 ETH for consensus trades (3+ wallets)');
    console.log('   4. Set 8% stop loss');
    console.log('   5. Monitor for 2 hours, then adjust based on performance');
    
    process.exit(0);
  });
});