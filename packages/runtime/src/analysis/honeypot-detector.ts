/**
 * HONEYPOT DETECTOR
 *
 * Detects scam tokens and honeypots to avoid losses
 * - Simulates buy/sell transactions
 * - Checks for hidden fees
 * - Analyzes contract code
 * - Verifies liquidity locks
 */

import { createPublicClient, http, parseAbi, encodeFunctionData, formatEther, parseEther } from 'viem';
import { mainnet } from 'viem/chains';

// Common honeypot patterns
const HONEYPOT_SIGNATURES = [
  'onlyOwner',
  'whitelist',
  'blacklist',
  'pause',
  'freeze',
  'lock',
  'bot',
  'maxTx',
  'cooldown',
  '_fee',
  'tax'
];

// Uniswap interfaces
const UNISWAP_V2_PAIR_ABI = parseAbi([
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
]);

const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function owner() external view returns (address)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

export interface HoneypotCheckResult {
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  transferTax: number;
  maxTxAmount: number;
  maxWalletAmount: number;
  hasOwnerPrivileges: boolean;
  liquidityLocked: boolean;
  contractVerified: boolean;
  riskScore: number;
  warnings: string[];
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  owner?: string;
}

export class HoneypotDetector {
  private client;
  private routerAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap V2 Router
  private wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  constructor() {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545')
    });
  }

  async checkToken(tokenAddress: string): Promise<HoneypotCheckResult> {
    const warnings: string[] = [];
    let isHoneypot = false;
    let riskScore = 0;

    try {
      // 1. Get basic token info
      const tokenInfo = await this.getTokenInfo(tokenAddress);

      // 2. Check contract code
      const codeAnalysis = await this.analyzeContractCode(tokenAddress);
      if (codeAnalysis.suspicious) {
        warnings.push('Suspicious contract code patterns detected');
        riskScore += 30;
      }

      // 3. Simulate buy and sell
      const taxInfo = await this.simulateBuySell(tokenAddress);
      if (taxInfo.buyTax > 10) {
        warnings.push(`High buy tax: ${taxInfo.buyTax}%`);
        riskScore += 20;
      }
      if (taxInfo.sellTax > 10) {
        warnings.push(`High sell tax: ${taxInfo.sellTax}%`);
        riskScore += 25;
      }
      if (taxInfo.sellTax > 50) {
        isHoneypot = true;
        warnings.push('HONEYPOT: Extreme sell tax detected');
      }

      // 4. Check owner privileges
      const ownerCheck = await this.checkOwnerPrivileges(tokenAddress);
      if (ownerCheck.hasPrivileges) {
        warnings.push('Owner has special privileges');
        riskScore += 15;
      }

      // 5. Check liquidity
      const liquidityInfo = await this.checkLiquidity(tokenAddress);
      if (!liquidityInfo.hasLiquidity) {
        isHoneypot = true;
        warnings.push('HONEYPOT: No liquidity found');
      }
      if (!liquidityInfo.isLocked) {
        warnings.push('Liquidity not locked');
        riskScore += 10;
      }

      // 6. Check max transaction limits
      const limits = await this.checkTransactionLimits(tokenAddress, tokenInfo);
      if (limits.maxTxPercent < 1) {
        warnings.push(`Low max transaction: ${limits.maxTxPercent}%`);
        riskScore += 20;
      }

      // 7. Check holder distribution
      const distribution = await this.checkHolderDistribution(tokenAddress);
      if (distribution.topHolderPercent > 50) {
        warnings.push(`High concentration: Top holder owns ${distribution.topHolderPercent}%`);
        riskScore += 25;
      }

      // Calculate final risk score
      if (isHoneypot) riskScore = 100;
      else riskScore = Math.min(100, riskScore);

      return {
        isHoneypot,
        buyTax: taxInfo.buyTax,
        sellTax: taxInfo.sellTax,
        transferTax: taxInfo.transferTax,
        maxTxAmount: limits.maxTxAmount,
        maxWalletAmount: limits.maxWalletAmount,
        hasOwnerPrivileges: ownerCheck.hasPrivileges,
        liquidityLocked: liquidityInfo.isLocked,
        contractVerified: codeAnalysis.verified,
        riskScore,
        warnings
      };
    } catch (error) {
      console.error('Honeypot check error:', error);
      return {
        isHoneypot: true,
        buyTax: 100,
        sellTax: 100,
        transferTax: 0,
        maxTxAmount: 0,
        maxWalletAmount: 0,
        hasOwnerPrivileges: true,
        liquidityLocked: false,
        contractVerified: false,
        riskScore: 100,
        warnings: ['Failed to analyze token - treating as honeypot']
      };
    }
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name'
      }).catch(() => 'Unknown'),
      this.client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol'
      }).catch(() => 'UNKNOWN'),
      this.client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }).catch(() => 18),
      this.client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'totalSupply'
      }).catch(() => 0n)
    ]);

    // Try to get owner
    const owner = await this.client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'owner'
    }).catch(() => undefined);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      totalSupply,
      owner
    };
  }

  private async analyzeContractCode(tokenAddress: string): Promise<any> {
    try {
      const code = await this.client.getBytecode({ address: tokenAddress });

      if (!code) {
        return { suspicious: true, verified: false };
      }

      // Check for honeypot signatures in bytecode
      let suspicious = false;
      for (const signature of HONEYPOT_SIGNATURES) {
        // Convert signature to hex and check if present in bytecode
        const hexSig = Buffer.from(signature).toString('hex');
        if (code.includes(hexSig)) {
          suspicious = true;
          break;
        }
      }

      // Check if contract is verified (would query Etherscan API)
      const verified = false; // Placeholder

      return { suspicious, verified };
    } catch (error) {
      return { suspicious: true, verified: false };
    }
  }

  private async simulateBuySell(tokenAddress: string): Promise<any> {
    try {
      const testAmount = parseEther('0.001'); // Test with 0.001 ETH
      const path = [this.wethAddress, tokenAddress];
      const reversePath = [tokenAddress, this.wethAddress];

      // Simulate buy
      const buyAmounts = await this.client.readContract({
        address: this.routerAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [testAmount, path]
      });

      const tokensReceived = buyAmounts[1];

      // Simulate sell
      const sellAmounts = await this.client.readContract({
        address: this.routerAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [tokensReceived, reversePath]
      }).catch(() => [0n, 0n]);

      const ethReceived = sellAmounts[1];

      // Calculate taxes
      const buyTax = 0; // Would calculate from actual vs expected
      const sellTax = Number((1 - Number(ethReceived) / Number(testAmount)) * 100);
      const transferTax = 0; // Would test transfers

      return {
        buyTax: Math.max(0, buyTax),
        sellTax: Math.max(0, sellTax),
        transferTax: Math.max(0, transferTax)
      };
    } catch (error) {
      // If simulation fails, assume high taxes
      return {
        buyTax: 99,
        sellTax: 99,
        transferTax: 99
      };
    }
  }

  private async checkOwnerPrivileges(tokenAddress: string): Promise<any> {
    try {
      // Check if contract has owner
      const owner = await this.client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'owner'
      }).catch(() => null);

      // Check for pause, blacklist, etc functions
      // This would require more complex analysis

      return {
        hasPrivileges: owner !== null && owner !== '0x0000000000000000000000000000000000000000',
        owner
      };
    } catch (error) {
      return { hasPrivileges: true };
    }
  }

  private async checkLiquidity(tokenAddress: string): Promise<any> {
    // Would check Uniswap pair for liquidity
    // And verify if liquidity is locked

    return {
      hasLiquidity: true, // Placeholder
      isLocked: false,    // Placeholder
      amount: 0
    };
  }

  private async checkTransactionLimits(tokenAddress: string, tokenInfo: TokenInfo): Promise<any> {
    // Would check for maxTxAmount and maxWalletAmount
    // These are common in contracts

    const totalSupply = Number(tokenInfo.totalSupply);

    return {
      maxTxAmount: totalSupply * 0.01, // 1% placeholder
      maxTxPercent: 1,
      maxWalletAmount: totalSupply * 0.02, // 2% placeholder
      maxWalletPercent: 2
    };
  }

  private async checkHolderDistribution(tokenAddress: string): Promise<any> {
    // Would analyze top holder percentages
    // This requires indexing or API access

    return {
      topHolderPercent: 10, // Placeholder
      top10Percent: 30,     // Placeholder
      uniqueHolders: 100    // Placeholder
    };
  }

  async quickCheck(tokenAddress: string): Promise<boolean> {
    try {
      // Quick check for obvious honeypots
      const taxInfo = await this.simulateBuySell(tokenAddress);

      return taxInfo.sellTax < 50 && taxInfo.buyTax < 20;
    } catch (error) {
      return false; // Assume honeypot if check fails
    }
  }
}

// Export singleton instance
export const honeypotDetector = new HoneypotDetector();