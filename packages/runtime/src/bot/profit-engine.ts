/**
 * PROFIT ENGINE
 *
 * Core profit maximization logic with clear rules
 * - Position sizing using Kelly Criterion
 * - Dynamic profit targets
 * - Risk management
 * - Compound profit strategies
 */

import { formatEther, parseEther } from 'viem';

export interface ProfitRule {
  name: string;
  enabled: boolean;
  priority: number;
  condition: (position: Position) => boolean;
  action: (position: Position) => ProfitAction;
}

export interface Position {
  token: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  amount: bigint;
  entryTime: number;
  profitPercent: number;
  highestProfit: number;      // Track ATH for position
  soldPortions: number;        // How much already sold (0-1)
  riskScore: number;
  isSmartMoneyCopy: boolean;
}

export interface ProfitAction {
  type: 'SELL' | 'HOLD' | 'ADD' | 'REDUCE';
  portion: number;            // 0-1 (percentage to sell/add)
  reason: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PortfolioMetrics {
  totalValue: number;
  totalProfit: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  riskExposure: number;
}

export class ProfitEngine {
  private rules: ProfitRule[];
  private portfolio: Map<string, Position>;
  private capitalETH: number;
  private totalRealizedProfit: number;
  private maxPortfolioValue: number;

  // Core profit taking levels
  private readonly PROFIT_TARGETS = [
    { level: 2, portion: 0.2 },    // Sell 20% at 2x
    { level: 5, portion: 0.3 },    // Sell 30% at 5x
    { level: 10, portion: 0.3 },   // Sell 30% at 10x
    { level: 20, portion: 0.2 },   // Sell remaining at 20x
  ];

  // Risk management levels
  private readonly STOP_LOSS = -0.30;        // -30% stop loss
  private readonly TRAILING_STOP = 0.25;     // 25% trailing stop after 2x

  constructor(initialCapital: number) {
    this.capitalETH = initialCapital;
    this.portfolio = new Map();
    this.totalRealizedProfit = 0;
    this.maxPortfolioValue = initialCapital;
    this.rules = this.initializeRules();
  }

