/**
 * Task Decomposer - Intelligent task breakdown for complex queries
 */

import { z } from "zod";

export class TaskDecomposer {
  // Decompose high-level question into subtasks
  static async decompose(question: string, context?: any): Promise<any[]> {
    const tasks: any[] = [];
    
    // Identify question type
    const questionType = this.identifyQuestionType(question);
    
    switch (questionType) {
      case "token_launch_analysis":
        return this.decomposeTokenLaunchAnalysis(question, context);
      
      case "wallet_profiling":
        return this.decomposeWalletProfiling(question, context);
      
      case "pattern_detection":
        return this.decomposePatternDetection(question, context);
      
      case "market_analysis":
        return this.decomposeMarketAnalysis(question, context);
      
      default:
        return this.decomposeGeneric(question, context);
    }
  }
  
  // Expand existing plan with more detailed steps
  static async expandPlan(plan: any, question: string): Promise<any> {
    const expandedSteps: any[] = [];
    
    for (const step of plan.steps) {
      // Check if step needs expansion
      if (this.needsExpansion(step)) {
        const subSteps = await this.expandStep(step, question);
        expandedSteps.push({
          ...step,
          subSteps
        });
      } else {
        expandedSteps.push(step);
      }
    }
    
    return {
      ...plan,
      steps: expandedSteps
    };
  }
  
  // Identify question type from natural language
  private static identifyQuestionType(question: string): string {
    const lower = question.toLowerCase();
    
    if (lower.includes("token launch") || lower.includes("new token")) {
      return "token_launch_analysis";
    }
    if (lower.includes("wallet") && (lower.includes("profit") || lower.includes("trading"))) {
      return "wallet_profiling";
    }
    if (lower.includes("pattern") || lower.includes("detect") || lower.includes("find")) {
      return "pattern_detection";
    }
    if (lower.includes("market") || lower.includes("price") || lower.includes("volume")) {
      return "market_analysis";
    }
    
    return "generic";
  }
  
  // Decompose token launch analysis
  private static decomposeTokenLaunchAnalysis(question: string, context?: any): any[] {
    const tasks = [];
    
    // Phase 1: Data Collection
    tasks.push({
      id: "tla_1_block_range",
      tool: "ethRpc.getBlockNumber",
      args: {},
      description: "Get current block number",
      priority: 1,
      parallel: true
    });
    
    // Calculate block range for time period
    tasks.push({
      id: "tla_2_calc_range",
      tool: "task.expand",
      args: {
        currentBlock: "{{tla_1_block_range}}",
        days: 7,
        blocksPerDay: 7200
      },
      description: "Calculate block range for analysis period",
      dependsOn: ["tla_1_block_range"]
    });
    
    // Find new token deployments
    tasks.push({
      id: "tla_3_find_tokens",
      tool: "ethRpc.getLogsChunked",
      args: {
        fromBlock: "{{tla_2_calc_range.fromBlock}}",
        toBlock: "{{tla_2_calc_range.toBlock}}",
        topics: [
          "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0" // OwnershipTransferred
        ]
      },
      description: "Find potential new token contracts",
      dependsOn: ["tla_2_calc_range"],
      parallel: true,
      timeout: 60000
    });
    
    // Phase 2: Token Analysis (parallel for each token)
    tasks.push({
      id: "tla_4_analyze_tokens",
      tool: "pattern.analyzeTokenLaunch",
      args: {
        tokens: "{{tla_3_find_tokens}}",
        includeMetadata: true,
        includePriceData: true
      },
      description: "Analyze each token launch",
      dependsOn: ["tla_3_find_tokens"],
      parallel: true,
      subSteps: [
        {
          id: "tla_4_1_metadata",
          tool: "ethRpc.ethCall",
          args: { method: "name,symbol,decimals,totalSupply" },
          description: "Get token metadata"
        },
        {
          id: "tla_4_2_transfers",
          tool: "ethRpc.getLogsChunked",
          args: {
            topics: ["0xddf252ad..."] // Transfer event
          },
          description: "Get all transfers"
        },
        {
          id: "tla_4_3_liquidity",
          tool: "db.query",
          args: {
            sql: "SELECT * FROM dex_pools WHERE token = ?"
          },
          description: "Find liquidity pools"
        }
      ]
    });
    
    // Phase 3: Wallet Analysis
    tasks.push({
      id: "tla_5_find_buyers",
      tool: "analysis.findRelatedWallets",
      args: {
        transfers: "{{tla_4_analyze_tokens.transfers}}",
        filterEarlyBuyers: true
      },
      description: "Identify early buyers",
      dependsOn: ["tla_4_analyze_tokens"],
      parallel: true
    });
    
    // Phase 4: Profit Analysis
    tasks.push({
      id: "tla_6_calc_profits",
      tool: "pattern.findProfitableWallets",
      args: {
        wallets: "{{tla_5_find_buyers}}",
        tokens: "{{tla_4_analyze_tokens}}",
        calculateROI: true
      },
      description: "Calculate profit/loss for each wallet",
      dependsOn: ["tla_5_find_buyers"],
      parallel: true
    });
    
    // Phase 5: Pattern Detection
    tasks.push({
      id: "tla_7_detect_patterns",
      tool: "pattern.detectSwingTrading",
      args: {
        wallets: "{{tla_6_calc_profits}}",
        minTrades: 3,
        profitThreshold: 0.1
      },
      description: "Detect swing trading patterns",
      dependsOn: ["tla_6_calc_profits"]
    });
    
    // Phase 6: Aggregation
    tasks.push({
      id: "tla_8_aggregate",
      tool: "result.aggregate",
      args: {
        profitableWallets: "{{tla_6_calc_profits}}",
        patterns: "{{tla_7_detect_patterns}}",
        sortBy: "totalProfit",
        limit: 20
      },
      description: "Aggregate and rank results",
      dependsOn: ["tla_7_detect_patterns"]
    });
    
    return tasks;
  }
  
