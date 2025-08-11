/**
 * API响应缓存管理器
 * 提供内存缓存、持久化缓存和缓存策略管理
 */

class ApiCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100; // 最大缓存条目数
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 默认5分钟TTL
    this.enablePersistence = options.enablePersistence !== false; // 默认启用持久化
    this.storagePrefix = options.storagePrefix || 'api_cache_';
    
    // 内存缓存
    this.memoryCache = new Map();
    
    // 缓存统计
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0
    };
    
    // 初始化时从持久化存储加载缓存
    this.loadFromStorage();
    
    // 定期清理过期缓存
    this.startCleanupTimer();
  }

  /**
   * 生成缓存键
   * @param {string} endpoint - API端点
   * @param {Object} params - 请求参数
   * @returns {string} 缓存键
   */
  generateKey(endpoint, params = {}) {
    const paramStr = Object.keys(params).length > 0 
      ? JSON.stringify(params, Object.keys(params).sort())
      : '';
    return `${endpoint}${paramStr ? `?${paramStr}` : ''}`;
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存的数据或null
   */
  get(key) {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // 更新访问时间
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    
    console.log(`缓存命中: ${key}`);
    return entry.data;
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {any} data - 要缓存的数据
   * @param {number} ttl - 生存时间（毫秒）
   */
  set(key, data, ttl = this.defaultTTL) {
    // 如果缓存已满，清理最旧的条目
    if (this.memoryCache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    const entry = {
      data,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      ttl,
      size: this.calculateSize(data)
    };
    
    this.memoryCache.set(key, entry);
    this.stats.sets++;
    
    // 持久化到存储
    if (this.enablePersistence) {
      this.saveToStorage(key, entry);
    }
    
    console.log(`数据已缓存: ${key}, TTL: ${ttl}ms`);
  }

  /**
   * 删除缓存数据
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    const deleted = this.memoryCache.delete(key);
    
    if (deleted) {
      this.stats.deletes++;
      
      // 从持久化存储中删除
      if (this.enablePersistence) {
        this.removeFromStorage(key);
      }
      
      console.log(`缓存已删除: ${key}`);
    }
    
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.memoryCache.clear();
    this.stats.clears++;
    
    // 清空持久化存储
    if (this.enablePersistence) {
      this.clearStorage();
    }
    
    console.log('所有缓存已清空');
  }

  /**
   * 检查缓存条目是否过期
   * @param {Object} entry - 缓存条目
   * @returns {boolean} 是否过期
   */
  isExpired(entry) {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * 清理过期的缓存条目
   */
  cleanup() {
    let cleanedCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`清理了 ${cleanedCount} 个过期缓存条目`);
    }
  }

  /**
   * 驱逐最旧的缓存条目
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
      console.log(`驱逐最旧缓存条目: ${oldestKey}`);
    }
  }

  /**
   * 计算数据大小（简单估算）
   * @param {any} data - 数据
   * @returns {number} 估算的字节大小
   */
  calculateSize(data) {
    try {
      return JSON.stringify(data).length * 2; // 简单估算，每字符2字节
    } catch {
      return 0;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalSize = Array.from(this.memoryCache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      size: this.memoryCache.size,
      maxSize: this.maxSize,
      totalSize,
      hitRate: `${hitRate}%`,
      memoryUsage: `${(totalSize / 1024).toFixed(2)} KB`
    };
  }

  /**
   * 获取所有缓存键
   * @returns {string[]} 缓存键数组
   */
  getKeys() {
    return Array.from(this.memoryCache.keys());
  }

  /**
   * 检查是否存在指定键的缓存
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在
   */
  has(key) {
    const entry = this.memoryCache.get(key);
    return entry && !this.isExpired(entry);
  }

  /**
   * 从持久化存储加载缓存
   */
  loadFromStorage() {
    if (!this.enablePersistence) return;
    
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.storagePrefix)
      );
      
      let loadedCount = 0;
      
      for (const storageKey of keys) {
        try {
          const data = localStorage.getItem(storageKey);
          const entry = JSON.parse(data);
          const cacheKey = storageKey.replace(this.storagePrefix, '');
          
          // 检查是否过期
          if (!this.isExpired(entry)) {
            this.memoryCache.set(cacheKey, entry);
            loadedCount++;
          } else {
            // 删除过期的持久化数据
            localStorage.removeItem(storageKey);
          }
        } catch (error) {
          console.warn(`加载缓存失败: ${storageKey}`, error);
          localStorage.removeItem(storageKey);
        }
      }
      
      if (loadedCount > 0) {
        console.log(`从持久化存储加载了 ${loadedCount} 个缓存条目`);
      }
    } catch (error) {
      console.warn('从持久化存储加载缓存失败:', error);
    }
  }

  /**
   * 保存到持久化存储
   * @param {string} key - 缓存键
   * @param {Object} entry - 缓存条目
   */
  saveToStorage(key, entry) {
    if (!this.enablePersistence) return;
    
    try {
      const storageKey = this.storagePrefix + key;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.warn(`保存缓存到持久化存储失败: ${key}`, error);
    }
  }

  /**
   * 从持久化存储删除
   * @param {string} key - 缓存键
   */
  removeFromStorage(key) {
    if (!this.enablePersistence) return;
    
    try {
      const storageKey = this.storagePrefix + key;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`从持久化存储删除缓存失败: ${key}`, error);
    }
  }

  /**
   * 清空持久化存储
   */
  clearStorage() {
    if (!this.enablePersistence) return;
    
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.storagePrefix)
      );
      
      for (const key of keys) {
        localStorage.removeItem(key);
      }
      
      console.log('持久化缓存存储已清空');
    } catch (error) {
      console.warn('清空持久化缓存存储失败:', error);
    }
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    // 每5分钟清理一次过期缓存
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 销毁缓存管理器
   */
  destroy() {
    this.stopCleanupTimer();
    this.clear();
  }
}

export default ApiCache;