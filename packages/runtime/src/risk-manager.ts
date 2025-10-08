/**
 * RISK MANAGER - Advanced Portfolio Risk Management & Optimization
 *
 * Implements Kelly Criterion, dynamic position sizing, portfolio rebalancing,
 * and comprehensive risk assessment for maximum profit with controlled risk
 */

import { formatEther, parseEther } from 'viem';

interface Position {
  token: string;
  symbol: string;
  amount: bigint;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  allocation: number; // Percentage of portfolio
  riskScore: number; // 1-10
  confidence: number; // 0-1
  strategy: string;
  entryTime: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface RiskMetrics {
  totalValue: number;
  totalUnrealizedPnL: number;
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  betaToETH: number;
  valueAtRisk: number; // 5% VaR
  riskScore: number; // 1-10 overall portfolio risk
}

interface RiskLimits {
  maxPositionSize: number; // Max % of portfolio per position
  maxRiskPerTrade: number; // Max % risk per trade
  maxCorrelationExposure: number; // Max exposure to correlated assets
  maxTotalLeverage: number; // Max portfolio leverage
  maxDrawdown: number; // Stop trading if exceeded
  minLiquidity: number; // Min liquidity for position entry
}

interface OptimizationTarget {
  targetReturn: number; // Expected annual return
  maxRisk: number; // Maximum acceptable risk
  timeHorizon: number; // Investment horizon in days
  rebalanceFrequency: number; // Rebalance every N days
}

interface RebalanceAction {
  type: 'buy' | 'sell' | 'hold';
  token: string;
  currentWeight: number;
  targetWeight: number;
  adjustmentAmount: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasoning: string;
}

class RiskManager {
  private positions: Map<string, Position>;
  private riskLimits: RiskLimits;
  private optimizationTarget: OptimizationTarget;
  private priceHistory: Map<string, number[]>;
  private portfolioHistory: { timestamp: number; value: number; pnl: number }[];

  constructor() {
    this.positions = new Map();
    this.priceHistory = new Map();
    this.portfolioHistory = [];

    // Conservative risk limits for profit maximization
    this.riskLimits = {
      maxPositionSize: 0.25, // Max 25% per position
      maxRiskPerTrade: 0.05, // Max 5% risk per trade
      maxCorrelationExposure: 0.40, // Max 40% in correlated assets
      maxTotalLeverage: 1.5, // Max 1.5x leverage
      maxDrawdown: 0.20, // Stop if 20% drawdown
      minLiquidity: 10, // Min $10k liquidity for entry
    };

    // Aggressive optimization for maximum profit
    this.optimizationTarget = {
      targetReturn: 2.0, // 200% annual return target
      maxRisk: 0.30, // 30% max risk tolerance
      timeHorizon: 365, // 1 year horizon
      rebalanceFrequency: 7, // Weekly rebalancing
    };
  }

  addPosition(position: Position): void {
    this.positions.set(position.token, position);
    console.log(`📊 Added position: ${position.symbol} (${(position.allocation * 100).toFixed(1)}%)`);
  }

  updatePosition(token: string, updates: Partial<Position>): void {
    const position = this.positions.get(token);
    if (!position) return;

    Object.assign(position, updates);

    // Recalculate derived metrics
    position.marketValue = Number(formatEther(position.amount)) * position.currentPrice;
    position.unrealizedPnL = position.marketValue - (Number(formatEther(position.amount)) * position.entryPrice);

    this.positions.set(token, position);
  }

  calculatePortfolioRisk(): RiskMetrics {
    const positions = Array.from(this.positions.values());

    if (positions.length === 0) {
      return {
        totalValue: 0,
        totalUnrealizedPnL: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        volatility: 0,
        betaToETH: 0,
        valueAtRisk: 0,
        riskScore: 1,
      };
    }

    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    // Calculate portfolio metrics
    const returns = this.calculatePortfolioReturns();
    const volatility = this.calculateVolatility(returns);
    const sharpeRatio = this.calculateSharpeRatio(returns, volatility);
    const maxDrawdown = this.calculateMaxDrawdown();
    const valueAtRisk = this.calculateVaR(returns, 0.05); // 5% VaR
    const betaToETH = this.calculateBetaToETH(positions);

    // Overall risk score (1-10)
    let riskScore = 1;
    riskScore += volatility > 0.5 ? 3 : volatility > 0.3 ? 2 : 1;
    riskScore += maxDrawdown > 0.15 ? 2 : maxDrawdown > 0.10 ? 1 : 0;
    riskScore += this.calculateConcentrationRisk() > 0.5 ? 2 : 1;
    riskScore += this.calculateCorrelationRisk() > 0.7 ? 2 : 1;

    return {
      totalValue,
      totalUnrealizedPnL,
      sharpeRatio,
      maxDrawdown,
      volatility,
      betaToETH,
      valueAtRisk,
      riskScore: Math.min(10, riskScore),
    };
  }