  private initializeRules(): ProfitRule[] {
    return [
      // Rule 1: Stop Loss
      {
        name: 'Stop Loss',
        enabled: true,
        priority: 100,
        condition: (p) => p.profitPercent <= this.STOP_LOSS * 100,
        action: (p) => ({
          type: 'SELL',
          portion: 1.0,
          reason: `Stop loss triggered at ${p.profitPercent.toFixed(1)}%`,
          urgency: 'CRITICAL'
        })
      },

      // Rule 2: Take Profit at 2x
      {
        name: 'Take Profit 2x',
        enabled: true,
        priority: 90,
        condition: (p) => p.profitPercent >= 100 && p.soldPortions < 0.2,
        action: (p) => ({
          type: 'SELL',
          portion: 0.2,
          reason: 'Taking 20% profit at 2x',
          urgency: 'MEDIUM'
        })
      },

      // Rule 3: Take Profit at 5x
      {
        name: 'Take Profit 5x',
        enabled: true,
        priority: 85,
        condition: (p) => p.profitPercent >= 400 && p.soldPortions < 0.5,
        action: (p) => ({
          type: 'SELL',
          portion: 0.3,
          reason: 'Taking 30% profit at 5x',
          urgency: 'MEDIUM'
        })
      },

      // Rule 4: Take Profit at 10x
      {
        name: 'Take Profit 10x',
        enabled: true,
        priority: 80,
        condition: (p) => p.profitPercent >= 900 && p.soldPortions < 0.8,
        action: (p) => ({
          type: 'SELL',
          portion: 0.3,
          reason: 'Taking 30% profit at 10x',
          urgency: 'HIGH'
        })
      },

      // Rule 5: Trailing Stop
      {
        name: 'Trailing Stop',
        enabled: true,
        priority: 75,
        condition: (p) => {
          const dropFromHigh = ((p.highestProfit - p.profitPercent) / p.highestProfit) * 100;
          return p.highestProfit >= 100 && dropFromHigh >= this.TRAILING_STOP * 100;
        },
        action: (p) => ({
          type: 'SELL',
          portion: 0.5,
          reason: `Trailing stop: ${this.TRAILING_STOP * 100}% drop from high`,
          urgency: 'HIGH'
        })
      },

      // Rule 6: Time-based Exit (Stale positions)
      {
        name: 'Stale Position Exit',
        enabled: true,
        priority: 50,
        condition: (p) => {
          const holdTime = (Date.now() - p.entryTime) / (1000 * 60 * 60); // Hours
          return holdTime > 168 && p.profitPercent < 20; // 1 week with < 20% profit
        },
        action: (p) => ({
          type: 'SELL',
          portion: 0.5,
          reason: 'Position stale - reducing exposure',
          urgency: 'LOW'
        })
      },

      // Rule 7: High Risk Exit
      {
        name: 'High Risk Exit',
        enabled: true,
        priority: 70,
        condition: (p) => p.riskScore > 80 && p.profitPercent > 0,
        action: (p) => ({
          type: 'SELL',
          portion: 0.75,
          reason: 'High risk detected - taking profits',
          urgency: 'HIGH'
        })
      },

      // Rule 8: Double Down on Winners
      {
        name: 'Double Down',
        enabled: true,
        priority: 40,
        condition: (p) => {
          const holdTime = (Date.now() - p.entryTime) / (1000 * 60 * 60);
          return p.profitPercent >= 30 && p.profitPercent < 100 &&
                 holdTime < 24 && p.soldPortions === 0;
        },
        action: (p) => ({
          type: 'ADD',
          portion: 0.5, // Add 50% more
          reason: 'Strong momentum - adding to winner',
          urgency: 'MEDIUM'
        })
      },

      // Rule 9: Smart Money Exit Signal
      {
        name: 'Smart Money Exit',
        enabled: true,
        priority: 60,
        condition: (p) => p.isSmartMoneyCopy && p.profitPercent > 50,
        action: (p) => ({
          type: 'SELL',
          portion: 0.5,
          reason: 'Smart money taking profits',
          urgency: 'MEDIUM'
        })
      },

      // Rule 10: Final Exit at 20x
      {
        name: 'Moon Exit',
        enabled: true,
        priority: 95,
        condition: (p) => p.profitPercent >= 1900,
        action: (p) => ({
          type: 'SELL',
          portion: 1.0,
          reason: 'MOON! Taking all profits at 20x',
          urgency: 'CRITICAL'
        })
      }
    ].sort((a, b) => b.priority - a.priority); // Sort by priority
  }

  evaluatePosition(position: Position): ProfitAction | null {
    // Update highest profit
    if (position.profitPercent > position.highestProfit) {
      position.highestProfit = position.profitPercent;
    }

    // Check each rule in priority order
    for (const rule of this.rules) {
      if (rule.enabled && rule.condition(position)) {
        const action = rule.action(position);
        console.log(`📋 Rule triggered: ${rule.name} - ${action.reason}`);
        return action;
      }
    }

    // Default action is hold
    return {
      type: 'HOLD',
      portion: 0,
      reason: 'No action required',
      urgency: 'LOW'
    };
  }

  calculatePositionSize(
    tokenScore: number,
    currentPortfolioValue: number,
    confidence: number
  ): number {
    // Kelly Criterion with adjustments
    const winProbability = Math.min(0.9, confidence / 100);
    const lossRatio = 1; // Can lose 100%
    const winRatio = 3;  // Average 3x return on winners

    // Kelly formula: f = (p * b - q) / b
    // where f = fraction to bet, p = win probability, q = loss probability, b = win/loss ratio
    let kellyFraction = (winProbability * winRatio - (1 - winProbability)) / winRatio;

    // Apply safety factor (never use full Kelly)
    kellyFraction *= 0.25; // Use 25% of Kelly suggestion

    // Score-based adjustment
    const scoreMultiplier = Math.max(0.5, Math.min(1.5, tokenScore / 70));
    kellyFraction *= scoreMultiplier;

    // Portfolio constraints
    const maxPositionSize = 0.05; // Max 5% per position
    const minPositionSize = 0.005; // Min 0.5% per position

    const positionSize = Math.max(
      minPositionSize,
      Math.min(maxPositionSize, kellyFraction)
    );

    return currentPortfolioValue * positionSize;
  }

