/**
 * 内存保护工具类
 * 提供敏感信息的安全清理和内存保护机制
 */

/**
 * 安全字符串类
 * 用于存储敏感信息，提供自动清理功能
 */
class SecureString {
  constructor(value, autoCleanupMs = 300000) { // 默认5分钟后自动清理
    this._value = value;
    this._accessed = false;
    this._cleared = false;
    this._createdAt = Date.now();
    this._lastAccessAt = Date.now();
    this._autoCleanupMs = autoCleanupMs;
    
    // 设置自动清理定时器
    if (autoCleanupMs > 0) {
      this._cleanupTimer = setTimeout(() => {
        this.clear();
      }, autoCleanupMs);
    }
    
    // 添加到全局清理列表
    MemoryProtection.addSecureString(this);
  }

  /**
   * 获取值（只能获取一次）
   * @returns {string|null} 值或null
   */
  getValue() {
    if (this._cleared) {
      console.warn('尝试访问已清理的安全字符串');
      return null;
    }
    
    this._accessed = true;
    this._lastAccessAt = Date.now();
    return this._value;
  }

  /**
   * 安全获取值（可多次获取，但会更新访问时间）
   * @returns {string|null} 值或null
   */
  peek() {
    if (this._cleared) {
      return null;
    }
    
    this._lastAccessAt = Date.now();
    return this._value;
  }

  /**
   * 检查是否已被清理
   * @returns {boolean} 是否已清理
   */
  isCleared() {
    return this._cleared;
  }

  /**
   * 检查是否已被访问
   * @returns {boolean} 是否已访问
   */
  isAccessed() {
    return this._accessed;
  }

  /**
   * 获取创建时间
   * @returns {number} 创建时间戳
   */
  getCreatedAt() {
    return this._createdAt;
  }

  /**
   * 获取最后访问时间
   * @returns {number} 最后访问时间戳
   */
  getLastAccessAt() {
    return this._lastAccessAt;
  }