  calculateOptimalPositionSize(
    expectedReturn: number,
    probability: number,
    riskScore: number,
    portfolioValue: number
  ): number {
    // Kelly Criterion with risk adjustments
    const winAmount = expectedReturn - 1; // Profit ratio
    const lossAmount = 1; // Max loss assumption

    // Basic Kelly fraction
    let kellyFraction = (probability * winAmount - (1 - probability) * lossAmount) / winAmount;

    // Risk adjustments
    const riskAdjustment = Math.max(0.1, 1 - (riskScore - 1) / 9);
    kellyFraction *= riskAdjustment;

    // Portfolio concentration limit
    const concentrationLimit = this.riskLimits.maxPositionSize;
    const maxRiskLimit = this.riskLimits.maxRiskPerTrade;

    // Apply limits
    const optimalFraction = Math.min(kellyFraction, concentrationLimit, maxRiskLimit);
    const positionSize = portfolioValue * Math.max(0, optimalFraction);

    return positionSize;
  }

  optimizePortfolio(): RebalanceAction[] {
    console.log('🎯 Optimizing portfolio allocation...');

    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const actions: RebalanceAction[] = [];

    // Calculate optimal weights using Modern Portfolio Theory
    const optimalWeights = this.calculateOptimalWeights(positions);

    for (const position of positions) {
      const currentWeight = position.marketValue / totalValue;
      const targetWeight = optimalWeights.get(position.token) || 0;
      const weightDiff = targetWeight - currentWeight;

      if (Math.abs(weightDiff) > 0.02) { // 2% threshold for rebalancing
        const adjustmentValue = weightDiff * totalValue;

        actions.push({
          type: weightDiff > 0 ? 'buy' : 'sell',
          token: position.token,
          currentWeight,
          targetWeight,
          adjustmentAmount: Math.abs(adjustmentValue),
          priority: Math.abs(weightDiff) > 0.05 ? 'HIGH' : 'MEDIUM',
          reasoning: weightDiff > 0
            ? `Underweight: increase by ${(weightDiff * 100).toFixed(1)}%`
            : `Overweight: reduce by ${(Math.abs(weightDiff) * 100).toFixed(1)}%`,
        });
      }
    }

    // Sort by priority and impact
    actions.sort((a, b) => {
      const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];

      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.adjustmentAmount - a.adjustmentAmount;
    });

    console.log(`Generated ${actions.length} rebalancing actions`);
    return actions;
  }

  private calculateOptimalWeights(positions: Position[]): Map<string, number> {
    const weights = new Map<string, number>();

    // Simple optimization based on risk-adjusted returns
    const totalScore = positions.reduce((sum, p) => {
      const riskAdjustedReturn = (p.confidence * p.unrealizedPnL) / Math.max(p.riskScore, 1);
      return sum + Math.max(0, riskAdjustedReturn);
    }, 0);

    for (const position of positions) {
      const riskAdjustedReturn = (position.confidence * p.unrealizedPnL) / Math.max(position.riskScore, 1);
      const rawWeight = Math.max(0, riskAdjustedReturn) / totalScore;

      // Apply position size limits
      const constrainedWeight = Math.min(rawWeight, this.riskLimits.maxPositionSize);
      weights.set(position.token, constrainedWeight);
    }

    // Normalize weights to sum to 1
    const totalWeight = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      for (const [token, weight] of weights) {
        weights.set(token, weight / totalWeight);
      }
    }

