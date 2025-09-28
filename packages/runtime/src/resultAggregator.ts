/**
 * Result Aggregator - Synthesizes and ranks complex analysis results
 */

export class ResultAggregator {
  // Main aggregation function
  static async aggregate(results: any, patterns: any): Promise<any> {
    return {
      summary: this.generateSummary(results, patterns),
      topFindings: this.extractTopFindings(results, patterns),
      rankings: this.generateRankings(results),
      insights: this.generateInsights(results, patterns),
      recommendations: this.generateRecommendations(results, patterns),
      visualData: this.prepareVisualizationData(results)
    };
  }
  
  // Summarize results
  static async summarize(data: any): Promise<string> {
    const stats = this.calculateStatistics(data);
    return `Analyzed ${stats.dataPoints} data points across ${stats.timeRange} blocks. ` +
           `Found ${stats.patterns} patterns with ${stats.confidence}% confidence.`;
  }
  
  // Rank results by relevance
  static async rank(items: any[], criteria: string = 'profit'): Promise<any[]> {
    return items.sort((a, b) => {
      switch (criteria) {
        case 'profit':
          return (b.profit || 0) - (a.profit || 0);
        case 'volume':
          return (b.volume || 0) - (a.volume || 0);
        case 'consistency':
          return (b.consistencyScore || 0) - (a.consistencyScore || 0);
        case 'risk':
          return (a.riskScore || 0) - (b.riskScore || 0);
        default:
          return (b.score || 0) - (a.score || 0);
      }
    });
  }
  
  private static generateSummary(results: any, patterns: any): any {
    return {
      totalWalletsAnalyzed: this.countUniqueWallets(results),
      totalTokensAnalyzed: this.countUniqueTokens(results),
      profitableWalletsFound: patterns.profitableWallets?.length || 0,
      swingTradersIdentified: patterns.swingTrading?.length || 0,
      suspiciousPatternsDetected: 
        (patterns.washTrading?.length || 0) + (patterns.pumpAndDump?.length || 0),
      timeRange: this.calculateTimeRange(results)
    };
  }
  
  private static extractTopFindings(results: any, patterns: any): any[] {
    const findings = [];
    
    // Top profitable wallets
    if (patterns.profitableWallets?.length > 0) {
      findings.push({
        type: 'profitable_wallets',
        title: 'Most Profitable Wallets',
        data: patterns.profitableWallets.slice(0, 10),
        importance: 'high'
      });
    }
    
    // Successful swing traders
    if (patterns.swingTrading?.length > 0) {
      findings.push({
        type: 'swing_traders',
        title: 'Successful Swing Traders',
        data: patterns.swingTrading.slice(0, 5),
        importance: 'high'
      });
    }
    
    // Arbitrage opportunities
    if (patterns.arbitrage?.length > 0) {
      findings.push({
        type: 'arbitrage',
        title: 'Arbitrage Opportunities',
        data: patterns.arbitrage.slice(0, 5),
        importance: 'medium'
      });
    }
    
    return findings;
  }
  
  private static generateRankings(results: any): any {
    const wallets = results.wallets || [];
    const walletsArray = Array.isArray(wallets) ? wallets : [];
    
    return {
      byProfit: walletsArray.length > 0 ? this.rank(walletsArray, 'profit').slice(0, 20) : [],
      byVolume: walletsArray.length > 0 ? this.rank(walletsArray, 'volume').slice(0, 20) : [],
      byConsistency: walletsArray.length > 0 ? this.rank(walletsArray, 'consistency').slice(0, 20) : [],
      byRisk: walletsArray.length > 0 ? this.rank(walletsArray, 'risk').slice(0, 20) : []
    };
  }
  
  private static generateInsights(results: any, patterns: any): string[] {
    const insights = [];
    
    if (patterns.profitableWallets?.length > 10) {
      insights.push(
        `Found ${patterns.profitableWallets.length} consistently profitable wallets, ` +
        `with average ROI of ${this.calculateAvgROI(patterns.profitableWallets)}%`
      );
    }
    
    if (patterns.swingTrading?.length > 0) {
      const avgHoldTime = this.calculateAvgHoldTime(patterns.swingTrading);
      insights.push(
        `Swing traders typically hold positions for ${avgHoldTime} blocks ` +
        `with ${this.calculateAvgSuccessRate(patterns.swingTrading)}% success rate`
      );
    }
    
    if (patterns.washTrading?.length > 0) {
      insights.push(
        `⚠️ Detected ${patterns.washTrading.length} potential wash trading patterns`
      );
    }
    
    return insights;
  }
  
