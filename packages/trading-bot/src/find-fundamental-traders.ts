#!/usr/bin/env tsx
/**
 * Find wallets with fundamental trading patterns (not bots)
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
  
  console.log('🔍 Finding Fundamental Traders (Non-Bots) with Diverse Portfolios...\n');
  console.log('Criteria:');
  console.log('  • 2-20 trades per hour (human-scale)');
  console.log('  • High token diversity (5+ different tokens)');
  console.log('  • Non-repetitive patterns (not arbitrage bots)');
  console.log('  • Profitable (accumulating tokens)\n');
  
  // Complex query to identify fundamental traders
  const query = `
    WITH wallet_activity AS (
      SELECT 
        wallet,
        COUNT(*) as total_trades,
        COUNT(DISTINCT token) as unique_tokens,
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours,
        MIN(ts) as first_trade,
        MAX(ts) as last_trade,
        COUNT(DISTINCT DATE_TRUNC('minute', ts)) as active_minutes,
        -- Token concentration (lower = more diverse)
        MAX(token_count) * 1.0 / COUNT(*) as token_concentration
      FROM (
        SELECT 
          wallet,
          token,
          ts,
          COUNT(*) OVER (PARTITION BY wallet, token) as token_count
        FROM (
          SELECT "to" as wallet, token, ts FROM erc20_transfers 
          WHERE "to" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
            AND LENGTH(value) < 20
          UNION ALL
          SELECT "from" as wallet, token, ts FROM erc20_transfers 
          WHERE "from" NOT IN ('0x0', '0x0000000000000000000000000000000000000000')
            AND LENGTH(value) < 20
        ) t
      ) t2
      GROUP BY wallet
      HAVING COUNT(*) BETWEEN 10 AND 500  -- Reasonable activity range
    ),
    wallet_patterns AS (
      SELECT 
        wallet,
        -- Time distribution analysis
        COUNT(DISTINCT DATE_TRUNC('hour', ts)) as unique_hours,
        COUNT(DISTINCT DATE_TRUNC('minute', ts)) as unique_minutes,
        -- Calculate trade spacing variance (bots have consistent spacing)
        STDDEV(time_diff) as timing_variance,
        AVG(time_diff) as avg_time_between_trades
      FROM (
        SELECT 
          wallet,
          ts,
          EXTRACT(EPOCH FROM (ts - LAG(ts) OVER (PARTITION BY wallet ORDER BY ts))) as time_diff
        FROM (
          SELECT "to" as wallet, ts FROM erc20_transfers WHERE LENGTH(value) < 20
          UNION ALL
          SELECT "from" as wallet, ts FROM erc20_transfers WHERE LENGTH(value) < 20
        ) t
      ) t2
      WHERE time_diff IS NOT NULL
      GROUP BY wallet
    ),
    wallet_flow AS (
      SELECT 
        wallet,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as inbound_count,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as outbound_count,
        COUNT(DISTINCT token) as flow_tokens
      FROM (
        SELECT "to" as wallet, 'in' as direction, token FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, 'out' as direction, token FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet
    ),
    token_diversity AS (
      SELECT 
        wallet,
        token,
        COUNT(*) as token_trades,
        ROW_NUMBER() OVER (PARTITION BY wallet ORDER BY COUNT(*) DESC) as token_rank
      FROM (
        SELECT "to" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
        UNION ALL
        SELECT "from" as wallet, token FROM erc20_transfers WHERE LENGTH(value) < 20
      ) t
      GROUP BY wallet, token
    ),
    wallet_tokens AS (
      SELECT 
        wallet,
        STRING_AGG(
          CASE 
            WHEN token_rank <= 5 THEN
              CASE 
                WHEN LOWER(token) = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
                WHEN LOWER(token) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
                WHEN LOWER(token) = '0xdac17f958d2ee523a2206206994597c13d831ec7' THEN 'USDT'
                WHEN LOWER(token) = '0x6b175474e89094c44da98b954eedeac495271d0f' THEN 'DAI'
                ELSE SUBSTRING(token, 1, 8) || '...'
              END
            ELSE NULL
          END,
          ', '
        ) as top_tokens
      FROM token_diversity
      WHERE token_rank <= 5
      GROUP BY wallet
    )
    SELECT 
      wa.wallet,
      wa.total_trades,
      wa.unique_tokens,
      wa.active_hours,
      ROUND(wa.total_trades::DOUBLE / NULLIF(wa.active_hours, 0), 2) as trades_per_hour,
      wa.token_concentration,
      wf.inbound_count,
      wf.outbound_count,
      CASE 
        WHEN wf.outbound_count > 0 THEN 
          ROUND(CAST(wf.inbound_count AS DOUBLE) / wf.outbound_count, 2)
        ELSE CAST(wf.inbound_count AS DOUBLE)
      END as profit_ratio,
      COALESCE(wp.timing_variance, 0) as timing_variance,
      COALESCE(wp.avg_time_between_trades, 0) as avg_trade_spacing,
      wt.top_tokens,
      wa.last_trade,
      -- Fundamental score (higher = better fundamental trader)
      (
        -- Diversity bonus
        LEAST(wa.unique_tokens / 5.0, 2.0) * 30 +
        -- Profitable trading
        CASE 
          WHEN wf.outbound_count > 0 THEN 
            LEAST(CAST(wf.inbound_count AS DOUBLE) / wf.outbound_count, 3.0) * 20
          ELSE 10
        END +
        -- Human-like timing (high variance = human)
        CASE 
          WHEN wp.timing_variance > 100 THEN 20
          WHEN wp.timing_variance > 50 THEN 10
          ELSE 0
        END +
        -- Reasonable trade frequency
        CASE 
          WHEN wa.total_trades::DOUBLE / NULLIF(wa.active_hours, 0) BETWEEN 2 AND 20 THEN 20
          ELSE 0
        END +
        -- Not concentrated in one token
        CASE 
          WHEN wa.token_concentration < 0.5 THEN 20
          WHEN wa.token_concentration < 0.7 THEN 10
          ELSE 0
        END
      ) as fundamental_score
    FROM wallet_activity wa
    JOIN wallet_flow wf ON wa.wallet = wf.wallet
    LEFT JOIN wallet_patterns wp ON wa.wallet = wp.wallet
    LEFT JOIN wallet_tokens wt ON wa.wallet = wt.wallet
    WHERE wa.unique_tokens >= 5  -- Minimum token diversity
      AND wa.total_trades::DOUBLE / NULLIF(wa.active_hours, 0) BETWEEN 2 AND 20  -- Human trading rate
      AND wf.inbound_count > wf.outbound_count  -- Profitable
      AND wa.token_concentration < 0.7  -- Not focused on single token
    ORDER BY fundamental_score DESC
    LIMIT 20
  `;
  
  db.all(query, (err, results: any[]) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    
    if (results.length === 0) {
      console.log('No fundamental traders found matching criteria.');
      process.exit(0);
    }
    
    console.log(`✅ Found ${results.length} Fundamental Traders\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const selectedWallets: any[] = [];
    
    results.slice(0, 10).forEach((w, i) => {
      // Bot detection heuristics
      const isLikelyBot = 
        w.timing_variance < 30 || // Very consistent timing
        w.token_concentration > 0.8 || // Focused on one token
        w.trades_per_hour > 50 || // Too frequent
        w.unique_tokens < 3; // Too few tokens
      
      if (isLikelyBot) {
        console.log(`${i + 1}. ${w.wallet} [SKIPPED - LIKELY BOT]`);
        console.log(`   Reason: Low variance (${w.timing_variance.toFixed(1)}) or high concentration (${w.token_concentration.toFixed(2)})\n`);
        return;
      }
      
      console.log(`${i + 1}. ${w.wallet}`);
      console.log(`   Etherscan: https://etherscan.io/address/${w.wallet}`);
      console.log('');
      console.log(`   📊 Fundamental Metrics:`);
      console.log(`      • Token Diversity: ${w.unique_tokens} different tokens`);
      console.log(`      • Token Concentration: ${(w.token_concentration * 100).toFixed(1)}% (lower = more diverse)`);
      console.log(`      • Trading Rate: ${w.trades_per_hour} trades/hour (human-scale)`);
      console.log(`      • Profit Ratio: ${w.profit_ratio}x (${w.inbound_count}/${w.outbound_count})`);
      console.log('');
      console.log(`   🎯 Trading Pattern Analysis:`);
      console.log(`      • Timing Variance: ${w.timing_variance.toFixed(1)} (${w.timing_variance > 100 ? '✅ Human-like' : w.timing_variance > 50 ? '⚠️ Semi-automated' : '🤖 Bot-like'})`);
      console.log(`      • Avg Trade Spacing: ${(w.avg_trade_spacing / 60).toFixed(1)} minutes`);
      console.log(`      • Active Hours: ${w.active_hours}`);
      console.log(`      • Top Tokens: ${w.top_tokens || 'Various'}`);
      console.log('');
      console.log(`   🏆 Fundamental Score: ${w.fundamental_score.toFixed(1)}/110`);
      console.log(`      • ${w.fundamental_score > 80 ? '🔥 EXCELLENT' : w.fundamental_score > 60 ? '✅ GOOD' : '⚠️ MODERATE'} fundamental trader`);
      
      // Check for specific patterns
      if (w.unique_tokens >= 10) {
        console.log(`      • 💎 Highly diversified portfolio (${w.unique_tokens} tokens)`);
      }
      if (w.timing_variance > 200) {
        console.log(`      • 👤 Very human-like trading pattern`);
      }
      if (w.profit_ratio > 2) {
        console.log(`      • 📈 Strong accumulation pattern`);
      }
      
      console.log('');
      console.log('─────────────────────────────────────────────────────────────────────────────');
      console.log('');
      
      selectedWallets.push({
        rank: i + 1,
        address: w.wallet,
        fundamental_score: w.fundamental_score,
        profit_ratio: w.profit_ratio,
        unique_tokens: w.unique_tokens,
        trades_per_hour: w.trades_per_hour,
        timing_variance: w.timing_variance,
        token_concentration: w.token_concentration,
        confidence: Math.min(0.9, w.fundamental_score / 100)
      });
    });
    
    console.log('\n🎯 FUNDAMENTAL TRADING ANALYSIS:\n');
    
    const avgScore = selectedWallets.reduce((s, w) => s + w.fundamental_score, 0) / selectedWallets.length;
    const avgTokens = selectedWallets.reduce((s, w) => s + w.unique_tokens, 0) / selectedWallets.length;
    const avgVariance = selectedWallets.reduce((s, w) => s + w.timing_variance, 0) / selectedWallets.length;
    
    console.log(`   • Average Fundamental Score: ${avgScore.toFixed(1)}/110`);
    console.log(`   • Average Token Diversity: ${avgTokens.toFixed(0)} tokens`);
    console.log(`   • Average Timing Variance: ${avgVariance.toFixed(1)} (${avgVariance > 100 ? 'Human-like' : 'Mixed'})`);
    console.log(`   • Selected Wallets: ${selectedWallets.length}/10`);
    
    console.log('\n📋 RECOMMENDED COPY STRATEGY FOR FUNDAMENTAL TRADERS:\n');
    console.log('   1. Focus on wallets with score > 70');
    console.log('   2. Prioritize high token diversity (10+ tokens)');
    console.log('   3. Copy with 0.01 ETH for single trades');
    console.log('   4. Use 0.02 ETH when 3+ wallets trade same token');
    console.log('   5. Wait 3-5 blocks before copying (avoid front-running)');
    console.log('   6. Skip trades if ML confidence < 60%');
    
    console.log('\n⚠️  BOT FILTERING APPLIED:');
    console.log('   • Excluded wallets with timing variance < 30');
    console.log('   • Excluded single-token focused wallets (>70% concentration)');
    console.log('   • Excluded high-frequency traders (>20 trades/hour)');
    console.log('   • Excluded low diversity wallets (<5 tokens)');
    
    // Save selected wallets
    const fs = require('fs');
    fs.writeFileSync(
      path.join(process.cwd(), 'fundamental-traders.json'),
      JSON.stringify(selectedWallets, null, 2)
    );
    
    console.log('\n💾 Saved to fundamental-traders.json');
    console.log('\n✅ Ready to copy trade these fundamental traders!');
    
    process.exit(0);
  });
});