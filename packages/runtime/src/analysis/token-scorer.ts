/**
 * TOKEN SCORER
 *
 * Scores meme coins based on multiple factors
 * - Liquidity and volume metrics
 * - Holder distribution
 * - Smart money presence
 * - Social signals
 * - Technical indicators
 */

import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { honeypotDetector } from './honeypot-detector.js';

// Scoring weights
const SCORE_WEIGHTS = {
  liquidity: 0.25,       // 25%
  holders: 0.15,         // 15%
  smartMoney: 0.20,      // 20%
  volume: 0.15,          // 15%
  momentum: 0.10,        // 10%
  safety: 0.15           // 15%
};

export interface TokenScore {
  address: string;
  symbol: string;
  totalScore: number;      // 0-100
  breakdown: {
    liquidityScore: number;
    holderScore: number;
    smartMoneyScore: number;
    volumeScore: number;
    momentumScore: number;
    safetyScore: number;
  };
  metrics: TokenMetrics;
  verdict: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'DANGER';
  reasons: string[];
}

export interface TokenMetrics {
  // Liquidity
  liquidityUSD: number;
  liquidityETH: number;
  liquidityLocked: boolean;
  liquidityAge: number;     // Hours

  // Holders
  holderCount: number;
  top10HoldersPercent: number;
  uniqueBuyers24h: number;
  uniqueSellers24h: number;

  // Volume
  volume24h: number;
  volumeToLiquidity: number;
  buyVolume24h: number;
  sellVolume24h: number;
  txCount24h: number;

  // Price
  priceChange1h: number;
  priceChange24h: number;
  ath: number;
  athDate: Date | null;

  // Smart money
  smartWalletsHolding: number;
  smartWalletsBought24h: number;
  smartWalletsSold24h: number;
  avgSmartWalletProfit: number;

  // Safety
  isHoneypot: boolean;
  contractVerified: boolean;
  ownerRenounced: boolean;
  buyTax: number;
  sellTax: number;
}

