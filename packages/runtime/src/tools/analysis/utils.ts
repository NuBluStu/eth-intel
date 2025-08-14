/**
 * Analysis Utilities
 * Mathematical, statistical, and pattern detection functions
 */

// Statistical Functions
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

export function standardDeviation(values: number[]): number {
  const avg = mean(values);
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Pattern Detection
export interface Pattern {
  type: string;
  confidence: number;
  data: any;
}

export function detectPumpAndDump(
  prices: { timestamp: number; price: number }[],
  threshold = 2.0, // 2x price increase
  timeWindow = 86400 // 24 hours
): Pattern | null {
  if (prices.length < 2) return null;
  
  let maxIncrease = 0;
  let pumpStart = 0;
  let pumpEnd = 0;
  let dumpEnd = 0;
  
  for (let i = 0; i < prices.length - 1; i++) {
    const startPrice = prices[i].price;
    const startTime = prices[i].timestamp;
    
    // Look for pump
    for (let j = i + 1; j < prices.length; j++) {
      const currentPrice = prices[j].price;
      const currentTime = prices[j].timestamp;
      
      if (currentTime - startTime > timeWindow) break;
      
      const increase = currentPrice / startPrice;
      if (increase > maxIncrease && increase >= threshold) {
        maxIncrease = increase;
        pumpStart = i;
        pumpEnd = j;
        
        // Look for dump after pump
        for (let k = j + 1; k < prices.length; k++) {
          if (prices[k].price < startPrice * 1.1) {
            dumpEnd = k;
            break;
          }
        }
      }
    }
  }
  
  if (maxIncrease >= threshold && dumpEnd > pumpEnd) {
    return {
      type: "pump_and_dump",
      confidence: Math.min(maxIncrease / threshold, 1.0),
      data: {
        pumpStart: prices[pumpStart],
        pumpPeak: prices[pumpEnd],
        dumpEnd: prices[dumpEnd],
        maxIncrease,
        duration: prices[dumpEnd].timestamp - prices[pumpStart].timestamp
      }
    };
  }
  
  return null;
}

export function detectWashTrading(
  trades: { from: string; to: string; amount: bigint; timestamp: number }[],
  timeWindow = 3600 // 1 hour
): Pattern[] {
  const patterns: Pattern[] = [];
  const addressPairs = new Map<string, any[]>();
  
  // Group trades by address pairs
  for (const trade of trades) {
    const key = [trade.from, trade.to].sort().join("-");
    if (!addressPairs.has(key)) {
      addressPairs.set(key, []);
    }
    addressPairs.get(key)!.push(trade);
  }
  
  // Look for circular trades
  for (const [pair, pairTrades] of addressPairs) {
    const [addr1, addr2] = pair.split("-");
    
    // Check for back-and-forth trades within time window
    for (let i = 0; i < pairTrades.length - 1; i++) {
      const trade1 = pairTrades[i];
      const trade2 = pairTrades[i + 1];
      
      if (Math.abs(trade2.timestamp - trade1.timestamp) <= timeWindow &&
          trade1.from !== trade2.from) {
        patterns.push({
          type: "wash_trading",
          confidence: 0.8,
          data: {
            address1: addr1,
            address2: addr2,
            trades: [trade1, trade2],
            timeGap: trade2.timestamp - trade1.timestamp
          }
        });
      }
    }
  }
  
  return patterns;
}

// Relationship Mapping
export interface WalletRelationship {
  wallet1: string;
  wallet2: string;
  type: string;
  strength: number;
  evidence: any[];
}

export function findRelatedWallets(
  transactions: { from: string; to: string; timestamp: number; value: bigint }[]
): WalletRelationship[] {
  const relationships: WalletRelationship[] = [];
  const interactions = new Map<string, number>();
  const timings = new Map<string, number[]>();
  
  // Count interactions between wallets
  for (const tx of transactions) {
    const key = [tx.from, tx.to].sort().join("-");
    interactions.set(key, (interactions.get(key) || 0) + 1);
    
    if (!timings.has(key)) {
      timings.set(key, []);
    }
    timings.get(key)!.push(tx.timestamp);
  }
  
  // Analyze relationships
  for (const [pair, count] of interactions) {
    const [wallet1, wallet2] = pair.split("-");
    const timestamps = timings.get(pair)!;
    
    // Calculate time gaps between transactions
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }
    
    // Determine relationship type
    let type = "transacted";
    let strength = Math.min(count / 10, 1.0); // Normalize to 0-1
    
    if (gaps.length > 0) {
      const avgGap = mean(gaps);
      const stdGap = standardDeviation(gaps);
      
      // Regular pattern suggests automated/bot behavior
      if (stdGap < avgGap * 0.1 && count >= 5) {
        type = "automated";
        strength = 0.9;
      }
      // Frequent interactions suggest close relationship
      else if (count >= 10 && avgGap < 86400) {
        type = "frequent";
        strength = 0.8;
      }
    }
    
    relationships.push({
      wallet1,
      wallet2,
      type,
      strength,
      evidence: timestamps.slice(0, 5) // First 5 interactions as evidence
    });
  }
  
  return relationships;
}

