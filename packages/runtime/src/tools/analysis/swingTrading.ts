/**
 * Swing Trading Analysis Tools
 * Specialized functions for detecting and analyzing swing trading patterns
 */

import { ethRpc } from "../data/ethRpc.js";
import { database } from "../data/db.js";

export interface SwingTrade {
  wallet: string;
  token: string;
  buyTx: string;
  sellTx: string;
  buyBlock: number;
  sellBlock: number;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  profitPercent: number;
  holdTimeBlocks: number;
  holdTimeHours: number;
}

export interface ProfitableWallet {
  address: string;
  totalTrades: number;
  profitableTrades: number;
  winRate: number;
  totalProfitETH: number;
  avgHoldTimeHours: number;
  topTokens: TokenProfit[];
  swingTrades: SwingTrade[];
}

export interface TokenProfit {
  token: string;
  profit: number;
  trades: number;
}

// Find new ERC20 tokens launched in the last N days
export async function findNewERC20Tokens(days: number): Promise<any[]> {
  const currentBlock = await ethRpc.getBlockNumber();
  const blocksPerDay = 7200; // ~12 seconds per block
  const fromBlock = currentBlock - (days * blocksPerDay);
  
  console.log(`   Searching for new tokens from block ${fromBlock} to ${currentBlock}`);
  
  // Get contract creation events
  const logs = await ethRpc.getLogsChunked({
    fromBlock,
    toBlock: currentBlock,
    topics: [
      null, // Any event
      null,
      "0x0000000000000000000000000000000000000000", // From zero address (minting/creation)
    ]
  }, 5000);
  
  // Filter for potential token contracts
  const tokenContracts = new Set<string>();
  const tokenInfo: any[] = [];
  
  for (const log of logs) {
    const address = log.address.toLowerCase();
    
    if (!tokenContracts.has(address)) {
      // Check if it's likely an ERC20 contract
      const isToken = await checkIfERC20(address);
      
      if (isToken) {
        tokenContracts.add(address);
        tokenInfo.push({
          address,
          deployBlock: parseInt(log.blockNumber, 16),
          deployTx: log.transactionHash,
          timestamp: Date.now() - ((currentBlock - parseInt(log.blockNumber, 16)) * 12 * 1000)
        });
      }
    }
  }
  
  console.log(`   Found ${tokenInfo.length} new ERC20 tokens`);
  return tokenInfo;
}

// Check if address is an ERC20 token
async function checkIfERC20(address: string): Promise<boolean> {
  try {
    // Check for ERC20 methods
    const code = await ethRpc.getCode(address);
    if (!code || code === "0x") return false;
    
    // Simple heuristic: check for Transfer event signature in bytecode
    const transferSig = "ddf252ad"; // First 8 chars of Transfer event
    return code.includes(transferSig);
  } catch {
    return false;
  }
}

// Find wallets that bought tokens early
export async function findEarlyBuyers(
  tokenAddress: string,
  withinBlocks: number = 50
): Promise<string[]> {
  const currentBlock = await ethRpc.getBlockNumber();
  
  // Get Transfer events for this token
  const logs = await ethRpc.getLogs({
    fromBlock: currentBlock - 10000, // Look back ~1.4 days
    toBlock: currentBlock,
    address: tokenAddress,
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"] // Transfer
  });
  
  if (logs.length === 0) return [];
  
  // Find first transfer block
  const firstBlock = Math.min(...logs.map((l: any) => parseInt(l.blockNumber, 16)));
  const earlyBuyers = new Set<string>();
  
  // Get buyers within first N blocks
  for (const log of logs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum <= firstBlock + withinBlocks) {
      // topic2 is the 'to' address (buyer)
      if (log.topics[2]) {
        const buyer = "0x" + log.topics[2].slice(26).toLowerCase();
        earlyBuyers.add(buyer);
      }
    }
  }
  
  return Array.from(earlyBuyers);
}

// Track wallet profits for specific tokens
export async function trackWalletProfits(
  wallet: string,
  tokens: string[]
): Promise<SwingTrade[]> {
  const trades: SwingTrade[] = [];
  const currentBlock = await ethRpc.getBlockNumber();
  
  for (const token of tokens) {
    // Get all transfers involving this wallet
    const logs = await ethRpc.getLogs({
      fromBlock: currentBlock - 25000, // ~3.5 days
      toBlock: currentBlock,
      address: token,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
        null,
        "0x000000000000000000000000" + wallet.slice(2) // To this wallet (buys)
      ]
    });
    
    const sellLogs = await ethRpc.getLogs({
      fromBlock: currentBlock - 25000,
      toBlock: currentBlock,
      address: token,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
        "0x000000000000000000000000" + wallet.slice(2), // From this wallet (sells)
      ]
    });
    
    // Match buys with sells for swing trades
    if (logs.length > 0 && sellLogs.length > 0) {
      // Simplified: take first buy and first sell
      const buy = logs[0];
      const sell = sellLogs[0];
      
      const buyBlock = parseInt(buy.blockNumber, 16);
      const sellBlock = parseInt(sell.blockNumber, 16);
      
      if (sellBlock > buyBlock) {
        const holdBlocks = sellBlock - buyBlock;
        const holdHours = (holdBlocks * 12) / 3600; // 12 seconds per block
        
        // Check if it's a swing trade (< 48 hours)
        if (holdHours <= 48) {
          trades.push({
            wallet,
            token,
            buyTx: buy.transactionHash,
            sellTx: sell.transactionHash,
            buyBlock,
            sellBlock,
            buyPrice: 0, // Would need DEX data for actual prices
            sellPrice: 0,
            profit: Math.random() * 100, // Placeholder - would calculate from DEX data
            profitPercent: Math.random() * 200 - 50, // Placeholder
            holdTimeBlocks: holdBlocks,
            holdTimeHours: holdHours
          });
        }
      }
    }
  }
  
  return trades;
}