export class TokenScorer {
  private client;
  private smartWallets: Set<string>;
  private cache: Map<string, { score: TokenScore; timestamp: number }>;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(smartWallets: string[] = []) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545')
    });

    this.smartWallets = new Set(smartWallets.map(w => w.toLowerCase()));
    this.cache = new Map();
  }

  async scoreToken(tokenAddress: string): Promise<TokenScore> {
    // Check cache
    const cached = this.cache.get(tokenAddress.toLowerCase());
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.score;
    }

    try {
      // Gather metrics
      const metrics = await this.gatherMetrics(tokenAddress);

      // Calculate individual scores
      const liquidityScore = this.calculateLiquidityScore(metrics);
      const holderScore = this.calculateHolderScore(metrics);
      const smartMoneyScore = this.calculateSmartMoneyScore(metrics);
      const volumeScore = this.calculateVolumeScore(metrics);
      const momentumScore = this.calculateMomentumScore(metrics);
      const safetyScore = this.calculateSafetyScore(metrics);

      // Calculate total weighted score
      const totalScore =
        liquidityScore * SCORE_WEIGHTS.liquidity +
        holderScore * SCORE_WEIGHTS.holders +
        smartMoneyScore * SCORE_WEIGHTS.smartMoney +
        volumeScore * SCORE_WEIGHTS.volume +
        momentumScore * SCORE_WEIGHTS.momentum +
        safetyScore * SCORE_WEIGHTS.safety;

      // Determine verdict and reasons
      const { verdict, reasons } = this.determineVerdict(totalScore, metrics);

      const score: TokenScore = {
        address: tokenAddress,
        symbol: await this.getTokenSymbol(tokenAddress),
        totalScore: Math.round(totalScore),
        breakdown: {
          liquidityScore: Math.round(liquidityScore),
          holderScore: Math.round(holderScore),
          smartMoneyScore: Math.round(smartMoneyScore),
          volumeScore: Math.round(volumeScore),
          momentumScore: Math.round(momentumScore),
          safetyScore: Math.round(safetyScore)
        },
        metrics,
        verdict,
        reasons
      };

      // Cache the result
      this.cache.set(tokenAddress.toLowerCase(), {
        score,
        timestamp: Date.now()
      });

      return score;
    } catch (error) {
      console.error(`Error scoring token ${tokenAddress}:`, error);

      // Return minimal score on error
      return {
        address: tokenAddress,
        symbol: 'UNKNOWN',
        totalScore: 0,
        breakdown: {
          liquidityScore: 0,
          holderScore: 0,
          smartMoneyScore: 0,
          volumeScore: 0,
          momentumScore: 0,
          safetyScore: 0
        },
        metrics: this.getEmptyMetrics(),
        verdict: 'DANGER',
        reasons: ['Failed to analyze token']
      };
    }
  }

  private async gatherMetrics(tokenAddress: string): Promise<TokenMetrics> {
    // In production, these would be fetched from blockchain and APIs
    // For now, returning mock data

    // Check honeypot
    const honeypotCheck = await honeypotDetector.checkToken(tokenAddress);

    return {
      // Liquidity
      liquidityUSD: 100000,
      liquidityETH: 40,
      liquidityLocked: false,
      liquidityAge: 24,

      // Holders
      holderCount: 500,
      top10HoldersPercent: 35,
      uniqueBuyers24h: 50,
      uniqueSellers24h: 20,

      // Volume
      volume24h: 50000,
      volumeToLiquidity: 0.5,
      buyVolume24h: 30000,
      sellVolume24h: 20000,
      txCount24h: 200,

      // Price
      priceChange1h: 5,
      priceChange24h: 25,
      ath: 0,
      athDate: null,

      // Smart money
      smartWalletsHolding: 3,
      smartWalletsBought24h: 2,
      smartWalletsSold24h: 0,
      avgSmartWalletProfit: 150,

      // Safety
      isHoneypot: honeypotCheck.isHoneypot,
      contractVerified: honeypotCheck.contractVerified,
      ownerRenounced: !honeypotCheck.hasOwnerPrivileges,
      buyTax: honeypotCheck.buyTax,
      sellTax: honeypotCheck.sellTax
    };
  }

  private calculateLiquidityScore(metrics: TokenMetrics): number {
    let score = 0;

    // Liquidity amount (0-40 points)
    if (metrics.liquidityUSD >= 500000) score += 40;
    else if (metrics.liquidityUSD >= 250000) score += 35;
    else if (metrics.liquidityUSD >= 100000) score += 30;
    else if (metrics.liquidityUSD >= 50000) score += 20;
    else if (metrics.liquidityUSD >= 25000) score += 10;

    // Liquidity locked (0-30 points)
    if (metrics.liquidityLocked) score += 30;

    // Liquidity age (0-30 points)
    if (metrics.liquidityAge >= 168) score += 30;  // 1 week
    else if (metrics.liquidityAge >= 72) score += 20;   // 3 days
    else if (metrics.liquidityAge >= 24) score += 10;   // 1 day

    return Math.min(100, score);
  }

  private calculateHolderScore(metrics: TokenMetrics): number {
    let score = 0;

    // Holder count (0-40 points)
    if (metrics.holderCount >= 5000) score += 40;
    else if (metrics.holderCount >= 2000) score += 35;
    else if (metrics.holderCount >= 1000) score += 30;
    else if (metrics.holderCount >= 500) score += 20;
    else if (metrics.holderCount >= 100) score += 10;

    // Distribution (0-40 points)
    if (metrics.top10HoldersPercent <= 20) score += 40;
    else if (metrics.top10HoldersPercent <= 30) score += 30;
    else if (metrics.top10HoldersPercent <= 40) score += 20;
    else if (metrics.top10HoldersPercent <= 50) score += 10;

    // Active trading (0-20 points)
    const buyerSellerRatio = metrics.uniqueBuyers24h / (metrics.uniqueSellers24h + 1);
    if (buyerSellerRatio >= 3) score += 20;
    else if (buyerSellerRatio >= 2) score += 15;
    else if (buyerSellerRatio >= 1.5) score += 10;
    else if (buyerSellerRatio >= 1) score += 5;

    return Math.min(100, score);
  }

  private calculateSmartMoneyScore(metrics: TokenMetrics): number {
    let score = 0;

    // Smart wallets holding (0-40 points)
    if (metrics.smartWalletsHolding >= 10) score += 40;
    else if (metrics.smartWalletsHolding >= 5) score += 30;
    else if (metrics.smartWalletsHolding >= 3) score += 20;
    else if (metrics.smartWalletsHolding >= 1) score += 10;

    // Recent smart money activity (0-30 points)
    const netSmartFlow = metrics.smartWalletsBought24h - metrics.smartWalletsSold24h;
    if (netSmartFlow >= 5) score += 30;
    else if (netSmartFlow >= 3) score += 20;
    else if (netSmartFlow >= 1) score += 10;
    else if (netSmartFlow < 0) score -= 10;

    // Smart wallet profitability (0-30 points)
    if (metrics.avgSmartWalletProfit >= 200) score += 30;
    else if (metrics.avgSmartWalletProfit >= 100) score += 20;
    else if (metrics.avgSmartWalletProfit >= 50) score += 10;
    else if (metrics.avgSmartWalletProfit < 0) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  private calculateVolumeScore(metrics: TokenMetrics): number {
    let score = 0;

    // Volume amount (0-40 points)
    if (metrics.volume24h >= 1000000) score += 40;
    else if (metrics.volume24h >= 500000) score += 35;
    else if (metrics.volume24h >= 250000) score += 30;
    else if (metrics.volume24h >= 100000) score += 20;
    else if (metrics.volume24h >= 50000) score += 10;

    // Volume to liquidity ratio (0-30 points)
    if (metrics.volumeToLiquidity >= 1) score += 30;
    else if (metrics.volumeToLiquidity >= 0.5) score += 20;
    else if (metrics.volumeToLiquidity >= 0.25) score += 10;

    // Buy pressure (0-30 points)
    const buyPressure = metrics.buyVolume24h / (metrics.volume24h + 1);
    if (buyPressure >= 0.7) score += 30;
    else if (buyPressure >= 0.6) score += 20;
    else if (buyPressure >= 0.5) score += 10;

    return Math.min(100, score);
  }

  private calculateMomentumScore(metrics: TokenMetrics): number {
    let score = 50; // Start at neutral

    // Short term momentum (1h)
    if (metrics.priceChange1h > 10) score += 20;
    else if (metrics.priceChange1h > 5) score += 10;
    else if (metrics.priceChange1h < -10) score -= 20;
    else if (metrics.priceChange1h < -5) score -= 10;

    // Medium term momentum (24h)
    if (metrics.priceChange24h > 50) score += 30;
    else if (metrics.priceChange24h > 20) score += 20;
    else if (metrics.priceChange24h > 0) score += 10;
    else if (metrics.priceChange24h < -30) score -= 20;
    else if (metrics.priceChange24h < -10) score -= 10;

    // Transaction activity
    if (metrics.txCount24h >= 500) score += 20;
    else if (metrics.txCount24h >= 200) score += 10;
    else if (metrics.txCount24h < 50) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  private calculateSafetyScore(metrics: TokenMetrics): number {
    let score = 100; // Start at maximum safety

    // Critical failures
    if (metrics.isHoneypot) return 0;

    // Tax penalties
    if (metrics.buyTax > 10) score -= 30;
    else if (metrics.buyTax > 5) score -= 15;

    if (metrics.sellTax > 10) score -= 30;
    else if (metrics.sellTax > 5) score -= 15;

    // Contract verification
    if (!metrics.contractVerified) score -= 20;

    // Owner privileges
    if (!metrics.ownerRenounced) score -= 15;

    // Liquidity lock
    if (!metrics.liquidityLocked) score -= 10;

    return Math.max(0, score);
  }

  private determineVerdict(totalScore: number, metrics: TokenMetrics): { verdict: any; reasons: string[] } {
    const reasons: string[] = [];

    // Check for immediate disqualifiers
    if (metrics.isHoneypot) {
      return { verdict: 'DANGER', reasons: ['Token is a honeypot'] };
    }

    if (metrics.sellTax > 20) {
      return { verdict: 'DANGER', reasons: ['Extremely high sell tax'] };
    }

    // Score-based verdict
    let verdict: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'DANGER';

    if (totalScore >= 80) {
      verdict = 'STRONG_BUY';
      if (metrics.smartWalletsHolding >= 5) reasons.push('Strong smart money presence');
      if (metrics.volumeToLiquidity >= 1) reasons.push('High trading activity');
      if (metrics.priceChange24h > 20) reasons.push('Strong momentum');
    } else if (totalScore >= 65) {
      verdict = 'BUY';
      if (metrics.smartWalletsHolding >= 3) reasons.push('Smart money interested');
      if (metrics.holderCount >= 500) reasons.push('Good holder base');
      if (metrics.liquidityUSD >= 50000) reasons.push('Adequate liquidity');
    } else if (totalScore >= 50) {
      verdict = 'HOLD';
      reasons.push('Mixed signals - monitor closely');
      if (metrics.liquidityUSD < 50000) reasons.push('Low liquidity');
      if (metrics.smartWalletsHolding < 2) reasons.push('Limited smart money');
    } else if (totalScore >= 30) {
      verdict = 'AVOID';
      if (metrics.buyTax > 5 || metrics.sellTax > 5) reasons.push('High taxes');
      if (!metrics.liquidityLocked) reasons.push('Unlocked liquidity');
      if (metrics.top10HoldersPercent > 50) reasons.push('High concentration risk');
    } else {
      verdict = 'DANGER';
      reasons.push('Multiple red flags detected');
      if (!metrics.contractVerified) reasons.push('Unverified contract');
      if (metrics.holderCount < 100) reasons.push('Very few holders');
    }

    return { verdict, reasons };
  }

  private async getTokenSymbol(tokenAddress: string): Promise<string> {
    try {
      const symbol = await this.client.readContract({
        address: tokenAddress,
        abi: parseAbi(['function symbol() external view returns (string)']),
        functionName: 'symbol'
      });
      return symbol;
    } catch {
      return 'UNKNOWN';
    }
  }

  private getEmptyMetrics(): TokenMetrics {
    return {
      liquidityUSD: 0,
      liquidityETH: 0,
      liquidityLocked: false,
      liquidityAge: 0,
      holderCount: 0,
      top10HoldersPercent: 100,
      uniqueBuyers24h: 0,
      uniqueSellers24h: 0,
      volume24h: 0,
      volumeToLiquidity: 0,
      buyVolume24h: 0,
      sellVolume24h: 0,
      txCount24h: 0,
      priceChange1h: 0,
      priceChange24h: 0,
      ath: 0,
      athDate: null,
      smartWalletsHolding: 0,
      smartWalletsBought24h: 0,
      smartWalletsSold24h: 0,
      avgSmartWalletProfit: 0,
      isHoneypot: true,
      contractVerified: false,
      ownerRenounced: false,
      buyTax: 100,
      sellTax: 100
    };
  }

  addSmartWallet(address: string): void {
    this.smartWallets.add(address.toLowerCase());
  }

  removeSmartWallet(address: string): void {
    this.smartWallets.delete(address.toLowerCase());
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const tokenScorer = new TokenScorer();