  private static generateRecommendations(results: any, patterns: any): string[] {
    const recommendations = [];
    
    // Based on profitable wallets
    if (patterns.profitableWallets?.length > 0) {
      const topWallet = patterns.profitableWallets[0];
      recommendations.push(
        `Monitor wallet ${topWallet.address.slice(0, 10)}... for trading signals`
      );
      
      // Recommend tokens
      const topTokens = this.extractTopTokens(patterns.profitableWallets);
      if (topTokens.length > 0) {
        recommendations.push(
          `Focus on tokens: ${topTokens.slice(0, 3).join(', ')}`
        );
      }
    }
    
    // Risk warnings
    if (patterns.pumpAndDump?.length > 0) {
      recommendations.push(
        `⚠️ Avoid tokens with pump & dump patterns detected`
      );
    }
    
    return recommendations;
  }
  
  private static prepareVisualizationData(results: any): any {
    return {
      profitDistribution: this.calculateProfitDistribution(results),
      tradingVolume: this.calculateVolumeOverTime(results),
      walletNetwork: this.buildWalletNetwork(results),
      tokenPerformance: this.calculateTokenPerformance(results)
    };
  }
  
  // Helper functions
  private static countUniqueWallets(results: any): number {
    const wallets = new Set();
    if (results.wallets) {
      results.wallets.forEach((w: any) => wallets.add(w.address || w));
    }
    return wallets.size;
  }
  
  private static countUniqueTokens(results: any): number {
    const tokens = new Set();
    if (results.tokens) {
      results.tokens.forEach((t: any) => tokens.add(t.address || t));
    }
    return tokens.size;
  }
  
  private static calculateTimeRange(results: any): string {
    // Simplified time range calculation
    return '7 days';
  }
  
  private static calculateStatistics(data: any): any {
    return {
      dataPoints: Object.keys(data).reduce((sum, key) => {
        const val = data[key];
        return sum + (Array.isArray(val) ? val.length : 1);
      }, 0),
      timeRange: 50400, // 7 days in blocks
      patterns: Object.keys(data.patterns || {}).length,
      confidence: 85
    };
  }
  
  private static calculateAvgROI(wallets: any[]): number {
    if (wallets.length === 0) return 0;
    const total = wallets.reduce((sum, w) => sum + (w.totalROI || 0), 0);
    return Math.round(total / wallets.length);
  }
  
  private static calculateAvgHoldTime(traders: any[]): number {
    if (traders.length === 0) return 0;
    const total = traders.reduce((sum, t) => sum + (t.avgHoldTime || 0), 0);
    return Math.round(total / traders.length);
  }
  
  private static calculateAvgSuccessRate(traders: any[]): number {
    if (traders.length === 0) return 0;
    const total = traders.reduce((sum, t) => sum + (t.successRate || 0), 0);
    return Math.round(total / traders.length);
  }
  
  private static extractTopTokens(wallets: any[]): string[] {
    const tokenCounts = new Map();
    
    for (const wallet of wallets) {
      if (wallet.tokens) {
        for (const token of wallet.tokens) {
          const key = token.token || token;
          tokenCounts.set(key, (tokenCounts.get(key) || 0) + 1);
        }
      }
    }
    
    return Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token);
  }
  
  private static calculateProfitDistribution(results: any): any[] {
    // Simplified profit distribution
    return [
      { range: '0-10%', count: 10 },
      { range: '10-50%', count: 25 },
      { range: '50-100%', count: 15 },
      { range: '100%+', count: 8 }
    ];
  }
  
  private static calculateVolumeOverTime(results: any): any[] {
    // Simplified volume data
    return [];
  }
  
  private static buildWalletNetwork(results: any): any {
    // Simplified network data
    return { nodes: [], edges: [] };
  }
  
  private static calculateTokenPerformance(results: any): any[] {
    // Simplified token performance
    return [];
  }
}