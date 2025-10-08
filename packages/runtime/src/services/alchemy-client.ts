/**
 * ALCHEMY RPC MANAGER - Optimized for Arbitrage Trading
 *
 * Provides high-speed access to Ethereum data via Alchemy's enhanced APIs
 * Includes WebSocket support for real-time mempool monitoring
 * Automatic fallback to local node for redundancy
 */

import { createPublicClient, createWalletClient, http, webSocket, PublicClient, WalletClient, Transport, Chain, Account } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

interface AlchemyConfig {
  apiKey: string;
  httpUrl: string;
  wsUrl: string;
  useForTrading: boolean;
  usePrivateMempool: boolean;
  enableTraceApi: boolean;
  enableDebugApi: boolean;
}

interface ClientLatency {
  alchemy: number;
  local: number;
  lastChecked: number;
}

export class AlchemyRPCManager {
  private alchemyHttpClient: PublicClient | null = null;
  private alchemyWsClient: PublicClient | null = null;
  private localClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private config: AlchemyConfig;
  private latency: ClientLatency;
  private wsConnection: any = null;
  private computeUnitsUsed: number = 0;
  private readonly MONTHLY_LIMIT = 300_000_000; // 300M compute units free tier

  constructor(privateKey?: string) {
    this.config = this.loadConfig();

    // Always create local client as backup
    this.localClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545'),
    });

    // Initialize Alchemy clients if API key is provided
    if (this.config.apiKey) {
      this.initializeAlchemyClients();
    } else {
      console.log('⚠️  Alchemy API key not configured, using local node only');
    }

    // Initialize wallet client if private key provided
    if (privateKey) {
      this.initializeWalletClient(privateKey);
    }

    this.latency = {
      alchemy: 0,
      local: 0,
      lastChecked: Date.now()
    };

    // Check latency every 30 seconds
    setInterval(() => this.measureLatency(), 30000);
    this.measureLatency(); // Initial check
  }

  private loadConfig(): AlchemyConfig {
    return {
      apiKey: process.env.ALCHEMY_API_KEY || '',
      httpUrl: process.env.ALCHEMY_MAINNET_HTTP || 'https://eth-mainnet.g.alchemy.com/v2/',
      wsUrl: process.env.ALCHEMY_MAINNET_WS || 'wss://eth-mainnet.g.alchemy.com/v2/',
      useForTrading: process.env.USE_ALCHEMY_FOR_TRADING === 'true',
      usePrivateMempool: process.env.USE_ALCHEMY_PRIVATE_MEMPOOL === 'true',
      enableTraceApi: process.env.ALCHEMY_ENABLE_TRACE_API === 'true',
      enableDebugApi: process.env.ALCHEMY_ENABLE_DEBUG_API === 'true',
    };
  }

  private initializeAlchemyClients(): void {
    const httpUrl = `${this.config.httpUrl}${this.config.apiKey}`;
    const wsUrl = `${this.config.wsUrl}${this.config.apiKey}`;

    // HTTP client for standard queries
    this.alchemyHttpClient = createPublicClient({
      chain: mainnet,
      transport: http(httpUrl),
      batch: {
        multicall: true,
      },
    });

    // WebSocket client for real-time data
    try {
      this.alchemyWsClient = createPublicClient({
        chain: mainnet,
        transport: webSocket(wsUrl, {
          reconnect: true,
          retryCount: 5,
        }),
      });
      console.log('✅ Alchemy WebSocket connected for real-time data');
    } catch (error) {
      console.error('❌ Failed to connect Alchemy WebSocket:', error);
    }
  }

  private initializeWalletClient(privateKey: string): void {
    const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}` as `0x${string}`);

    // Use Alchemy for wallet if configured, otherwise local
    const transport = this.config.useForTrading && this.config.apiKey
      ? http(`${this.config.httpUrl}${this.config.apiKey}`)
      : http(process.env.RPC_HTTP || 'http://127.0.0.1:8545');

    this.walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport,
    });
  }

  /**
   * Get the optimal client based on latency and configuration
   */
  public getOptimalClient(): PublicClient {
    // If Alchemy not configured, use local
    if (!this.alchemyHttpClient) {
      return this.localClient;
    }

    // If explicitly configured to use Alchemy for trading
    if (this.config.useForTrading) {
      return this.alchemyHttpClient;
    }

    // Choose based on latency (updated every 30s)
    if (this.latency.alchemy < this.latency.local && this.latency.alchemy > 0) {
      return this.alchemyHttpClient;
    }

    return this.localClient;
  }

  /**
   * Get client specifically for price queries (always prefer Alchemy for speed)
   */
  public getPriceClient(): PublicClient {
    if (this.alchemyHttpClient && this.config.useForTrading) {
      this.trackComputeUnits(10); // Price query costs ~10 CUs
      return this.alchemyHttpClient;
    }
    return this.localClient;
  }

  /**
   * Get WebSocket client for mempool monitoring
   */
  public getWsClient(): PublicClient | null {
    return this.alchemyWsClient;
  }

  /**
   * Measure latency to both endpoints
   */
  private async measureLatency(): Promise<void> {
    // Measure Alchemy latency
    if (this.alchemyHttpClient) {
      const start = Date.now();
      try {
        await this.alchemyHttpClient.getBlockNumber();
        this.latency.alchemy = Date.now() - start;
      } catch (error) {
        this.latency.alchemy = 999999; // Set high latency on error
      }
    }

    // Measure local latency
    const localStart = Date.now();
    try {
      await this.localClient.getBlockNumber();
      this.latency.local = Date.now() - localStart;
    } catch (error) {
      this.latency.local = 999999;
    }

    this.latency.lastChecked = Date.now();

    // Log if there's a significant difference
    if (Math.abs(this.latency.alchemy - this.latency.local) > 50) {
      const faster = this.latency.alchemy < this.latency.local ? 'Alchemy' : 'Local';
      const advantage = Math.abs(this.latency.alchemy - this.latency.local);
      console.log(`📊 ${faster} is ${advantage}ms faster (Alchemy: ${this.latency.alchemy}ms, Local: ${this.latency.local}ms)`);
    }
  }

  /**
   * Subscribe to pending transactions (mempool)
   */
  public async subscribePendingTransactions(
    callback: (txHash: string) => void
  ): Promise<() => void> {
    if (!this.alchemyWsClient) {
      console.warn('⚠️  WebSocket client not available, falling back to polling');
      // Fallback to polling
      const interval = setInterval(async () => {
        // This is less efficient but works as fallback
        const block = await this.localClient.getBlock({ includeTransactions: true });
        block.transactions.forEach(tx => callback(tx.hash));
      }, 1000);
      return () => clearInterval(interval);
    }

    const unwatch = this.alchemyWsClient.watchPendingTransactions({
      onTransactions: (txs) => txs.forEach(callback),
    });

    this.trackComputeUnits(100); // Mempool subscription costs
    return unwatch;
  }

  /**
   * Send private transaction to avoid frontrunning (Alchemy feature)
   */
  public async sendPrivateTransaction(tx: any): Promise<string> {
    if (!this.config.usePrivateMempool || !this.alchemyHttpClient) {
      throw new Error('Private mempool not configured');
    }

    // Use Alchemy's eth_sendPrivateTransaction
    const result = await fetch(`${this.config.httpUrl}${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendPrivateTransaction',
        params: [tx],
        id: 1,
      }),
    });

    const data = await result.json();
    this.trackComputeUnits(50);

    if (data.error) {
      throw new Error(`Private transaction failed: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * Simulate transaction bundle (for MEV protection)
   */
  public async simulateBundle(txs: any[]): Promise<any> {
    if (!this.config.enableDebugApi || !this.alchemyHttpClient) {
      throw new Error('Debug API not enabled');
    }

    const result = await fetch(`${this.config.httpUrl}${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_callBundle',
        params: [{ txs, blockNumber: 'latest' }],
        id: 1,
      }),
    });

    const data = await result.json();
    this.trackComputeUnits(200); // Bundle simulation is expensive
    return data.result;
  }

  /**
   * Get enhanced gas estimates from Alchemy
   */
  public async getGasEstimates(): Promise<{
    slow: bigint;
    standard: bigint;
    fast: bigint;
    baseFee: bigint;
    nextBlockBaseFee: bigint;
  }> {
    if (!this.alchemyHttpClient) {
      // Fallback to local estimation
      const fee = await this.localClient.estimateFeesPerGas();
      return {
        slow: fee.gasPrice || 0n,
        standard: fee.gasPrice || 0n,
        fast: fee.gasPrice || 0n,
        baseFee: fee.gasPrice || 0n,
        nextBlockBaseFee: fee.gasPrice || 0n,
      };
    }

    // Use Alchemy's enhanced gas API
    const result = await fetch(`${this.config.httpUrl}${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPriceEstimate',
        params: [],
        id: 1,
      }),
    });

    const data = await result.json();
    this.trackComputeUnits(5);

    // Parse response and return formatted gas prices
    return {
      slow: BigInt(data.result?.slow || 0),
      standard: BigInt(data.result?.standard || 0),
      fast: BigInt(data.result?.fast || 0),
      baseFee: BigInt(data.result?.baseFee || 0),
      nextBlockBaseFee: BigInt(data.result?.nextBlockBaseFee || 0),
    };
  }

  /**
   * Track compute units usage
   */
  private trackComputeUnits(units: number): void {
    this.computeUnitsUsed += units;

    // Warn if approaching limit
    if (this.computeUnitsUsed > this.MONTHLY_LIMIT * 0.8) {
      console.warn(`⚠️  Approaching Alchemy free tier limit: ${this.computeUnitsUsed.toLocaleString()} / ${this.MONTHLY_LIMIT.toLocaleString()} CUs used`);
    }
  }

  /**
   * Get current usage stats
   */
  public getUsageStats(): {
    computeUnitsUsed: number;
    percentOfLimit: number;
    latency: ClientLatency;
  } {
    return {
      computeUnitsUsed: this.computeUnitsUsed,
      percentOfLimit: (this.computeUnitsUsed / this.MONTHLY_LIMIT) * 100,
      latency: this.latency,
    };
  }

  /**
   * Cleanup connections
   */
  public async cleanup(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
    }
  }
}

// Export singleton instance
export const alchemyManager = new AlchemyRPCManager(process.env.PRIVATE_KEY);

// Export convenience functions
export const getAlchemyClient = () => alchemyManager.getOptimalClient();
export const getPriceClient = () => alchemyManager.getPriceClient();
export const getWsClient = () => alchemyManager.getWsClient();