/**
 * Cache Manager - High-performance caching for expensive operations
 */

export class CacheManager {
  private cache: Map<string, { value: any, expiry: number }> = new Map();
  private maxSize: number = 1000;
  private ttl: number = 3600000; // 1 hour default TTL
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const expiry = Date.now() + (ttl || this.ttl);
    this.cache.set(key, { value, expiry });
    
    // Evict old entries if cache is too large
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }
  
  async get(key: string): Promise<any | undefined> {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  private evictOldest(): void {
    const sorted = Array.from(this.cache.entries())
      .sort((a, b) => a[1].expiry - b[1].expiry);
    
    // Remove 10% of oldest entries
    const toRemove = Math.floor(this.maxSize * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(sorted[i][0]);
    }
  }
  
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }
}