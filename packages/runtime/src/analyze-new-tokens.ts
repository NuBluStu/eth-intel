#!/usr/bin/env tsx
/**
 * Advanced Token Safety Analyzer
 * Identifies safe newly launched tokens with strong fundamentals
 */

import duckdb from 'duckdb';
import { createPublicClient, http, parseAbi, formatEther, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
               path.join(os.homedir(), 'eth-index', 'eth.duckdb');

const rpcHttp = process.env.RPC_HTTP || 'http://127.0.0.1:8545';

const httpClient = createPublicClient({
  chain: mainnet,
  transport: http(rpcHttp),
});

// Known successful deployer addresses (examples - would be populated from analysis)
const KNOWN_GOOD_DEPLOYERS = new Set([
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router
  '0x4648a43b2c14da09fdf82b161150d3f634f40491', // Known DEX deployer
]);

// Honeypot indicators
const HONEYPOT_INDICATORS = [
  'onlyOwner',
  'pausable',
  'blacklist',
  'whitelist',
  'maxTxAmount',
  'cooldown',
  '_beforeTokenTransfer',
];

interface TokenLaunch {
  pool: string;
  token0: string;
  token1: string;
  deployer: string;
  timestamp: Date;
  blockNumber: number;
  txHash: string;
}

interface TokenSafetyScore {
  token: string;
  totalScore: number;
  deployerScore: number;
  liquidityScore: number;
  tradingScore: number;
  contractScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  details: {
    deployerReputation: string;
    liquidityStatus: string;
    tradingPattern: string;
    contractSafety: string;
  };
}

class TokenSafetyAnalyzer {
  private db: duckdb.Database;
  
  constructor() {
    this.db = new duckdb.Database(dbPath);
  }
  
  async findNewTokenLaunches(hoursBack: number = 24): Promise<TokenLaunch[]> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH new_pools AS (
          SELECT 
            pool,
            token0,
            token1,
            first_block,
            first_ts,
            dex
          FROM pools
          WHERE first_ts >= (SELECT MAX(ts) - INTERVAL '${hoursBack} hours' FROM erc20_transfers)
        ),
        pool_creators AS (
          SELECT DISTINCT
            p.pool,
            p.token0,
            p.token1,
            p.first_block,
            p.first_ts,
            t."from" as deployer,
            t.tx_hash,
            t.block
          FROM new_pools p
          LEFT JOIN erc20_transfers t 
            ON p.first_block = t.block
            AND (t."to" = p.pool OR t."from" = p.pool)
          WHERE t."from" IS NOT NULL
        )
        SELECT 
          pool,
          token0,
          token1,
          deployer,
          first_ts as timestamp,
          first_block as blockNumber,
          tx_hash as txHash
        FROM pool_creators
        WHERE deployer != '0x0000000000000000000000000000000000000000'
        ORDER BY first_ts DESC
        LIMIT 100
      `;
      
      this.db.all(query, (err, results: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(results.map(r => ({
            pool: r.pool,
            token0: r.token0,
            token1: r.token1,
            deployer: r.deployer,
            timestamp: new Date(r.timestamp),
            blockNumber: r.blockNumber,
            txHash: r.txHash,
          })));
        }
      });
    });
  }
  
  async analyzeDeployerHistory(deployer: string): Promise<{ score: number; details: string }> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH deployer_tokens AS (
          SELECT DISTINCT
            t.token,
            MIN(t.block) as deploy_block,
            MIN(t.ts) as deploy_time
          FROM erc20_transfers t
          WHERE LOWER(t."from") = LOWER('${deployer}')
            AND t."to" != '0x0000000000000000000000000000000000000000'
          GROUP BY t.token
        ),
        token_activity AS (
          SELECT 
            dt.token,
            dt.deploy_time,
            COUNT(DISTINCT e."from") as unique_traders,
            COUNT(*) as total_transfers,
            MAX(e.ts) as last_activity
          FROM deployer_tokens dt
          LEFT JOIN erc20_transfers e ON dt.token = e.token
          WHERE e.ts >= dt.deploy_time
          GROUP BY dt.token, dt.deploy_time
        )
        SELECT 
          COUNT(*) as total_deployed,
          SUM(CASE WHEN unique_traders > 100 THEN 1 ELSE 0 END) as successful_tokens,
          AVG(unique_traders) as avg_traders,
          SUM(CASE 
            WHEN last_activity > deploy_time + INTERVAL '7 days' THEN 1 
            ELSE 0 
          END) as long_lived_tokens
        FROM token_activity
      `;
      
      this.db.all(query, (err, results: any[]) => {
        const result = results?.[0];
        if (err) {
          reject(err);
        } else {
          let score = 0;
          let details = '';
          
          if (KNOWN_GOOD_DEPLOYERS.has(deployer.toLowerCase())) {
            score = 30;
            details = 'Verified reputable deployer';
          } else if (result && result.total_deployed > 0) {
            const successRate = (result.successful_tokens || 0) / result.total_deployed;
            const longevityRate = (result.long_lived_tokens || 0) / result.total_deployed;
            
            score = Math.min(30, 
              (successRate * 15) + 
              (longevityRate * 10) + 
              (Math.min(result.total_deployed, 5) * 1)
            );
            
            details = `${result.total_deployed} past launches, ${result.successful_tokens} successful, ${result.avg_traders?.toFixed(0) || 0} avg traders`;
          } else {
            score = 5;
            details = 'New deployer, no history';
          }
          
          resolve({ score, details });
        }
      });
    });
  }
  
  async analyzeTradingPattern(token: string): Promise<{ score: number; details: string; isOrganic: boolean }> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH trading_stats AS (
          SELECT 
            COUNT(DISTINCT "from") as unique_traders,
            COUNT(*) as total_trades,
            COUNT(*) / NULLIF(COUNT(DISTINCT "from"), 0) as trades_per_wallet,
            COUNT(DISTINCT DATE_TRUNC('minute', ts)) as active_minutes,
            MIN(ts) as first_trade,
            MAX(ts) as last_trade,
            STDDEV(CASE WHEN LENGTH(value) < 20 THEN CAST(value AS DOUBLE) ELSE 1000000 END) / 
            NULLIF(AVG(CASE WHEN LENGTH(value) < 20 THEN CAST(value AS DOUBLE) ELSE 1000000 END), 0) as value_variance
          FROM erc20_transfers
          WHERE LOWER(token) = LOWER('${token}')
            AND ts >= (SELECT MAX(ts) - INTERVAL '24 hours' FROM erc20_transfers)
        ),
        wallet_concentration AS (
          SELECT 
            "from" as wallet,
            COUNT(*) as trade_count,
            SUM(CASE WHEN LENGTH(value) < 20 THEN CAST(value AS DOUBLE) ELSE 1000000 END) as total_volume
          FROM erc20_transfers
          WHERE LOWER(token) = LOWER('${token}')
            AND ts >= (SELECT MAX(ts) - INTERVAL '24 hours' FROM erc20_transfers)
          GROUP BY "from"
          ORDER BY trade_count DESC
          LIMIT 10
        )
        SELECT 
          s.*,
          SUM(wc.trade_count) as top10_trades,
          COUNT(wc.wallet) as top10_wallets
        FROM trading_stats s, wallet_concentration wc
        GROUP BY s.unique_traders, s.total_trades, s.trades_per_wallet, 
                 s.active_minutes, s.first_trade, s.last_trade, s.value_variance
      `;
      
      this.db.all(query, (err, results: any[]) => {
        const result = results?.[0];
        if (err) {
          reject(err);
        } else {
          let score = 0;
          let details = '';
          let isOrganic = false;
          
          if (result && result.total_trades > 0) {
            const tradesPerWallet = result.trades_per_wallet || 0;
            const uniqueTraders = result.unique_traders || 0;
            const valueVariance = result.value_variance || 0;
            const top10Concentration = (result.top10_trades || 0) / (result.total_trades || 1);
            
            // Check for organic patterns
            isOrganic = (
              tradesPerWallet < 10 && // Not too many trades per wallet
              uniqueTraders > 20 && // Good number of unique traders
              valueVariance > 0.3 && // Varied trade sizes
              top10Concentration < 0.5 // Not concentrated in few wallets
            );
            
            if (isOrganic) {
              score = 20 + Math.min(5, uniqueTraders / 20);
              details = `${uniqueTraders} organic traders, healthy distribution`;
            } else if (tradesPerWallet > 20) {
              score = 5;
              details = `Bot activity detected (${tradesPerWallet.toFixed(1)} trades/wallet)`;
            } else {
              score = 10;
              details = `${uniqueTraders} traders, mixed activity`;
            }
          } else {
            score = 0;
            details = 'No trading activity';
          }
          
          resolve({ score, details, isOrganic });
        }
      });
    });
  }
  
  async checkLiquidity(pool: string): Promise<{ score: number; details: string }> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH pool_volume AS (
          SELECT 
            COUNT(*) as swap_count,
            SUM(CASE WHEN LENGTH(amount0) < 20 THEN CAST(amount0 AS DOUBLE) ELSE 1000000 END) as total_volume0,
            SUM(CASE WHEN LENGTH(amount1) < 20 THEN CAST(amount1 AS DOUBLE) ELSE 1000000 END) as total_volume1
          FROM dex_events
          WHERE LOWER(pool) = LOWER('${pool}')
            AND event = 'swap'
        )
        SELECT * FROM pool_volume
      `;
      
      this.db.all(query, (err, results: any[]) => {
        const result = results?.[0];
        if (err) {
          reject(err);
        } else {
          let score = 0;
          let details = '';
          
          if (result && result.swap_count > 0) {
            if (result.swap_count > 100) {
              score = 25;
              details = `High liquidity (${result.swap_count} swaps)`;
            } else if (result.swap_count > 20) {
              score = 15;
              details = `Moderate liquidity (${result.swap_count} swaps)`;
            } else {
              score = 5;
              details = `Low liquidity (${result.swap_count} swaps)`;
            }
          } else {
            score = 0;
            details = 'No liquidity data';
          }
          
          resolve({ score, details });
        }
      });
    });
  }
  
  async checkContractSafety(token: string): Promise<{ score: number; details: string }> {
    try {
      // Check if contract exists and get code
      const code = await httpClient.getBytecode({ 
        address: token as `0x${string}` 
      });
      
      if (!code || code === '0x') {
        return { score: 0, details: 'Not a contract' };
      }
      
      // Check for honeypot patterns in bytecode
      const codeStr = code.toString();
      let honeypotRisk = 0;
      
      for (const indicator of HONEYPOT_INDICATORS) {
        if (codeStr.includes(indicator)) {
          honeypotRisk++;
        }
      }
      
      if (honeypotRisk === 0) {
        return { score: 20, details: 'No honeypot indicators found' };
      } else if (honeypotRisk <= 2) {
        return { score: 10, details: `Low risk (${honeypotRisk} warning signs)` };
      } else {
        return { score: 0, details: `High risk (${honeypotRisk} honeypot indicators)` };
      }
    } catch (error) {
      return { score: 5, details: 'Could not verify contract' };
    }
  }
  
  async analyzeToken(launch: TokenLaunch): Promise<TokenSafetyScore> {
    // Determine which token is new (not WETH/USDC/etc)
    const KNOWN_TOKENS = [
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    ];
    
    const token = KNOWN_TOKENS.includes(launch.token0.toLowerCase()) 
      ? launch.token1 
      : launch.token0;
    
    // Run all analyses in parallel
    const [deployer, trading, liquidity, contract] = await Promise.all([
      this.analyzeDeployerHistory(launch.deployer),
      this.analyzeTradingPattern(token),
      this.checkLiquidity(launch.pool),
      this.checkContractSafety(token),
    ]);
    
    const totalScore = deployer.score + trading.score + liquidity.score + contract.score;
    
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    if (totalScore >= 80) {
      riskLevel = 'LOW';
    } else if (totalScore >= 60) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'HIGH';
    }
    
    return {
      token,
      totalScore,
      deployerScore: deployer.score,
      liquidityScore: liquidity.score,
      tradingScore: trading.score,
      contractScore: contract.score,
      riskLevel,
      details: {
        deployerReputation: deployer.details,
        liquidityStatus: liquidity.details,
        tradingPattern: trading.details + (trading.isOrganic ? ' ✓' : ' ⚠'),
        contractSafety: contract.details,
      },
    };
  }
  
  async findSafeTokens(hoursBack: number = 24): Promise<void> {
    console.log(`\n🔍 Analyzing tokens launched in the last ${hoursBack} hours...\n`);
    
    try {
      const launches = await this.findNewTokenLaunches(hoursBack);
      console.log(`Found ${launches.length} new token launches\n`);
      
      if (launches.length === 0) {
        console.log('No new tokens found in the specified timeframe.');
        return;
      }
      
      const safeTokens: TokenSafetyScore[] = [];
      const riskyTokens: TokenSafetyScore[] = [];
      
      // Analyze each token
      for (const launch of launches.slice(0, 20)) { // Limit to 20 for performance
        console.log(`Analyzing ${launch.token0.substring(0, 10)}...`);
        const score = await this.analyzeToken(launch);
        
        if (score.riskLevel === 'LOW') {
          safeTokens.push(score);
        } else {
          riskyTokens.push(score);
        }
      }
      
      // Display results
      console.log('\n' + '='.repeat(70));
      console.log('🎯 SAFE NEW TOKENS (Score 80+/100)');
      console.log('='.repeat(70) + '\n');
      
      if (safeTokens.length === 0) {
        console.log('❌ No safe tokens found meeting criteria\n');
      } else {
        safeTokens.sort((a, b) => b.totalScore - a.totalScore);
        
        for (let i = 0; i < safeTokens.length; i++) {
          const token = safeTokens[i];
          console.log(`${i + 1}. Token: ${token.token}`);
          console.log(`   Score: ${token.totalScore}/100 ✅ ${token.riskLevel} RISK`);
          console.log(`   ├─ Deployer (${token.deployerScore}/30): ${token.details.deployerReputation}`);
          console.log(`   ├─ Liquidity (${token.liquidityScore}/25): ${token.details.liquidityStatus}`);
          console.log(`   ├─ Trading (${token.tradingScore}/25): ${token.details.tradingPattern}`);
          console.log(`   └─ Contract (${token.contractScore}/20): ${token.details.contractSafety}`);
          console.log('');
        }
      }
      
      console.log('\n' + '='.repeat(70));
      console.log('⚠️  RISKY/MODERATE TOKENS (Score <80/100)');
      console.log('='.repeat(70) + '\n');
      
      if (riskyTokens.length > 0) {
        riskyTokens
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 5)
          .forEach((token, i) => {
            console.log(`${i + 1}. ${token.token.substring(0, 10)}... (Score: ${token.totalScore}/100 - ${token.riskLevel} RISK)`);
          });
      }
      
      console.log('\n' + '='.repeat(70));
      console.log('📊 SUMMARY');
      console.log('='.repeat(70));
      console.log(`Total tokens analyzed: ${safeTokens.length + riskyTokens.length}`);
      console.log(`Safe tokens (80+ score): ${safeTokens.length}`);
      console.log(`Moderate risk (60-79): ${riskyTokens.filter(t => t.totalScore >= 60).length}`);
      console.log(`High risk (<60): ${riskyTokens.filter(t => t.totalScore < 60).length}`);
      
    } catch (error) {
      console.error('Error analyzing tokens:', error);
    }
  }
  
  close() {
    this.db.close();
  }
}

// Main execution
async function main() {
  const analyzer = new TokenSafetyAnalyzer();
  
  try {
    await analyzer.findSafeTokens(24); // Last 24 hours
  } finally {
    analyzer.close();
  }
}

main().catch(console.error);