  shouldTakeProfit(position: Position): boolean {
    const action = this.evaluatePosition(position);
    return action !== null && action.type === 'SELL';
  }

  shouldAddToPosition(position: Position): boolean {
    const action = this.evaluatePosition(position);
    return action !== null && action.type === 'ADD';
  }

  getOptimalExitStrategy(position: Position): ProfitAction {
    return this.evaluatePosition(position) || {
      type: 'HOLD',
      portion: 0,
      reason: 'Hold position',
      urgency: 'LOW'
    };
  }

  calculatePortfolioMetrics(): PortfolioMetrics {
    let totalValue = this.capitalETH;
    let totalProfit = this.totalRealizedProfit;
    let currentValue = this.capitalETH;

    // Add unrealized profits
    for (const position of this.portfolio.values()) {
      const positionValue = Number(formatEther(position.amount)) *
                           (1 + position.profitPercent / 100);
      currentValue += positionValue - Number(formatEther(position.amount));
    }

    totalValue = currentValue;

    // Track max value for drawdown calculation
    if (totalValue > this.maxPortfolioValue) {
      this.maxPortfolioValue = totalValue;
    }

    const currentDrawdown = ((this.maxPortfolioValue - totalValue) /
                             this.maxPortfolioValue) * 100;

    // Calculate risk exposure
    const riskExposure = this.portfolio.size * 10; // Simplified

    return {
      totalValue,
      totalProfit,
      winRate: 0, // Would calculate from history
      sharpeRatio: 0, // Would calculate from returns
      maxDrawdown: 0, // Would track historically
      currentDrawdown,
      riskExposure
    };
  }

  addPosition(position: Position): void {
    this.portfolio.set(position.token, position);
  }

  removePosition(token: string): void {
    this.portfolio.delete(token);
  }

  updatePosition(token: string, updates: Partial<Position>): void {
    const position = this.portfolio.get(token);
    if (position) {
      Object.assign(position, updates);
    }
  }

  recordProfit(amount: number): void {
    this.totalRealizedProfit += amount;
  }

  shouldRebalance(): boolean {
    const metrics = this.calculatePortfolioMetrics();

    // Rebalance if:
    // 1. Risk exposure too high
    if (metrics.riskExposure > 80) return true;

    // 2. Significant drawdown
    if (metrics.currentDrawdown > 20) return true;

    // 3. Too concentrated (single position > 30% of portfolio)
    for (const position of this.portfolio.values()) {
      const positionValue = Number(formatEther(position.amount)) *
                           (1 + position.profitPercent / 100);
      const positionPercent = (positionValue / metrics.totalValue) * 100;
      if (positionPercent > 30) return true;
    }

    return false;
  }

  getRebalancingActions(): ProfitAction[] {
    const actions: ProfitAction[] = [];
    const metrics = this.calculatePortfolioMetrics();

    for (const position of this.portfolio.values()) {
      const positionValue = Number(formatEther(position.amount)) *
                           (1 + position.profitPercent / 100);
      const positionPercent = (positionValue / metrics.totalValue) * 100;

      // Reduce overweight positions
      if (positionPercent > 20) {
        actions.push({
          type: 'REDUCE',
          portion: 0.3,
          reason: `Position too large: ${positionPercent.toFixed(1)}% of portfolio`,
          urgency: 'MEDIUM'
        });
      }

      // Exit high-risk positions during drawdown
      if (metrics.currentDrawdown > 15 && position.riskScore > 70) {
        actions.push({
          type: 'SELL',
          portion: 0.5,
          reason: 'Reducing risk during drawdown',
          urgency: 'HIGH'
        });
      }
    }

    return actions;
  }

  enableRule(ruleName: string): void {
    const rule = this.rules.find(r => r.name === ruleName);
    if (rule) rule.enabled = true;
  }

  disableRule(ruleName: string): void {
    const rule = this.rules.find(r => r.name === ruleName);
    if (rule) rule.enabled = false;
  }

  getRules(): ProfitRule[] {
    return this.rules;
  }

  getPortfolio(): Position[] {
    return Array.from(this.portfolio.values());
  }
}

// Export singleton with default 0.1 ETH capital
export const profitEngine = new ProfitEngine(0.1);