  // Decompose wallet profiling
  private static decomposeWalletProfiling(question: string, context?: any): any[] {
    const tasks = [];
    
    tasks.push({
      id: "wp_1_identify",
      tool: "db.query",
      args: {
        sql: `SELECT DISTINCT address FROM transactions 
              WHERE value > 0 
              GROUP BY address 
              HAVING COUNT(*) > 10`
      },
      description: "Identify active wallets"
    });
    
    tasks.push({
      id: "wp_2_history",
      tool: "ethRpc.getLogsChunked",
      args: {
        address: "{{wp_1_identify}}",
        topics: ["0xddf252ad..."]
      },
      description: "Get transaction history",
      dependsOn: ["wp_1_identify"],
      parallel: true
    });
    
    tasks.push({
      id: "wp_3_analyze",
      tool: "analysis.analyzePortfolio",
      args: {
        wallets: "{{wp_1_identify}}",
        history: "{{wp_2_history}}"
      },
      description: "Analyze wallet portfolios",
      dependsOn: ["wp_2_history"]
    });
    
    return tasks;
  }
  
  // Decompose pattern detection
  private static decomposePatternDetection(question: string, context?: any): any[] {
    const tasks = [];
    
    tasks.push({
      id: "pd_1_collect",
      tool: "ethRpc.getLogsChunked",
      args: {
        fromBlock: "latest-7200",
        toBlock: "latest"
      },
      description: "Collect recent data"
    });
    
    tasks.push({
      id: "pd_2_preprocess",
      tool: "analysis.preprocessData",
      args: {
        data: "{{pd_1_collect}}",
        normalize: true
      },
      description: "Preprocess data",
      dependsOn: ["pd_1_collect"]
    });
    
    tasks.push({
      id: "pd_3_detect",
      tool: "pattern.detect",
      args: {
        data: "{{pd_2_preprocess}}",
        patterns: ["pump_dump", "wash_trading", "arbitrage"]
      },
      description: "Detect patterns",
      dependsOn: ["pd_2_preprocess"],
      parallel: true
    });
    
    return tasks;
  }
  
