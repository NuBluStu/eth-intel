import forge from 'node-forge';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { mainnet } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

interface EncryptedWallet {
  address: string;
  encryptedKey: string;
  salt: string;
  iv: string;
  tag: string;
  alias?: string;
  createdAt: string;
}

interface WalletStore {
  wallets: EncryptedWallet[];
  activeWallet?: string;
}

export class WalletManager {
  private storePath: string;
  private password: string;
  private store: WalletStore;
  private decryptedWallets: Map<string, PrivateKeyAccount> = new Map();

  constructor(password?: string) {
    this.storePath = path.join(os.homedir(), '.eth-trading-bot', 'wallets.json');
    this.password = password || process.env.WALLET_PASSWORD || '';
    this.store = { wallets: [] };
    
    if (!this.password) {
      throw new Error('Wallet password not provided. Set WALLET_PASSWORD env var or pass to constructor');
    }
  }

  async init(): Promise<void> {
    await this.ensureStorageDir();
    await this.loadStore();
  }

  private async ensureStorageDir(): Promise<void> {
    const dir = path.dirname(this.storePath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async loadStore(): Promise<void> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      this.store = JSON.parse(data);
    } catch {
      this.store = { wallets: [] };
      await this.saveStore();
    }
  }

  private async saveStore(): Promise<void> {
    await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private deriveKey(password: string, salt: string): string {
    return forge.pkcs5.pbkdf2(password, salt, 10000, 32);
  }

  private encryptPrivateKey(privateKey: string): EncryptedWallet {
    const salt = forge.random.getBytesSync(16);
    const iv = forge.random.getBytesSync(16);
    const key = this.deriveKey(this.password, salt);
    
    const cipher = forge.cipher.createCipher('AES-GCM', key);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(privateKey));
    cipher.finish();
    
    const account = privateKeyToAccount(`0x${privateKey}` as `0x${string}`);
    
    return {
      address: account.address.toLowerCase(),
      encryptedKey: forge.util.encode64(cipher.output.getBytes()),
      salt: forge.util.encode64(salt),
      iv: forge.util.encode64(iv),
      tag: forge.util.encode64(cipher.mode.tag.getBytes()),
      createdAt: new Date().toISOString()
    };
  }

  private decryptPrivateKey(wallet: EncryptedWallet): string {
    const salt = forge.util.decode64(wallet.salt);
    const iv = forge.util.decode64(wallet.iv);
    const tag = forge.util.decode64(wallet.tag);
    const key = this.deriveKey(this.password, salt);
    
    const decipher = forge.cipher.createDecipher('AES-GCM', key);
    decipher.start({ iv, tag: forge.util.createBuffer(tag) });
    decipher.update(forge.util.createBuffer(forge.util.decode64(wallet.encryptedKey)));
    
    if (!decipher.finish()) {
      throw new Error('Failed to decrypt wallet - invalid password or corrupted data');
    }
    
    return decipher.output.toString();
  }

  async importWallet(privateKey: string, alias?: string): Promise<string> {
    const cleanKey = privateKey.replace(/^0x/, '');
    
    const encrypted = this.encryptPrivateKey(cleanKey);
    if (alias) encrypted.alias = alias;
    
    const existing = this.store.wallets.findIndex(w => w.address === encrypted.address);
    if (existing >= 0) {
      this.store.wallets[existing] = encrypted;
    } else {
      this.store.wallets.push(encrypted);
    }
    
    if (!this.store.activeWallet) {
      this.store.activeWallet = encrypted.address;
    }
    
    await this.saveStore();
    return encrypted.address;
  }

  async createWallet(alias?: string): Promise<{ address: string; privateKey: string }> {
    const privateKey = forge.util.bytesToHex(forge.random.getBytesSync(32));
    const address = await this.importWallet(privateKey, alias);
    return { address, privateKey: `0x${privateKey}` };
  }

  async getAccount(address?: string): Promise<PrivateKeyAccount> {
    const targetAddress = address || this.store.activeWallet;
    if (!targetAddress) {
      throw new Error('No wallet available');
    }

    const cached = this.decryptedWallets.get(targetAddress.toLowerCase());
    if (cached) return cached;

    const wallet = this.store.wallets.find(w => w.address === targetAddress.toLowerCase());
    if (!wallet) {
      throw new Error(`Wallet ${targetAddress} not found`);
    }

    const privateKey = this.decryptPrivateKey(wallet);
    const account = privateKeyToAccount(`0x${privateKey}` as `0x${string}`);
    
    this.decryptedWallets.set(targetAddress.toLowerCase(), account);
    return account;
  }

  async getClient(address?: string) {
    const account = await this.getAccount(address);
    
    return createWalletClient({
      account,
      chain: mainnet,
      transport: http(process.env.RPC_HTTP || 'http://127.0.0.1:8545')
    }).extend(publicActions);
  }

  async listWallets(): Promise<Array<{ address: string; alias?: string; active: boolean }>> {
    return this.store.wallets.map(w => ({
      address: w.address,
      alias: w.alias,
      active: w.address === this.store.activeWallet
    }));
  }

  async setActiveWallet(address: string): Promise<void> {
    const wallet = this.store.wallets.find(w => w.address === address.toLowerCase());
    if (!wallet) {
      throw new Error(`Wallet ${address} not found`);
    }
    this.store.activeWallet = address.toLowerCase();
    await this.saveStore();
  }

  async removeWallet(address: string): Promise<void> {
    this.store.wallets = this.store.wallets.filter(w => w.address !== address.toLowerCase());
    if (this.store.activeWallet === address.toLowerCase()) {
      this.store.activeWallet = this.store.wallets[0]?.address;
    }
    this.decryptedWallets.delete(address.toLowerCase());
    await this.saveStore();
  }

  async getBalance(address?: string): Promise<bigint> {
    const client = await this.getClient(address);
    return await client.getBalance({ address: client.account.address });
  }

  clearCache(): void {
    this.decryptedWallets.clear();
  }
}