    return weights;
  }

  assessTradeRisk(trade: {
    token: string;
    amount: number;
    expectedReturn: number;
    confidence: number;
    riskScore: number;
    timeHorizon: number;
  }): {
    approved: boolean;
    reasoning: string;
    recommendedSize?: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const portfolioMetrics = this.calculatePortfolioRisk();

    // Check position size limits
    const positionSize = trade.amount / portfolioMetrics.totalValue;
    if (positionSize > this.riskLimits.maxPositionSize) {
      warnings.push(`Position size ${(positionSize * 100).toFixed(1)}% exceeds limit of ${(this.riskLimits.maxPositionSize * 100).toFixed(1)}%`);
    }

    // Check risk concentration
    const currentRiskScore = portfolioMetrics.riskScore;
    if (trade.riskScore > 7 && currentRiskScore > 6) {
      warnings.push('High risk trade while portfolio risk is already elevated');
    }

    // Check correlation risk
    const correlationRisk = this.calculateNewPositionCorrelationRisk(trade.token);
    if (correlationRisk > this.riskLimits.maxCorrelationExposure) {
      warnings.push(`High correlation risk: ${(correlationRisk * 100).toFixed(1)}%`);
    }

    // Check liquidity requirements
    if (trade.amount < this.riskLimits.minLiquidity) {
      warnings.push(`Position size below minimum liquidity requirement`);
    }

    // Calculate recommended size using Kelly Criterion
    const recommendedSize = this.calculateOptimalPositionSize(
      trade.expectedReturn,
      trade.confidence,
      trade.riskScore,
      portfolioMetrics.totalValue
    );

    // Approve trade if within risk limits
    const approved = warnings.length === 0 ||
      (warnings.length === 1 && warnings[0].includes('Position size')) &&
      recommendedSize > 0;

    return {
      approved,
      reasoning: approved
        ? `Trade approved with ${warnings.length} minor warnings`
        : `Trade rejected: ${warnings.join(', ')}`,
      recommendedSize: approved ? recommendedSize : undefined,
      warnings,
    };
  }

  setStopLossAndTakeProfit(
    token: string,
    stopLossPercent: number = 0.10, // 10% stop loss
    takeProfitPercent: number = 0.30  // 30% take profit
  ): void {
    const position = this.positions.get(token);
    if (!position) return;

    position.stopLoss = position.entryPrice * (1 - stopLossPercent);
    position.takeProfit = position.entryPrice * (1 + takeProfitPercent);

    this.positions.set(token, position);
    console.log(`🛡️ Set stop loss: ${position.stopLoss?.toFixed(4)} | Take profit: ${position.takeProfit?.toFixed(4)}`);
  }

  checkStopLossAndTakeProfit(): { stopLosses: string[]; takeProfits: string[] } {
    const stopLosses: string[] = [];
    const takeProfits: string[] = [];

    for (const [token, position] of this.positions) {
      if (position.stopLoss && position.currentPrice <= position.stopLoss) {
        stopLosses.push(token);
        console.log(`🚨 Stop loss triggered for ${position.symbol}: ${position.currentPrice} <= ${position.stopLoss}`);
      }

      if (position.takeProfit && position.currentPrice >= position.takeProfit) {
        takeProfits.push(token);
        console.log(`🎯 Take profit triggered for ${position.symbol}: ${position.currentPrice} >= ${position.takeProfit}`);
      }
    }

    return { stopLosses, takeProfits };
  }

  private calculatePortfolioReturns(): number[] {
    if (this.portfolioHistory.length < 2) return [0];

    const returns = [];
    for (let i = 1; i < this.portfolioHistory.length; i++) {
      const prevValue = this.portfolioHistory[i - 1].value;
      const currValue = this.portfolioHistory[i].value;
      const return_ = (currValue - prevValue) / prevValue;
      returns.push(return_);
    }

    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private calculateSharpeRatio(returns: number[], volatility: number): number {
    if (volatility === 0) return 0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const riskFreeRate = 0.02 / 365; // 2% annual risk-free rate, daily
    return (meanReturn - riskFreeRate) / volatility;
  }

  private calculateMaxDrawdown(): number {
    if (this.portfolioHistory.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = this.portfolioHistory[0].value;

    for (const record of this.portfolioHistory) {
      if (record.value > peak) {
        peak = record.value;
      }
      const drawdown = (peak - record.value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length < 10) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    return Math.abs(sortedReturns[index] || 0);
  }

  private calculateBetaToETH(positions: Position[]): number {
    // Simplified beta calculation - would use historical correlation in reality
    return positions.reduce((sum, p) => sum + p.allocation * 0.8, 0); // Assume 0.8 average beta
  }

  private calculateConcentrationRisk(): number {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

    if (totalValue === 0) return 0;

    const maxPosition = Math.max(...positions.map(p => p.marketValue / totalValue));
    return maxPosition;
  }

  private calculateCorrelationRisk(): number {
    // Simplified correlation risk - would use actual correlation matrix
    const positions = Array.from(this.positions.values());
    const highRiskPositions = positions.filter(p => p.riskScore > 6);
    const highRiskWeight = highRiskPositions.reduce((sum, p) => sum + p.allocation, 0);

    return highRiskWeight;
  }

  private calculateNewPositionCorrelationRisk(token: string): number {
    // Mock correlation calculation - would use real correlation data
    const similarTokens = ['defi', 'meme', 'gaming']; // Categories
    const currentExposure = Array.from(this.positions.values())
      .filter(p => similarTokens.some(cat => p.symbol.toLowerCase().includes(cat)))
      .reduce((sum, p) => sum + p.allocation, 0);

    return currentExposure;
  }

  updatePriceHistory(token: string, price: number): void {
    if (!this.priceHistory.has(token)) {
      this.priceHistory.set(token, []);
    }

    const history = this.priceHistory.get(token)!;
    history.push(price);

    // Keep only last 100 data points
    if (history.length > 100) {
      history.shift();
    }

    this.priceHistory.set(token, history);
  }

  updatePortfolioHistory(): void {
    const metrics = this.calculatePortfolioRisk();
    this.portfolioHistory.push({
      timestamp: Date.now(),
      value: metrics.totalValue,
      pnl: metrics.totalUnrealizedPnL,
    });

    // Keep only last 1000 records
    if (this.portfolioHistory.length > 1000) {
      this.portfolioHistory.shift();
    }
  }

  getPortfolioSummary(): {
    positions: Position[];
    metrics: RiskMetrics;
    limits: RiskLimits;
    recommendations: string[];
  } {
    const positions = Array.from(this.positions.values());
    const metrics = this.calculatePortfolioRisk();
    const recommendations: string[] = [];

    // Generate recommendations
    if (metrics.riskScore > 7) {
      recommendations.push('Portfolio risk is high - consider reducing position sizes');
    }

    if (metrics.maxDrawdown > 0.15) {
      recommendations.push('High drawdown detected - review stop-loss settings');
    }

    if (this.calculateConcentrationRisk() > 0.30) {
      recommendations.push('Portfolio is concentrated - consider diversification');
    }

    if (metrics.sharpeRatio < 0.5) {
      recommendations.push('Poor risk-adjusted returns - review strategy selection');
    }

    return {
      positions,
      metrics,
      limits: this.riskLimits,
      recommendations,
    };
  }
}

// Export singleton instance
export const riskManager = new RiskManager();

// CLI functions
export function addPosition(position: Position): void {
  riskManager.addPosition(position);
}

export function calculateRisk(): RiskMetrics {
  return riskManager.calculatePortfolioRisk();
}

export function optimizePortfolio(): RebalanceAction[] {
  return riskManager.optimizePortfolio();
}

export function assessTrade(trade: {
  token: string;
  amount: number;
  expectedReturn: number;
  confidence: number;
  riskScore: number;
  timeHorizon: number;
}): any {
  return riskManager.assessTradeRisk(trade);
}

export function getPortfolioSummary(): any {
  return riskManager.getPortfolioSummary();
}

export function checkExitSignals(): { stopLosses: string[]; takeProfits: string[] } {
  return riskManager.checkStopLossAndTakeProfit();
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('📊 RISK MANAGER STARTING...');

  // Example portfolio analysis
  const summary = getPortfolioSummary();
  console.log('Portfolio Summary:', summary);

  const optimization = optimizePortfolio();
  console.log('Optimization Actions:', optimization);
}