  /**
   * 清理敏感数据
   */
  clear() {
    if (this._cleared) {
      return;
    }

    // 尝试覆盖内存中的字符串
    if (this._value) {
      // JavaScript中无法直接清理内存，但可以覆盖变量
      const length = this._value.length;
      this._value = '*'.repeat(length); // 用星号覆盖
      this._value = null; // 设置为null
    }

    this._cleared = true;
    this._accessed = true;

    // 清理定时器
    if (this._cleanupTimer) {
      clearTimeout(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // 从全局清理列表中移除
    MemoryProtection.removeSecureString(this);

    console.log('安全字符串已清理');
  }

  /**
   * 延长生命周期
   * @param {number} additionalMs - 额外的毫秒数
   */
  extend(additionalMs) {
    if (this._cleared) {
      return;
    }

    if (this._cleanupTimer) {
      clearTimeout(this._cleanupTimer);
    }

    this._cleanupTimer = setTimeout(() => {
      this.clear();
    }, additionalMs);
  }

  /**
   * 克隆安全字符串
   * @param {number} autoCleanupMs - 自动清理时间
   * @returns {SecureString} 新的安全字符串实例
   */
  clone(autoCleanupMs = this._autoCleanupMs) {
    if (this._cleared) {
      throw new Error('无法克隆已清理的安全字符串');
    }

    return new SecureString(this._value, autoCleanupMs);
  }
}

/**
 * 内存保护主类
 */
class MemoryProtection {
  static _secureStrings = new Set();
  static _cleanupInterval = null;
  static _isInitialized = false;

  /**
   * 初始化内存保护
   */
  static initialize() {
    if (this._isInitialized) {
      return;
    }

    // 启动定期清理
    this._cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // 每分钟清理一次

    // 监听页面卸载事件
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.emergencyCleanup();
      });

      // 监听页面隐藏事件（移动端）
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.performCleanup();
        }
      });
    }

    this._isInitialized = true;
    console.log('内存保护已初始化');
  }

  /**
   * 创建安全字符串
   * @param {string} value - 敏感值
   * @param {number} autoCleanupMs - 自动清理时间
   * @returns {SecureString} 安全字符串实例
   */
  static createSecureString(value, autoCleanupMs = 300000) {
    if (!this._isInitialized) {
      this.initialize();
    }

    return new SecureString(value, autoCleanupMs);
  }

  /**
   * 添加安全字符串到管理列表
   * @param {SecureString} secureString - 安全字符串实例
   */
  static addSecureString(secureString) {
    this._secureStrings.add(secureString);
  }

  /**
   * 从管理列表中移除安全字符串
   * @param {SecureString} secureString - 安全字符串实例
   */
  static removeSecureString(secureString) {
    this._secureStrings.delete(secureString);
  }

  /**
   * 执行定期清理
   */
  static performCleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const secureString of this._secureStrings) {
      // 清理超过生命周期的字符串
      if (!secureString.isCleared()) {
        const age = now - secureString.getCreatedAt();
        const timeSinceLastAccess = now - secureString.getLastAccessAt();

        // 如果超过最大生命周期或长时间未访问，则清理
        if (age > 600000 || timeSinceLastAccess > 300000) { // 10分钟或5分钟未访问
          secureString.clear();
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`定期清理完成，清理了 ${cleanedCount} 个安全字符串`);
    }

    // 清理已经被清理的实例
    const clearedStrings = Array.from(this._secureStrings).filter(s => s.isCleared());
    clearedStrings.forEach(s => this._secureStrings.delete(s));
  }

  /**
   * 紧急清理所有敏感数据
   */
  static emergencyCleanup() {
    console.log('执行紧急内存清理');
    
    for (const secureString of this._secureStrings) {
      if (!secureString.isCleared()) {
        secureString.clear();
      }
    }

    this._secureStrings.clear();

    // 尝试清理localStorage中的敏感数据
    this.clearSensitiveStorage();

    console.log('紧急清理完成');
  }

  /**
   * 清理存储中的敏感数据
   */
  static clearSensitiveStorage() {
    try {
      const sensitiveKeys = [
        'uxp_secure_user_credentials',
        'login_rate_limit_',
        'auth_error_logs'
      ];

      const keys = Object.keys(localStorage);
      let clearedCount = 0;

      for (const key of keys) {
        const shouldClear = sensitiveKeys.some(sensitiveKey => 
          key.includes(sensitiveKey)
        );

        if (shouldClear) {
          localStorage.removeItem(key);
          clearedCount++;
        }
      }

      console.log(`清理了 ${clearedCount} 个敏感存储项`);
    } catch (error) {
      console.error('清理敏感存储失败:', error);
    }
  }

  /**
   * 安全地处理密码输入
   * @param {string} password - 密码
   * @returns {SecureString} 安全字符串
   */
  static securePassword(password) {
    // 创建短生命周期的安全字符串（1分钟）
    return this.createSecureString(password, 60000);
  }

  /**
   * 安全地处理Token
   * @param {string} token - Token
   * @returns {SecureString} 安全字符串
   */
  static secureToken(token) {
    // 创建较长生命周期的安全字符串（30分钟）
    return this.createSecureString(token, 1800000);
  }

  /**
   * 获取内存保护统计信息
   * @returns {Object} 统计信息
   */
  static getStats() {
    const now = Date.now();
    let activeCount = 0;
    let clearedCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const secureString of this._secureStrings) {
      if (secureString.isCleared()) {
        clearedCount++;
      } else {
        activeCount++;
        const age = now - secureString.getCreatedAt();
        oldestAge = Math.max(oldestAge, age);
        newestAge = Math.min(newestAge, age);
      }
    }

    return {
      totalManaged: this._secureStrings.size,
      active: activeCount,
      cleared: clearedCount,
      oldestAge: oldestAge > 0 ? oldestAge : 0,
      newestAge: newestAge < Infinity ? newestAge : 0,
      isInitialized: this._isInitialized
    };
  }

  /**
   * 销毁内存保护系统
   */
  static destroy() {
    console.log('销毁内存保护系统');

    // 清理所有安全字符串
    this.emergencyCleanup();

    // 清理定时器
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    this._isInitialized = false;
  }

  /**
   * 创建安全的对象包装器
   * @param {Object} obj - 要保护的对象
   * @param {Array} sensitiveFields - 敏感字段列表
   * @returns {Object} 安全包装器
   */
  static createSecureWrapper(obj, sensitiveFields = []) {
    const wrapper = {};
    const secureFields = new Map();

    // 包装敏感字段
    for (const field of sensitiveFields) {
      if (obj[field] && typeof obj[field] === 'string') {
        secureFields.set(field, this.createSecureString(obj[field]));
        
        // 创建getter
        Object.defineProperty(wrapper, field, {
          get() {
            const secureString = secureFields.get(field);
            return secureString ? secureString.peek() : null;
          },
          enumerable: true,
          configurable: false
        });
      }
    }

    // 复制非敏感字段
    for (const [key, value] of Object.entries(obj)) {
      if (!sensitiveFields.includes(key)) {
        wrapper[key] = value;
      }
    }

    // 添加清理方法
    wrapper._clearSensitive = () => {
      for (const secureString of secureFields.values()) {
        secureString.clear();
      }
      secureFields.clear();
    };

    return wrapper;
  }

  /**
   * 安全地比较两个字符串（防止时序攻击）
   * @param {string} a - 字符串A
   * @param {string} b - 字符串B
   * @returns {boolean} 是否相等
   */
  static secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * 生成安全的随机字符串
   * @param {number} length - 长度
   * @returns {string} 随机字符串
   */
  static generateSecureRandom(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    // 使用crypto.getRandomValues如果可用
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      
      for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
      }
    } else {
      // 回退到Math.random
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    
    return result;
  }
}

// 自动初始化
if (typeof window !== 'undefined') {
  MemoryProtection.initialize();
}

export default MemoryProtection;
export { SecureString, MemoryProtection };