  // Decompose market analysis
  private static decomposeMarketAnalysis(question: string, context?: any): any[] {
    const tasks = [];
    
    tasks.push({
      id: "ma_1_tokens",
      tool: "db.getTopTokensByVolume",
      args: { days: 7 },
      description: "Get top tokens by volume"
    });
    
    tasks.push({
      id: "ma_2_prices",
      tool: "db.query",
      args: {
        sql: "SELECT * FROM price_history WHERE token IN (?)",
        params: "{{ma_1_tokens}}"
      },
      description: "Get price history",
      dependsOn: ["ma_1_tokens"],
      parallel: true
    });
    
    tasks.push({
      id: "ma_3_analyze",
      tool: "analysis.marketAnalysis",
      args: {
        tokens: "{{ma_1_tokens}}",
        prices: "{{ma_2_prices}}"
      },
      description: "Analyze market trends",
      dependsOn: ["ma_2_prices"]
    });
    
    return tasks;
  }
  
  // Generic decomposition
  private static decomposeGeneric(question: string, context?: any): any[] {
    return [
      {
        id: "gen_1",
        tool: "ethRpc.getBlockNumber",
        args: {},
        description: "Get current state"
      },
      {
        id: "gen_2",
        tool: "db.query",
        args: {
          sql: "SELECT * FROM blocks ORDER BY number DESC LIMIT 10"
        },
        description: "Get recent data",
        dependsOn: ["gen_1"]
      }
    ];
  }
  
  // Check if a step needs expansion
  private static needsExpansion(step: any): boolean {
    // Steps that typically need expansion
    const expandableTools = [
      "pattern.analyzeTokenLaunch",
      "pattern.findProfitableWallets",
      "analysis.complexAnalysis",
      "task.expand"
    ];
    
    return expandableTools.includes(step.tool) || 
           (step.description && step.description.includes("analyze")) ||
           (step.description && step.description.includes("complex"));
  }
  
  // Expand a single step into substeps
  private static async expandStep(step: any, question: string): Promise<any[]> {
    const subSteps = [];
    
    // Token analysis expansion
    if (step.tool === "pattern.analyzeTokenLaunch") {
      subSteps.push(
        {
          id: `${step.id}_metadata`,
          tool: "ethRpc.ethCall",
          args: { contract: "{{token}}", method: "name,symbol,decimals" },
          description: "Get token metadata"
        },
        {
          id: `${step.id}_supply`,
          tool: "ethRpc.ethCall",
          args: { contract: "{{token}}", method: "totalSupply" },
          description: "Get total supply"
        },
        {
          id: `${step.id}_holders`,
          tool: "db.query",
          args: { sql: "SELECT COUNT(DISTINCT to_address) FROM transfers WHERE token = ?" },
          description: "Count token holders"
        },
        {
          id: `${step.id}_volume`,
          tool: "db.query",
          args: { sql: "SELECT SUM(value) FROM transfers WHERE token = ?" },
          description: "Calculate total volume"
        }
      );
    }
    
    // Wallet profitability expansion
    if (step.tool === "pattern.findProfitableWallets") {
      subSteps.push(
        {
          id: `${step.id}_buys`,
          tool: "db.query",
          args: { sql: "SELECT * FROM transfers WHERE to_address = ? AND value > 0" },
          description: "Get buy transactions"
        },
        {
          id: `${step.id}_sells`,
          tool: "db.query",
          args: { sql: "SELECT * FROM transfers WHERE from_address = ? AND value > 0" },
          description: "Get sell transactions"
        },
        {
          id: `${step.id}_pnl`,
          tool: "analysis.calculatePnL",
          args: { buys: "{{buys}}", sells: "{{sells}}" },
          description: "Calculate profit/loss"
        },
        {
          id: `${step.id}_roi`,
          tool: "analysis.calculateROI",
          args: { pnl: "{{pnl}}", investment: "{{buys}}" },
          description: "Calculate ROI"
        }
      );
    }
    
    return subSteps;
  }
}