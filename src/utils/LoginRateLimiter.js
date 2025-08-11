/**
 * 登录频率限制器
 * 防止暴力破解和频繁登录尝试
 */
class LoginRateLimiter {
  constructor(options = {}) {
    // 配置选项
    this.maxAttempts = options.maxAttempts || 5; // 最大尝试次数
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 时间窗口（15分钟）
    this.blockDurationMs = options.blockDurationMs || 30 * 60 * 1000; // 封锁时长（30分钟）
    this.progressiveDelay = options.progressiveDelay !== false; // 是否启用递增延迟
    
    // 存储键前缀
    this.storagePrefix = 'login_rate_limit_';
    
    // 内存缓存（用于性能优化）
    this.memoryCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 缓存5分钟
    
    console.log('登录频率限制器已初始化:', {
      maxAttempts: this.maxAttempts,
      windowMs: this.windowMs,
      blockDurationMs: this.blockDurationMs
    });
  }

  /**
   * 检查是否允许登录尝试
   * @param {string} identifier - 标识符（用户名或IP）
   * @returns {Promise<Object>} 检查结果
   */
  async checkAttempt(identifier) {
    try {
      if (!identifier) {
        throw new Error('标识符不能为空');
      }

      const key = this.getStorageKey(identifier);
      const attemptData = await this.getAttemptData(key);
      const now = Date.now();

      // 检查是否在封锁期内
      if (attemptData.blockedUntil && now < attemptData.blockedUntil) {
        const remainingTime = attemptData.blockedUntil - now;
        return {
          allowed: false,
          reason: 'blocked',
          message: '登录已被暂时封锁，请稍后重试',
          remainingTime,
          nextAttemptAt: attemptData.blockedUntil,
          attempts: attemptData.attempts.length
        };
      }

      // 清理过期的尝试记录
      const validAttempts = attemptData.attempts.filter(
        attempt => now - attempt.timestamp < this.windowMs
      );

      // 检查是否超过最大尝试次数
      if (validAttempts.length >= this.maxAttempts) {
        // 计算封锁时间
        const blockedUntil = now + this.blockDurationMs;
        
        // 更新封锁状态
        await this.updateAttemptData(key, {
          ...attemptData,
          attempts: validAttempts,
          blockedUntil,
          lastBlockTime: now
        });

        return {
          allowed: false,
          reason: 'rate_limited',
          message: `登录尝试过于频繁，已封锁 ${Math.ceil(this.blockDurationMs / 60000)} 分钟`,
          remainingTime: this.blockDurationMs,
          nextAttemptAt: blockedUntil,
          attempts: validAttempts.length
        };
      }

      // 计算建议延迟时间
      const suggestedDelay = this.calculateDelay(validAttempts.length);

      return {
        allowed: true,
        reason: 'allowed',
        message: '允许登录尝试',
        attempts: validAttempts.length,
        maxAttempts: this.maxAttempts,
        suggestedDelay,
        remainingAttempts: this.maxAttempts - validAttempts.length
      };

    } catch (error) {
      console.error('检查登录尝试失败:', error);
      // 出错时默认允许，但记录错误
      return {
        allowed: true,
        reason: 'error',
        message: '频率检查失败，默认允许',
        error: error.message
      };
    }
  }

  /**
   * 记录登录尝试
   * @param {string} identifier - 标识符
   * @param {boolean} success - 是否成功
   * @param {Object} metadata - 额外元数据
   * @returns {Promise<boolean>} 记录是否成功
   */
  async recordAttempt(identifier, success, metadata = {}) {
    try {
      if (!identifier) {
        throw new Error('标识符不能为空');
      }

      const key = this.getStorageKey(identifier);
      const attemptData = await this.getAttemptData(key);
      const now = Date.now();

      // 创建尝试记录
      const attemptRecord = {
        timestamp: now,
        success,
        userAgent: navigator.userAgent,
        ...metadata
      };

      // 如果登录成功，清除所有尝试记录和封锁状态
      if (success) {
        await this.updateAttemptData(key, {
          attempts: [],
          blockedUntil: null,
          lastSuccessTime: now,
          totalSuccessCount: (attemptData.totalSuccessCount || 0) + 1
        });

        console.log(`登录成功，已清除频率限制: ${identifier}`);
        return true;
      }

      // 登录失败，添加失败记录
      const updatedAttempts = [...attemptData.attempts, attemptRecord];
      
      // 清理过期记录
      const validAttempts = updatedAttempts.filter(
        attempt => now - attempt.timestamp < this.windowMs
      );

      await this.updateAttemptData(key, {
        ...attemptData,
        attempts: validAttempts,
        lastFailureTime: now,
        totalFailureCount: (attemptData.totalFailureCount || 0) + 1
      });

      console.log(`记录登录失败尝试: ${identifier}`, {
        currentAttempts: validAttempts.length,
        maxAttempts: this.maxAttempts
      });

      return true;
    } catch (error) {
      console.error('记录登录尝试失败:', error);
      return false;
    }
  }

