#!/usr/bin/env tsx
/**
 * Find wallets related to a target wallet through transaction patterns
 */

import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_WALLET = '0x3815f89682C7f42FA8a5b1Bc5ec8d1c953300c96'.toLowerCase();

const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
               path.join(os.homedir(), 'eth-index', 'eth.duckdb');

const db = new duckdb.Database(dbPath, (err) => {
  if (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
  
  console.log(`🔍 Analyzing wallet ${TARGET_WALLET}\n`);
  
  // Step 1: Find all tokens the target wallet has traded
  const tokenQuery = `
    SELECT DISTINCT token, COUNT(*) as trade_count
    FROM erc20_transfers
    WHERE (LOWER("from") = ? OR LOWER("to") = ?)
    GROUP BY token
    ORDER BY trade_count DESC
  `;
  
  db.all(tokenQuery, [TARGET_WALLET, TARGET_WALLET], (err, tokens: any[]) => {
    if (err || tokens.length === 0) {
      console.error('No trades found for target wallet');
      process.exit(1);
    }
    
    console.log(`📊 Target wallet trades ${tokens.length} different tokens\n`);
    const topTokens = tokens.slice(0, 5).map(t => t.token);
    
    // Step 2: Find wallets that trade the same tokens
    const relatedQuery = `
      WITH target_tokens AS (
        SELECT DISTINCT token
        FROM erc20_transfers
        WHERE LOWER("from") = ? OR LOWER("to") = ?
      ),
      target_timeframes AS (
        SELECT 
          DATE_TRUNC('hour', ts) as trade_hour,
          token
        FROM erc20_transfers
        WHERE LOWER("from") = ? OR LOWER("to") = ?
      ),
      wallet_scores AS (
        SELECT 
          wallet,
          COUNT(DISTINCT e.token) as shared_tokens,
          COUNT(*) as total_trades,
          COUNT(DISTINCT DATE_TRUNC('hour', e.ts)) as active_hours,
          MIN(ABS(EXTRACT(EPOCH FROM (e.ts - tt.trade_hour)))) as min_time_diff
        FROM (
          SELECT "from" as wallet, token, ts FROM erc20_transfers
          WHERE token IN (SELECT token FROM target_tokens)
          UNION ALL
          SELECT "to" as wallet, token, ts FROM erc20_transfers  
          WHERE token IN (SELECT token FROM target_tokens)
        ) e
        LEFT JOIN target_timeframes tt ON e.token = tt.token
        WHERE LOWER(wallet) != ?
          AND wallet NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
        GROUP BY wallet
        HAVING COUNT(DISTINCT e.token) >= 3
      ),
      wallet_profitability AS (
        SELECT 
          wallet,
          SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound,
          SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound
        FROM (
          SELECT "to" as wallet, 'in' as direction FROM erc20_transfers
          UNION ALL
          SELECT "from" as wallet, 'out' as direction FROM erc20_transfers
        ) t
        GROUP BY wallet
      )
      SELECT 
        ws.wallet,
        ws.shared_tokens,
        ws.total_trades,
        ws.active_hours,
        ws.min_time_diff,
        wp.inbound,
        wp.outbound,
        CASE 
          WHEN wp.outbound > 0 THEN CAST(wp.inbound AS DOUBLE) / wp.outbound
          ELSE CAST(wp.inbound AS DOUBLE)
        END as profit_ratio,
        -- Relationship score: higher = more likely related
        (ws.shared_tokens * 10 + 
         (1.0 / (1.0 + ws.min_time_diff / 3600.0)) * 50 +
         CASE WHEN ws.total_trades BETWEEN 20 AND 200 THEN 20 ELSE 0 END) as relationship_score
      FROM wallet_scores ws
      JOIN wallet_profitability wp ON ws.wallet = wp.wallet
      WHERE ws.total_trades >= 10
        AND ws.total_trades <= 1000  -- Exclude bots
      ORDER BY relationship_score DESC
      LIMIT 50
    `;
    
    db.all(relatedQuery, [
      TARGET_WALLET, TARGET_WALLET,
      TARGET_WALLET, TARGET_WALLET,
      TARGET_WALLET
    ], (err, related: any[]) => {
      if (err) {
        console.error('Query error:', err);
        process.exit(1);
      }
      
      console.log(`🔗 Found ${related.length} potentially related wallets\n`);
      
      // Step 3: Cluster analysis - find wallets that trade together
      const clusterQuery = `
        WITH target_trades AS (
          SELECT 
            token,
            DATE_TRUNC('hour', ts) as trade_hour,
            CASE 
              WHEN LOWER("from") = ? THEN 'sell'
              ELSE 'buy'
            END as action
          FROM erc20_transfers
          WHERE LOWER("from") = ? OR LOWER("to") = ?
        ),
        candidate_trades AS (
          SELECT 
            wallet,
            token,
            DATE_TRUNC('hour', ts) as trade_hour,
            action
          FROM (
            SELECT "from" as wallet, token, ts, 'sell' as action FROM erc20_transfers
            UNION ALL
            SELECT "to" as wallet, token, ts, 'buy' as action FROM erc20_transfers
          ) t
          WHERE wallet IN (${related.slice(0, 20).map(r => `'${r.wallet}'`).join(',')})
        ),
        synchronized_trades AS (
          SELECT 
            ct.wallet,
            COUNT(*) as sync_trades,
            COUNT(DISTINCT ct.token) as sync_tokens,
            AVG(ABS(EXTRACT(EPOCH FROM (ct.trade_hour - tt.trade_hour)))) as avg_time_diff
          FROM candidate_trades ct
          JOIN target_trades tt 
            ON ct.token = tt.token 
            AND ct.action = tt.action
            AND ABS(EXTRACT(EPOCH FROM (ct.trade_hour - tt.trade_hour))) < 7200  -- Within 2 hours
          GROUP BY ct.wallet
        )
        SELECT 
          wallet,
          sync_trades,
          sync_tokens,
          avg_time_diff / 3600.0 as avg_hours_diff
        FROM synchronized_trades
        ORDER BY sync_trades DESC
      `;
      
      db.all(clusterQuery, [TARGET_WALLET, TARGET_WALLET, TARGET_WALLET], (err, synced: any[]) => {
        if (err) {
          console.error('Cluster query error:', err);
          synced = [];
        }
        
        // Combine scores
        const walletScores = new Map();
        
        related.forEach(r => {
          walletScores.set(r.wallet, {
            ...r,
            sync_trades: 0,
            sync_tokens: 0,
            avg_hours_diff: 999
          });
        });
        
        synced.forEach(s => {
          if (walletScores.has(s.wallet)) {
            const existing = walletScores.get(s.wallet);
            existing.sync_trades = s.sync_trades;
            existing.sync_tokens = s.sync_tokens;
            existing.avg_hours_diff = s.avg_hours_diff;
            existing.relationship_score += s.sync_trades * 5;
          }
        });
        
        // Sort by combined score and profitability
        const finalWallets = Array.from(walletScores.values())
          .filter(w => w.profit_ratio > 1.0)  // Only profitable wallets
          .sort((a, b) => {
            const scoreA = a.relationship_score * (a.profit_ratio / 2);
            const scoreB = b.relationship_score * (b.profit_ratio / 2);
            return scoreB - scoreA;
          })
          .slice(0, 10);
        
        console.log('✅ TOP 10 RELATED & PROFITABLE WALLETS:\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        finalWallets.forEach((w, i) => {
          console.log(`${i + 1}. Wallet: ${w.wallet}`);
          console.log(`   📊 Metrics:`);
          console.log(`      • Shared tokens: ${w.shared_tokens}`);
          console.log(`      • Total trades: ${w.total_trades}`);
          console.log(`      • Profit ratio: ${w.profit_ratio.toFixed(2)}x`);
          console.log(`      • Active hours: ${w.active_hours}`);
          console.log(`   🔗 Relationship indicators:`);
          console.log(`      • Synchronized trades: ${w.sync_trades}`);
          console.log(`      • Avg time difference: ${w.avg_hours_diff.toFixed(1)} hours`);
          console.log(`      • Relationship score: ${w.relationship_score.toFixed(1)}`);
          console.log(`   💰 Trading performance:`);
          console.log(`      • Inbound txs: ${w.inbound}`);
          console.log(`      • Outbound txs: ${w.outbound}`);
          console.log(`      • Status: ${w.profit_ratio > 1 ? '🟢 Accumulating' : '🔴 Distributing'}`);
          console.log();
        });
        
        // Save to file for copy trading
        const fs = require('fs');
        const walletsToFollow = finalWallets.map(w => ({
          address: w.wallet,
          confidence: Math.min(0.9, w.relationship_score / 100),
          profit_ratio: w.profit_ratio,
          sync_trades: w.sync_trades,
          shared_tokens: w.shared_tokens
        }));
        
        fs.writeFileSync(
          path.join(process.cwd(), 'related-wallets.json'),
          JSON.stringify(walletsToFollow, null, 2)
        );
        
        console.log('💾 Saved to related-wallets.json for copy trading\n');
        
        // Analysis summary
        console.log('🎯 RELATIONSHIP ANALYSIS SUMMARY:\n');
        console.log(`   • Target wallet: ${TARGET_WALLET}`);
        console.log(`   • Total related wallets found: ${related.length}`);
        console.log(`   • Wallets with synchronized trades: ${synced.length}`);
        console.log(`   • Selected profitable wallets: ${finalWallets.length}`);
        console.log(`   • Average profit ratio: ${(finalWallets.reduce((sum, w) => sum + w.profit_ratio, 0) / finalWallets.length).toFixed(2)}x`);
        console.log(`   • Average sync trades: ${(finalWallets.reduce((sum, w) => sum + w.sync_trades, 0) / finalWallets.length).toFixed(1)}`);
        
        console.log('\n🤖 ML INSIGHTS:\n');
        
        // Pattern detection
        const highSync = finalWallets.filter(w => w.sync_trades > 5);
        const sameHour = finalWallets.filter(w => w.avg_hours_diff < 0.5);
        const highProfit = finalWallets.filter(w => w.profit_ratio > 1.5);
        
        if (highSync.length > 3) {
          console.log('   ⚡ Strong coordination detected - likely same entity or coordinated group');
        }
        if (sameHour.length > 2) {
          console.log('   ⏰ Multiple wallets trade within same hour - possible automated system');
        }
        if (highProfit.length > 5) {
          console.log('   💎 Group shows consistent profitability - good copy trading targets');
        }
        
        console.log('\n📋 RECOMMENDED COPY TRADING STRATEGY:\n');
        console.log('   1. Follow top 5 wallets with highest sync trades');
        console.log('   2. Use 0.01 ETH per trade initially');
        console.log('   3. Only copy trades that 3+ wallets make');
        console.log('   4. Set stop loss at 8%');
        console.log('   5. Increase position size for unanimous trades');
        
        process.exit(0);
      });
    });
  });
});