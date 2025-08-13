import { createPublicClient, http, parseEther, formatEther, encodeFunctionData } from 'viem';
import { mainnet } from 'viem/chains';
import { WalletManager } from './wallet-manager.js';
import dotenv from 'dotenv';

dotenv.config();

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as const;
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564' as const;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;

interface TradeParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  slippage?: number;
  deadline?: number;
  recipient?: `0x${string}`;
}

interface TradeResult {
  txHash: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  tokenIn: string;
  tokenOut: string;
  gasUsed: bigint;
  effectivePrice: number;
}

export class TradeExecutor {
  private walletManager: WalletManager;
  private publicClient;
  private maxGasPrice: bigint;
  private defaultSlippage: number;
  private dryRun: boolean;

  constructor(walletManager: WalletManager) {
    this.walletManager = walletManager;
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545')
    });
    
    this.maxGasPrice = parseEther(process.env.MAX_GAS_PRICE_GWEI || '100', 'gwei');
    this.defaultSlippage = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.03');
    this.dryRun = process.env.DRY_RUN_MODE === 'true';
  }

  async swapExactETHForTokens(
    tokenOut: `0x${string}`,
    amountInETH: string,
    walletAddress?: string
  ): Promise<TradeResult | null> {
    const client = await this.walletManager.getClient(walletAddress);
    const amountIn = parseEther(amountInETH);
    
    const gasPrice = await this.publicClient.getGasPrice();
    if (gasPrice > this.maxGasPrice) {
      console.error(`Gas price too high: ${formatEther(gasPrice, 'gwei')} gwei`);
      return null;
    }

    const path = [WETH, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 900; // 15 minutes
    
    const minAmountOut = await this.estimateAmountOut(amountIn, path);
    const minAmountOutWithSlippage = minAmountOut * BigInt(Math.floor((1 - this.defaultSlippage) * 1000)) / 1000n;

    const data = encodeFunctionData({
      abi: UNISWAP_V2_ABI,
      functionName: 'swapExactETHForTokens',
      args: [minAmountOutWithSlippage, path, client.account.address, deadline]
    });

    if (this.dryRun) {
      console.log('🔍 DRY RUN - Would execute trade:');
      console.log(`  • Swap ${amountInETH} ETH for ${tokenOut}`);
      console.log(`  • Min output: ${formatEther(minAmountOutWithSlippage)}`);
      console.log(`  • Gas price: ${formatEther(gasPrice, 'gwei')} gwei`);
      return null;
    }

    try {
      const txHash = await client.sendTransaction({
        to: UNISWAP_V2_ROUTER,
        data,
        value: amountIn,
        gasPrice
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      
      return {
        txHash,
        amountIn,
        amountOut: minAmountOutWithSlippage,
        tokenIn: WETH,
        tokenOut,
        gasUsed: receipt.gasUsed,
        effectivePrice: Number(amountIn) / Number(minAmountOutWithSlippage)
      };
    } catch (error) {
      console.error('Trade execution failed:', error);
      return null;
    }
  }

  async swapExactTokensForETH(
    tokenIn: `0x${string}`,
    amountIn: bigint,
    walletAddress?: string
  ): Promise<TradeResult | null> {
    const client = await this.walletManager.getClient(walletAddress);
    
    const gasPrice = await this.publicClient.getGasPrice();
    if (gasPrice > this.maxGasPrice) {
      console.error(`Gas price too high: ${formatEther(gasPrice, 'gwei')} gwei`);
      return null;
    }

    const path = [tokenIn, WETH];
    const deadline = Math.floor(Date.now() / 1000) + 900;
    
    const minAmountOut = await this.estimateAmountOut(amountIn, path);
    const minAmountOutWithSlippage = minAmountOut * BigInt(Math.floor((1 - this.defaultSlippage) * 1000)) / 1000n;

    const approvalData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [UNISWAP_V2_ROUTER, amountIn]
    });

    const swapData = encodeFunctionData({
      abi: UNISWAP_V2_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountIn, minAmountOutWithSlippage, path, client.account.address, deadline]
    });

    if (this.dryRun) {
      console.log('🔍 DRY RUN - Would execute trade:');
      console.log(`  • Swap ${formatEther(amountIn)} ${tokenIn} for ETH`);
      console.log(`  • Min output: ${formatEther(minAmountOutWithSlippage)} ETH`);
      return null;
    }

    try {
      await client.sendTransaction({
        to: tokenIn,
        data: approvalData,
        gasPrice
      });

      const txHash = await client.sendTransaction({
        to: UNISWAP_V2_ROUTER,
        data: swapData,
        gasPrice
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      
      return {
        txHash,
        amountIn,
        amountOut: minAmountOutWithSlippage,
        tokenIn,
        tokenOut: WETH,
        gasUsed: receipt.gasUsed,
        effectivePrice: Number(amountIn) / Number(minAmountOutWithSlippage)
      };
    } catch (error) {
      console.error('Trade execution failed:', error);
      return null;
    }
  }

  async swapTokensForTokens(
    params: TradeParams,
    walletAddress?: string
  ): Promise<TradeResult | null> {
    const client = await this.walletManager.getClient(walletAddress);
    const { tokenIn, tokenOut, amountIn, slippage = this.defaultSlippage } = params;
    
    const gasPrice = await this.publicClient.getGasPrice();
    if (gasPrice > this.maxGasPrice) {
      console.error(`Gas price too high: ${formatEther(gasPrice, 'gwei')} gwei`);
      return null;
    }

    const path = [tokenIn, WETH, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 900;
    
    const minAmountOut = await this.estimateAmountOut(amountIn, path);
    const minAmountOutWithSlippage = minAmountOut * BigInt(Math.floor((1 - slippage) * 1000)) / 1000n;

    if (this.dryRun) {
      console.log('🔍 DRY RUN - Would execute trade:');
      console.log(`  • Swap ${formatEther(amountIn)} ${tokenIn}`);
      console.log(`  • For ${tokenOut}`);
      console.log(`  • Min output: ${formatEther(minAmountOutWithSlippage)}`);
      return null;
    }

    const approvalData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [UNISWAP_V2_ROUTER, amountIn]
    });

    const swapData = encodeFunctionData({
      abi: UNISWAP_V2_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, minAmountOutWithSlippage, path, client.account.address, deadline]
    });

    try {
      await client.sendTransaction({
        to: tokenIn,
        data: approvalData,
        gasPrice
      });

      const txHash = await client.sendTransaction({
        to: UNISWAP_V2_ROUTER,
        data: swapData,
        gasPrice
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      
      return {
        txHash,
        amountIn,
        amountOut: minAmountOutWithSlippage,
        tokenIn,
        tokenOut,
        gasUsed: receipt.gasUsed,
        effectivePrice: Number(amountIn) / Number(minAmountOutWithSlippage)
      };
    } catch (error) {
      console.error('Trade execution failed:', error);
      return null;
    }
  }

  private async estimateAmountOut(amountIn: bigint, path: `0x${string}`[]): Promise<bigint> {
    try {
      const result = await this.publicClient.readContract({
        address: UNISWAP_V2_ROUTER,
        abi: UNISWAP_V2_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path]
      });
      return (result as bigint[])[path.length - 1];
    } catch {
      return amountIn * 95n / 100n;
    }
  }

  async getTokenBalance(token: `0x${string}`, address?: string): Promise<bigint> {
    const client = await this.walletManager.getClient(address);
    
    return await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [client.account.address]
    }) as bigint;
  }

  setDryRun(enabled: boolean): void {
    this.dryRun = enabled;
  }
}

const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  }
] as const;

const UNISWAP_V2_ABI = [
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    type: 'function',
    payable: true
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForETH',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    type: 'function',
    view: true
  }
] as const;