  /**
   * 重置指定标识符的限制
   * @param {string} identifier - 标识符
   * @returns {Promise<boolean>} 重置是否成功
   */
  async resetLimit(identifier) {
    try {
      if (!identifier) {
        throw new Error('标识符不能为空');
      }

      const key = this.getStorageKey(identifier);
      
      // 清除存储
      localStorage.removeItem(key);
      
      // 清除内存缓存
      this.memoryCache.delete(key);

      console.log(`已重置登录频率限制: ${identifier}`);
      return true;
    } catch (error) {
      console.error('重置登录频率限制失败:', error);
      return false;
    }
  }

  /**
   * 获取指定标识符的状态
   * @param {string} identifier - 标识符
   * @returns {Promise<Object>} 状态信息
   */
  async getStatus(identifier) {
    try {
      if (!identifier) {
        throw new Error('标识符不能为空');
      }

      const key = this.getStorageKey(identifier);
      const attemptData = await this.getAttemptData(key);
      const now = Date.now();

      // 清理过期记录
      const validAttempts = attemptData.attempts.filter(
        attempt => now - attempt.timestamp < this.windowMs
      );

      const isBlocked = attemptData.blockedUntil && now < attemptData.blockedUntil;
      const remainingTime = isBlocked ? attemptData.blockedUntil - now : 0;

      return {
        identifier,
        isBlocked,
        remainingTime,
        currentAttempts: validAttempts.length,
        maxAttempts: this.maxAttempts,
        remainingAttempts: Math.max(0, this.maxAttempts - validAttempts.length),
        windowMs: this.windowMs,
        lastAttemptTime: validAttempts.length > 0 ? 
          Math.max(...validAttempts.map(a => a.timestamp)) : null,
        totalFailures: attemptData.totalFailureCount || 0,
        totalSuccesses: attemptData.totalSuccessCount || 0,
        lastSuccessTime: attemptData.lastSuccessTime || null
      };
    } catch (error) {
      console.error('获取登录频率限制状态失败:', error);
      return {
        identifier,
        isBlocked: false,
        error: error.message
      };
    }
  }