// Portfolio Analysis
export interface PortfolioMetrics {
  totalValue: bigint;
  tokenCount: number;
  diversification: number; // 0-1, higher is more diverse
  topHoldings: { token: string; balance: bigint; percentage: number }[];
  riskScore: number; // 0-1, higher is riskier
}

export function analyzePortfolio(
  holdings: { token: string; balance: bigint; price?: number }[]
): PortfolioMetrics {
  // Calculate total value
  let totalValue = BigInt(0);
  const values: bigint[] = [];
  
  for (const holding of holdings) {
    const value = holding.price 
      ? BigInt(Math.floor(Number(holding.balance) * holding.price))
      : holding.balance;
    values.push(value);
    totalValue += value;
  }
  
  // Calculate diversification (using Herfindahl index)
  let herfindahl = 0;
  for (const value of values) {
    if (totalValue > 0) {
      const share = Number(value * BigInt(10000) / totalValue) / 10000;
      herfindahl += share * share;
    }
  }
  const diversification = totalValue > 0 ? 1 - herfindahl : 0;
  
  // Get top holdings
  const sortedHoldings = holdings
    .map((h, i) => ({
      token: h.token,
      balance: h.balance,
      value: values[i],
      percentage: totalValue > 0 
        ? Number(values[i] * BigInt(10000) / totalValue) / 100 
        : 0
    }))
    .sort((a, b) => Number(b.value - a.value))
    .slice(0, 10);
  
  // Calculate risk score (concentration risk)
  const top3Percentage = sortedHoldings
    .slice(0, 3)
    .reduce((sum, h) => sum + h.percentage, 0);
  const riskScore = top3Percentage / 100; // Higher concentration = higher risk
  
  return {
    totalValue,
    tokenCount: holdings.length,
    diversification,
    topHoldings: sortedHoldings.map(h => ({
      token: h.token,
      balance: h.balance,
      percentage: h.percentage
    })),
    riskScore
  };
}

// Backtesting
export interface BacktestResult {
  strategy: string;
  startValue: number;
  endValue: number;
  returns: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  trades: number;
}

export function backtest(
  strategy: (data: any, position: any) => "buy" | "sell" | "hold",
  priceData: { timestamp: number; price: number }[],
  initialCapital = 10000
): BacktestResult {
  let capital = initialCapital;
  let position = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  const returns: number[] = [];
  const values: number[] = [initialCapital];
  
  for (let i = 1; i < priceData.length; i++) {
    const prevPrice = priceData[i - 1].price;
    const currentPrice = priceData[i].price;
    const signal = strategy(priceData.slice(0, i + 1), position);
    
    if (signal === "buy" && position === 0) {
      position = capital / currentPrice;
      capital = 0;
      trades++;
    } else if (signal === "sell" && position > 0) {
      const proceeds = position * currentPrice;
      const returnPct = (proceeds - capital) / capital;
      returns.push(returnPct);
      if (returnPct > 0) wins++;
      else losses++;
      
      capital = proceeds;
      position = 0;
      trades++;
    }
    
    // Track portfolio value
    const currentValue = capital + position * currentPrice;
    values.push(currentValue);
  }
  
  // Final position value
  if (position > 0) {
    capital += position * priceData[priceData.length - 1].price;
  }
  
  // Calculate metrics
  const finalReturns = (capital - initialCapital) / initialCapital;
  
  // Max drawdown
  let maxDrawdown = 0;
  let peak = values[0];
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Sharpe ratio (simplified)
  const avgReturn = returns.length > 0 ? mean(returns) : 0;
  const stdReturn = returns.length > 0 ? standardDeviation(returns) : 1;
  const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;
  
  return {
    strategy: "custom",
    startValue: initialCapital,
    endValue: capital,
    returns: finalReturns,
    maxDrawdown,
    sharpeRatio,
    winRate: trades > 0 ? wins / trades : 0,
    trades
  };
}

// Graph/Network Analysis
export function findClusters(
  edges: { from: string; to: string; weight?: number }[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  // Build adjacency list
  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, new Set());
    if (!graph.has(edge.to)) graph.set(edge.to, new Set());
    graph.get(edge.from)!.add(edge.to);
    graph.get(edge.to)!.add(edge.from);
  }
  
  // Find connected components using DFS
  const visited = new Set<string>();
  const clusters = new Map<string, Set<string>>();
  let clusterId = 0;
  
  function dfs(node: string, cluster: Set<string>) {
    visited.add(node);
    cluster.add(node);
    
    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, cluster);
      }
    }
  }
  
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cluster = new Set<string>();
      dfs(node, cluster);
      clusters.set(`cluster_${clusterId++}`, cluster);
    }
  }
  
  return clusters;
}

// Export namespace for tool integration
export const analysisUtils = {
  // Statistics
  mean,
  median,
  standardDeviation,
  percentile,
  
  // Pattern Detection
  detectPumpAndDump,
  detectWashTrading,
  
  // Relationships
  findRelatedWallets,
  findClusters,
  
  // Portfolio
  analyzePortfolio,
  
  // Backtesting
  backtest
};