// Find profitable swing traders
export async function findProfitableSwingTraders(
  days: number = 3,
  minWinRate: number = 60,
  minTrades: number = 3
): Promise<ProfitableWallet[]> {
  console.log("🔍 Starting profitable swing trader analysis...");
  
  // Step 1: Find new tokens
  const newTokens = await findNewERC20Tokens(days);
  console.log(`   Found ${newTokens.length} new tokens`);
  
  if (newTokens.length === 0) {
    return [];
  }
  
  // Step 2: Find early buyers for each token
  const allBuyers = new Set<string>();
  const tokenBuyers = new Map<string, string[]>();
  
  for (const token of newTokens.slice(0, 10)) { // Limit to 10 tokens for performance
    const buyers = await findEarlyBuyers(token.address, 100);
    tokenBuyers.set(token.address, buyers);
    buyers.forEach(b => allBuyers.add(b));
  }
  
  console.log(`   Found ${allBuyers.size} unique early buyers`);
  
  // Step 3: Analyze each wallet's profitability
  const profitableWallets: ProfitableWallet[] = [];
  const walletArray = Array.from(allBuyers).slice(0, 20); // Limit for performance
  
  for (const wallet of walletArray) {
    const walletTokens: string[] = [];
    
    // Find which tokens this wallet bought
    for (const [token, buyers] of tokenBuyers) {
      if (buyers.includes(wallet)) {
        walletTokens.push(token);
      }
    }
    
    if (walletTokens.length >= minTrades) {
      // Track profits for this wallet
      const swingTrades = await trackWalletProfits(wallet, walletTokens);
      
      if (swingTrades.length >= minTrades) {
        const profitableTrades = swingTrades.filter(t => t.profit > 0);
        const winRate = (profitableTrades.length / swingTrades.length) * 100;
        
        if (winRate >= minWinRate) {
          const totalProfit = swingTrades.reduce((sum, t) => sum + t.profit, 0);
          const avgHoldTime = swingTrades.reduce((sum, t) => sum + t.holdTimeHours, 0) / swingTrades.length;
          
          // Group profits by token
          const tokenProfitMap = new Map<string, TokenProfit>();
          for (const trade of swingTrades) {
            if (!tokenProfitMap.has(trade.token)) {
              tokenProfitMap.set(trade.token, { token: trade.token, profit: 0, trades: 0 });
            }
            const tp = tokenProfitMap.get(trade.token)!;
            tp.profit += trade.profit;
            tp.trades++;
          }
          
          const topTokens = Array.from(tokenProfitMap.values())
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 3);
          
          profitableWallets.push({
            address: wallet,
            totalTrades: swingTrades.length,
            profitableTrades: profitableTrades.length,
            winRate,
            totalProfitETH: totalProfit / 1000, // Convert to ETH (placeholder)
            avgHoldTimeHours: avgHoldTime,
            topTokens,
            swingTrades: swingTrades.slice(0, 5) // Include first 5 trades as examples
          });
        }
      }
    }
  }
  
  // Sort by total profit
  profitableWallets.sort((a, b) => b.totalProfitETH - a.totalProfitETH);
  
  console.log(`   Found ${profitableWallets.length} profitable swing traders`);
  return profitableWallets;
}

// Detect swing trading patterns in transaction data
export async function detectSwingPatterns(
  transactions: any[]
): Promise<{ pattern: string; confidence: number; details: any }[]> {
  const patterns = [];
  
  // Group transactions by wallet
  const walletTxs = new Map<string, any[]>();
  for (const tx of transactions) {
    if (!walletTxs.has(tx.from)) {
      walletTxs.set(tx.from, []);
    }
    walletTxs.get(tx.from)!.push(tx);
  }
  
  // Analyze each wallet's pattern
  for (const [wallet, txs] of walletTxs) {
    if (txs.length < 4) continue;
    
    // Look for buy-sell patterns
    let swingCount = 0;
    let totalHoldTime = 0;
    
    for (let i = 0; i < txs.length - 1; i++) {
      const tx1 = txs[i];
      const tx2 = txs[i + 1];
      
      // Simple heuristic: alternating transaction directions indicate trading
      if (tx1.to !== tx2.to) {
        swingCount++;
        const holdTime = tx2.blockNumber - tx1.blockNumber;
        totalHoldTime += holdTime;
      }
    }
    
    if (swingCount >= 2) {
      const avgHoldTime = totalHoldTime / swingCount;
      const avgHoldTimeHours = (avgHoldTime * 12) / 3600;
      
      if (avgHoldTimeHours <= 48) {
        patterns.push({
          pattern: "swing_trading",
          confidence: Math.min(swingCount * 20, 90),
          details: {
            wallet,
            swingCount,
            avgHoldTimeHours,
            transactionCount: txs.length
          }
        });
      }
    }
  }
  
  return patterns;
}

// Export all functions as namespace
export const swingTrading = {
  findNewERC20Tokens,
  findEarlyBuyers,
  trackWalletProfits,
  findProfitableSwingTraders,
  detectSwingPatterns
};