  /**
   * 清理所有过期的限制记录
   * @returns {Promise<Object>} 清理结果
   */
  async cleanup() {
    const result = {
      cleaned: 0,
      errors: 0,
      totalSize: 0
    };

    try {
      const keys = Object.keys(localStorage);
      const rateLimitKeys = keys.filter(key => key.startsWith(this.storagePrefix));
      const now = Date.now();

      for (const key of rateLimitKeys) {
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;

          const attemptData = JSON.parse(data);
          
          // 检查是否完全过期
          const hasValidAttempts = attemptData.attempts && 
            attemptData.attempts.some(attempt => now - attempt.timestamp < this.windowMs);
          
          const isStillBlocked = attemptData.blockedUntil && now < attemptData.blockedUntil;

          if (!hasValidAttempts && !isStillBlocked) {
            // 完全过期，可以删除
            result.totalSize += data.length;
            localStorage.removeItem(key);
            this.memoryCache.delete(key);
            result.cleaned++;
          } else if (hasValidAttempts) {
            // 部分过期，清理过期记录
            const validAttempts = attemptData.attempts.filter(
              attempt => now - attempt.timestamp < this.windowMs
            );
            
            if (validAttempts.length < attemptData.attempts.length) {
              const updatedData = {
                ...attemptData,
                attempts: validAttempts
              };
              localStorage.setItem(key, JSON.stringify(updatedData));
              this.memoryCache.set(key, {
                data: updatedData,
                timestamp: now
              });
            }
          }
        } catch (error) {
          console.error(`清理频率限制记录失败 ${key}:`, error);
          result.errors++;
        }
      }

      console.log('登录频率限制清理完成:', result);
      return result;
    } catch (error) {
      console.error('清理登录频率限制失败:', error);
      result.errors++;
      return result;
    }
  }

  /**
   * 获取存储键
   * @param {string} identifier - 标识符
   * @returns {string} 存储键
   */
  getStorageKey(identifier) {
    // 对标识符进行简单哈希以保护隐私
    const hash = this.simpleHash(identifier);
    return `${this.storagePrefix}${hash}`;
  }

  /**
   * 获取尝试数据
   * @param {string} key - 存储键
   * @returns {Promise<Object>} 尝试数据
   */
  async getAttemptData(key) {
    try {
      // 先检查内存缓存
      const cached = this.memoryCache.get(key);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // 从localStorage读取
      const stored = localStorage.getItem(key);
      const data = stored ? JSON.parse(stored) : {
        attempts: [],
        blockedUntil: null,
        totalFailureCount: 0,
        totalSuccessCount: 0
      };

      // 更新内存缓存
      this.memoryCache.set(key, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error('获取尝试数据失败:', error);
      return {
        attempts: [],
        blockedUntil: null,
        totalFailureCount: 0,
        totalSuccessCount: 0
      };
    }
  }

  /**
   * 更新尝试数据
   * @param {string} key - 存储键
   * @param {Object} data - 数据
   * @returns {Promise<boolean>} 更新是否成功
   */
  async updateAttemptData(key, data) {
    try {
      const dataString = JSON.stringify(data);
      localStorage.setItem(key, dataString);
      
      // 更新内存缓存
      this.memoryCache.set(key, {
        data,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error('更新尝试数据失败:', error);
      return false;
    }
  }

  /**
   * 计算建议延迟时间
   * @param {number} attemptCount - 当前尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  calculateDelay(attemptCount) {
    if (!this.progressiveDelay || attemptCount === 0) {
      return 0;
    }

    // 递增延迟：1秒、2秒、4秒、8秒...
    const baseDelay = 1000; // 1秒
    const maxDelay = 30000; // 最大30秒
    
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
    return delay;
  }

  /**
   * 简单哈希函数
   * @param {string} input - 输入字符串
   * @returns {string} 哈希值
   */
  simpleHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 获取全局统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getGlobalStats() {
    try {
      const keys = Object.keys(localStorage);
      const rateLimitKeys = keys.filter(key => key.startsWith(this.storagePrefix));
      
      let totalAttempts = 0;
      let totalBlocked = 0;
      let totalFailures = 0;
      let totalSuccesses = 0;
      const now = Date.now();

      for (const key of rateLimitKeys) {
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;

          const attemptData = JSON.parse(data);
          
          // 统计有效尝试
          const validAttempts = attemptData.attempts.filter(
            attempt => now - attempt.timestamp < this.windowMs
          );
          totalAttempts += validAttempts.length;

          // 统计封锁状态
          if (attemptData.blockedUntil && now < attemptData.blockedUntil) {
            totalBlocked++;
          }

          // 统计总数
          totalFailures += attemptData.totalFailureCount || 0;
          totalSuccesses += attemptData.totalSuccessCount || 0;
        } catch (error) {
          console.error(`统计频率限制数据失败 ${key}:`, error);
        }
      }

      return {
        totalUsers: rateLimitKeys.length,
        totalAttempts,
        totalBlocked,
        totalFailures,
        totalSuccesses,
        successRate: totalFailures + totalSuccesses > 0 ? 
          (totalSuccesses / (totalFailures + totalSuccesses) * 100).toFixed(2) + '%' : '0%'
      };
    } catch (error) {
      console.error('获取全局统计信息失败:', error);
      return {
        error: error.message
      };
    }
  }
}

// 创建单例实例
const loginRateLimiter = new LoginRateLimiter();

export default loginRateLimiter;
export { LoginRateLimiter };