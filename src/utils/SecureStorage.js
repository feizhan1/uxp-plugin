/**
 * 安全存储工具类
 * 提供Token等敏感信息的加密存储功能
 * 适配UXP环境的存储限制，增强安全性和错误处理
 */

/**
 * 增强的加密/解密工具
 * 使用多层加密和完整性验证
 */
class EnhancedCrypto {
  constructor(key = 'uxp-plugin-secret-key') {
    this.key = key;
    this.salt = 'uxp-auth-salt-2024';
    this.version = 'v2'; // 加密版本标识
  }

  /**
   * 生成密钥派生
   * @param {string} password - 原始密钥
   * @param {string} salt - 盐值
   * @returns {string} 派生密钥
   */
  deriveKey(password, salt) {
    let derived = password + salt;
    // 简单的密钥拉伸（多次哈希）
    for (let i = 0; i < 1000; i++) {
      derived = this.simpleHash(derived);
    }
    return derived;
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
   * 生成随机IV（初始化向量）
   * @returns {string} 随机IV
   */
  generateIV() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let iv = '';
    for (let i = 0; i < 16; i++) {
      iv += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return iv;
  }

  /**
   * 计算数据完整性校验码
   * @param {string} data - 数据
   * @param {string} key - 密钥
   * @returns {string} 校验码
   */
  calculateHMAC(data, key) {
    const combined = data + key + this.salt;
    return this.simpleHash(combined);
  }

  /**
   * 增强的加密方法
   * @param {string} text - 要加密的文本
   * @returns {string} 加密后的文本（包含版本、IV和HMAC）
   */
  encrypt(text) {
    try {
      const iv = this.generateIV();
      const derivedKey = this.deriveKey(this.key, this.salt + iv);
      
      // XOR加密
      let encrypted = '';
      for (let i = 0; i < text.length; i++) {
        const keyChar = derivedKey.charCodeAt(i % derivedKey.length);
        const textChar = text.charCodeAt(i);
        encrypted += String.fromCharCode(textChar ^ keyChar);
      }
      
      // Base64编码加密数据
      const encryptedB64 = btoa(encrypted);
      
      // 计算HMAC
      const hmac = this.calculateHMAC(encryptedB64, derivedKey);
      
      // 组合版本、IV、HMAC和加密数据
      const combined = `${this.version}:${iv}:${hmac}:${encryptedB64}`;
      
      return btoa(combined); // 再次Base64编码整个结果
    } catch (error) {
      console.error('加密失败:', error);
      throw new Error('数据加密失败');
    }
  }

  /**
   * 增强的解密方法
   * @param {string} encryptedText - 加密的文本
   * @returns {string} 解密后的文本
   */
  decrypt(encryptedText) {
    try {
      // 输入验证
      if (!encryptedText || typeof encryptedText !== 'string') {
        throw new Error('加密文本无效');
      }

      // 第一层Base64解码
      let combined;
      try {
        combined = atob(encryptedText);
      } catch (base64Error) {
        throw new Error('Base64解码失败，数据可能已损坏');
      }
      
      // 解析组件
      const parts = combined.split(':');
      if (parts.length !== 4) {
        console.warn(`数据格式错误: 期望4个部分，实际${parts.length}个部分`);
        console.warn('数据内容预览:', combined.substring(0, 100) + '...');
        throw new Error('加密数据格式无效');
      }
      
      const [version, iv, hmac, encryptedB64] = parts;
      
      // 验证各部分是否为空
      if (!version || !iv || !hmac || !encryptedB64) {
        throw new Error('加密数据组件缺失');
      }
      
      // 检查版本兼容性
      if (version !== this.version) {
        console.warn(`加密版本不匹配: ${version} vs ${this.version}`);
        // 对于版本不匹配，尝试继续解密，但记录警告
        if (!this.isVersionCompatible(version)) {
          throw new Error(`不支持的加密版本: ${version}`);
        }
      }
      
      // 重新计算密钥
      const derivedKey = this.deriveKey(this.key, this.salt + iv);
      
      // 验证HMAC
      const expectedHmac = this.calculateHMAC(encryptedB64, derivedKey);
      if (hmac !== expectedHmac) {
        console.warn('HMAC验证失败，数据可能已被篡改或密钥不匹配');
        throw new Error('数据完整性验证失败');
      }
      
      // Base64解码加密数据
      let encrypted;
      try {
        encrypted = atob(encryptedB64);
      } catch (base64Error) {
        throw new Error('加密数据Base64解码失败');
      }
      
      // XOR解密
      let decrypted = '';
      try {
        for (let i = 0; i < encrypted.length; i++) {
          const keyChar = derivedKey.charCodeAt(i % derivedKey.length);
          const encryptedChar = encrypted.charCodeAt(i);
          decrypted += String.fromCharCode(encryptedChar ^ keyChar);
        }
      } catch (xorError) {
        throw new Error('XOR解密失败');
      }
      
      // 验证解密结果是否为有效的JSON格式
      try {
        JSON.parse(decrypted);
      } catch (jsonError) {
        console.warn('解密结果不是有效的JSON格式');
        throw new Error('解密结果格式无效');
      }
      
      return decrypted;
    } catch (error) {
      console.error('解密失败:', {
        error: error.message,
        inputLength: encryptedText ? encryptedText.length : 0,
        inputPreview: encryptedText ? encryptedText.substring(0, 50) + '...' : 'null'
      });
      return null;
    }
  }

  /**
   * 检查版本兼容性
   * @param {string} version - 要检查的版本
   * @returns {boolean} 是否兼容
   */
  isVersionCompatible(version) {
    const supportedVersions = ['v1', 'v2'];
    return supportedVersions.includes(version);
  }

  /**
   * 安全清理内存中的敏感数据
   * @param {string} data - 要清理的数据
   */
  secureWipe(data) {
    if (typeof data === 'string') {
      // JavaScript中无法直接清理内存，但可以覆盖变量
      data = null;
    }
  }
}

/**
 * 增强的安全存储类
 * 提供用户凭据的安全存储、完整性验证和错误处理
 */
class SecureStorage {
  constructor() {
    this.crypto = new EnhancedCrypto();
    this.storagePrefix = 'uxp_secure_';
    this.maxStorageSize = 5 * 1024 * 1024; // 5MB存储限制
    this.compressionThreshold = 1024; // 1KB以上数据考虑压缩
    
    // 存储访问统计
    this.accessStats = {
      reads: 0,
      writes: 0,
      errors: 0,
      lastAccess: null
    };
    
    // 初始化时检查存储健康状态
    this.checkStorageHealth();
  }

  /**
   * 安全存储凭据（增强版）
   * @param {string} key - 存储键
   * @param {Object} credentials - 凭据对象
   * @returns {Promise<boolean>} 存储是否成功
   */
  async storeCredentials(key, credentials) {
    try {
      // 输入验证
      if (!key || typeof key !== 'string') {
        throw new Error('存储键必须是非空字符串');
      }
      
      if (!credentials || typeof credentials !== 'object') {
        throw new Error('凭据必须是有效对象');
      }
      
      // 检查存储空间
      await this.checkStorageQuota();
      
      // 准备存储数据
      const storageData = {
        data: credentials,
        timestamp: Date.now(),
        version: '2.0',
        checksum: this.calculateChecksum(credentials)
      };
      
      const dataString = JSON.stringify(storageData);
      
      // 检查数据大小（调整为更合理的限制）
      if (dataString.length > 1024 * 1024) { // 1MB限制
        throw new Error('数据大小超过存储限制');
      }
      
      // 加密数据
      const encrypted = this.crypto.encrypt(dataString);
      const storageKey = this.storagePrefix + key;
      
      // 存储到localStorage
      localStorage.setItem(storageKey, encrypted);
      
      // 更新统计信息
      this.accessStats.writes++;
      this.accessStats.lastAccess = Date.now();
      
      console.log(`凭据已安全存储: ${key}`, {
        size: dataString.length,
        timestamp: storageData.timestamp
      });
      
      return true;
    } catch (error) {
      this.accessStats.errors++;
      console.error('存储凭据失败:', error);
      
      // 抛出更具体的错误
      if (error.name === 'QuotaExceededError') {
        throw new Error('存储空间不足，请清理其他数据');
      } else if (error.message.includes('存储键')) {
        throw new Error('存储键格式无效');
      } else if (error.message.includes('凭据')) {
        throw new Error('凭据数据格式无效');
      } else {
        throw new Error(`凭据存储失败: ${error.message}`);
      }
    }
  }

  /**
   * 获取存储的凭据（增强版）
   * @param {string} key - 存储键
   * @returns {Promise<Object|null>} 凭据对象或null
   */
  async getCredentials(key) {
    try {
      // 输入验证
      if (!key || typeof key !== 'string') {
        throw new Error('存储键必须是非空字符串');
      }
      
      const storageKey = this.storagePrefix + key;
      const encrypted = localStorage.getItem(storageKey);
      
      if (!encrypted) {
        console.log(`未找到存储的凭据: ${key}`);
        return null;
      }
      
      // 解密数据
      const decrypted = this.crypto.decrypt(encrypted);
      if (!decrypted) {
        console.warn('解密凭据失败，可能数据已损坏或密钥不匹配');
        // 清理损坏的数据
        await this.removeCredentials(key);
        throw new Error('凭据数据已损坏，已自动清理');
      }
      
      // 解析存储数据
      const storageData = JSON.parse(decrypted);
      
      // 验证数据结构
      if (!storageData.data || !storageData.timestamp || !storageData.version) {
        console.warn('凭据数据结构无效');
        await this.removeCredentials(key);
        throw new Error('凭据数据结构无效，已自动清理');
      }
      
      // 验证数据完整性
      const expectedChecksum = this.calculateChecksum(storageData.data);
      if (storageData.checksum && storageData.checksum !== expectedChecksum) {
        console.warn('凭据数据完整性验证失败');
        await this.removeCredentials(key);
        throw new Error('凭据数据完整性验证失败，已自动清理');
      }
      
      // 检查数据是否过期（可选，根据业务需求）
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
      if (Date.now() - storageData.timestamp > maxAge) {
        console.warn('凭据数据已过期');
        await this.removeCredentials(key);
        return null;
      }
      
      // 更新统计信息
      this.accessStats.reads++;
      this.accessStats.lastAccess = Date.now();
      
      console.log(`凭据已成功获取: ${key}`, {
        timestamp: storageData.timestamp,
        version: storageData.version
      });
      
      return storageData.data;
    } catch (error) {
      this.accessStats.errors++;
      console.error('获取凭据失败:', error);
      
      // 对于某些错误，返回null而不是抛出异常
      if (error.message.includes('已损坏') || error.message.includes('无效')) {
        return null;
      }
      
      throw error;
    }
  }

  /**
   * 删除存储的凭据（增强版）
   * @param {string} key - 存储键
   * @returns {Promise<boolean>} 删除是否成功
   */
  async removeCredentials(key) {
    try {
      // 输入验证
      if (!key || typeof key !== 'string') {
        throw new Error('存储键必须是非空字符串');
      }
      
      const storageKey = this.storagePrefix + key;
      
      // 检查是否存在
      const exists = localStorage.getItem(storageKey) !== null;
      
      // 安全删除
      localStorage.removeItem(storageKey);
      
      // 验证删除是否成功
      const stillExists = localStorage.getItem(storageKey) !== null;
      if (stillExists) {
        throw new Error('删除操作未成功完成');
      }
      
      console.log(`凭据已安全删除: ${key}`, { existed: exists });
      return true;
    } catch (error) {
      this.accessStats.errors++;
      console.error('删除凭据失败:', error);
      throw new Error(`凭据删除失败: ${error.message}`);
    }
  }

  /**
   * 检查凭据是否存在（增强版）
   * @param {string} key - 存储键
   * @returns {Promise<boolean>} 凭据是否存在且有效
   */
  async hasCredentials(key) {
    try {
      if (!key || typeof key !== 'string') {
        return false;
      }
      
      const storageKey = this.storagePrefix + key;
      const encrypted = localStorage.getItem(storageKey);
      
      if (!encrypted) {
        return false;
      }
      
      // 尝试解密以验证数据有效性
      const decrypted = this.crypto.decrypt(encrypted);
      if (!decrypted) {
        // 数据损坏，自动清理
        await this.removeCredentials(key);
        return false;
      }
      
      // 验证数据结构
      try {
        const storageData = JSON.parse(decrypted);
        return !!(storageData.data && storageData.timestamp);
      } catch (parseError) {
        // 数据格式无效，自动清理
        await this.removeCredentials(key);
        return false;
      }
    } catch (error) {
      console.error('检查凭据存在性失败:', error);
      return false;
    }
  }

  /**
   * 清除所有安全存储的数据（增强版）
   * @returns {Promise<Object>} 清除结果详情
   */
  async clearAll() {
    const result = {
      success: false,
      clearedCount: 0,
      errors: [],
      totalSize: 0
    };
    
    try {
      const keys = Object.keys(localStorage);
      const secureKeys = keys.filter(key => key.startsWith(this.storagePrefix));
      
      console.log(`准备清除 ${secureKeys.length} 个安全存储项`);
      
      for (const key of secureKeys) {
        try {
          // 计算数据大小
          const data = localStorage.getItem(key);
          if (data) {
            result.totalSize += data.length;
          }
          
          // 安全删除
          localStorage.removeItem(key);
          
          // 验证删除
          if (localStorage.getItem(key) === null) {
            result.clearedCount++;
          } else {
            result.errors.push(`删除失败: ${key}`);
          }
        } catch (error) {
          result.errors.push(`删除 ${key} 时出错: ${error.message}`);
        }
      }
      
      result.success = result.errors.length === 0;
      
      console.log('安全存储清除完成:', result);
      return result;
    } catch (error) {
      console.error('清除安全存储失败:', error);
      result.errors.push(`清除过程出错: ${error.message}`);
      return result;
    }
  }

  /**
   * 计算数据校验和
   * @param {Object} data - 数据对象
   * @returns {string} 校验和
   */
  calculateChecksum(data) {
    try {
      const dataString = JSON.stringify(data);
      return this.crypto.simpleHash(dataString);
    } catch (error) {
      console.error('计算校验和失败:', error);
      return '';
    }
  }

  /**
   * 检查存储配额
   * @returns {Promise<Object>} 配额信息
   */
  async checkStorageQuota() {
    try {
      // 估算当前使用的存储空间
      let usedSpace = 0;
      const keys = Object.keys(localStorage);
      
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value) {
          usedSpace += key.length + value.length;
        }
      }
      
      const quotaInfo = {
        used: usedSpace,
        available: this.maxStorageSize - usedSpace,
        percentage: (usedSpace / this.maxStorageSize) * 100
      };
      
      // 如果使用超过90%，发出警告
      if (quotaInfo.percentage > 90) {
        console.warn('存储空间使用率过高:', quotaInfo);
      }
      
      // 如果空间不足，抛出错误
      if (quotaInfo.available < 1024) { // 少于1KB可用空间
        throw new Error('存储空间不足');
      }
      
      return quotaInfo;
    } catch (error) {
      console.error('检查存储配额失败:', error);
      throw error;
    }
  }

  /**
   * 检查存储健康状态
   * @returns {Promise<Object>} 健康状态报告
   */
  async checkStorageHealth() {
    const healthReport = {
      healthy: true,
      issues: [],
      stats: { ...this.accessStats },
      quota: null,
      corruptedKeys: []
    };
    
    try {
      // 检查存储配额
      healthReport.quota = await this.checkStorageQuota();
      
      // 检查是否可以正常读写
      const testKey = 'health_check_test';
      const testData = { test: true, timestamp: Date.now() };
      
      await this.storeCredentials(testKey, testData);
      const retrieved = await this.getCredentials(testKey);
      await this.removeCredentials(testKey);
      
      if (!retrieved || retrieved.test !== true) {
        healthReport.healthy = false;
        healthReport.issues.push('存储读写测试失败');
      }
      
      // 检查损坏的数据（增强错误处理）
      const keys = Object.keys(localStorage);
      const secureKeys = keys.filter(key => key.startsWith(this.storagePrefix));
      
      console.log(`检查 ${secureKeys.length} 个安全存储项的健康状态`);
      
      for (const key of secureKeys) {
        try {
          const encrypted = localStorage.getItem(key);
          if (encrypted) {
            // 尝试解密数据
            const decrypted = this.crypto.decrypt(encrypted);
            if (!decrypted) {
              console.warn(`发现损坏的数据项: ${key}`);
              healthReport.issues.push(`损坏的数据: ${key}`);
              healthReport.corruptedKeys.push(key);
            } else {
              // 尝试解析JSON以进一步验证数据完整性
              try {
                const parsedData = JSON.parse(decrypted);
                if (!parsedData.data || !parsedData.timestamp) {
                  console.warn(`数据结构无效: ${key}`);
                  healthReport.issues.push(`数据结构无效: ${key}`);
                  healthReport.corruptedKeys.push(key);
                }
              } catch (parseError) {
                console.warn(`JSON解析失败: ${key}`, parseError);
                healthReport.issues.push(`JSON解析失败: ${key}`);
                healthReport.corruptedKeys.push(key);
              }
            }
          }
        } catch (error) {
          console.warn(`检查存储项 ${key} 时出错:`, error);
          healthReport.issues.push(`检查 ${key} 时出错: ${error.message}`);
          healthReport.corruptedKeys.push(key);
        }
      }
      
      // 自动清理损坏的数据
      if (healthReport.corruptedKeys.length > 0) {
        console.log(`准备清理 ${healthReport.corruptedKeys.length} 个损坏的数据项`);
        const cleanupResults = await this.cleanupCorruptedData(healthReport.corruptedKeys);
        healthReport.cleanupResults = cleanupResults;
        
        if (cleanupResults.success) {
          console.log('损坏数据清理完成');
          healthReport.issues.push(`已自动清理 ${cleanupResults.cleanedCount} 个损坏的数据项`);
        } else {
          healthReport.healthy = false;
          healthReport.issues.push('部分损坏数据清理失败');
        }
      }
      
      if (healthReport.issues.length > 0 && healthReport.corruptedKeys.length === 0) {
        healthReport.healthy = false;
      }
      
      console.log('存储健康检查完成:', {
        healthy: healthReport.healthy,
        issueCount: healthReport.issues.length,
        corruptedCount: healthReport.corruptedKeys.length
      });
      
      return healthReport;
    } catch (error) {
      console.error('存储健康检查失败:', error);
      healthReport.healthy = false;
      healthReport.issues.push(`健康检查失败: ${error.message}`);
      return healthReport;
    }
  }

  /**
   * 获取存储统计信息
   * @returns {Object} 统计信息
   */
  getStorageStats() {
    return {
      ...this.accessStats,
      uptime: Date.now() - (this.accessStats.lastAccess || Date.now())
    };
  }

  /**
   * 重置存储统计信息
   */
  resetStats() {
    this.accessStats = {
      reads: 0,
      writes: 0,
      errors: 0,
      lastAccess: Date.now()
    };
  }

  /**
   * 清理损坏的数据项
   * @param {Array<string>} corruptedKeys - 损坏的存储键列表
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupCorruptedData(corruptedKeys) {
    const result = {
      success: false,
      cleanedCount: 0,
      failedKeys: [],
      errors: []
    };

    try {
      console.log(`开始清理 ${corruptedKeys.length} 个损坏的数据项`);

      for (const key of corruptedKeys) {
        try {
          // 直接从localStorage删除损坏的数据
          localStorage.removeItem(key);
          
          // 验证删除是否成功
          if (localStorage.getItem(key) === null) {
            result.cleanedCount++;
            console.log(`已清理损坏数据: ${key}`);
          } else {
            result.failedKeys.push(key);
            result.errors.push(`删除失败: ${key}`);
          }
        } catch (error) {
          console.error(`清理 ${key} 时出错:`, error);
          result.failedKeys.push(key);
          result.errors.push(`清理 ${key} 时出错: ${error.message}`);
        }
      }

      result.success = result.failedKeys.length === 0;
      
      console.log('损坏数据清理完成:', {
        total: corruptedKeys.length,
        cleaned: result.cleanedCount,
        failed: result.failedKeys.length
      });

      return result;
    } catch (error) {
      console.error('清理损坏数据失败:', error);
      result.errors.push(`清理过程出错: ${error.message}`);
      return result;
    }
  }

  /**
   * 修复存储数据（尝试数据恢复）
   * @param {string} key - 存储键
   * @returns {Promise<boolean>} 修复是否成功
   */
  async repairStorageData(key) {
    try {
      const storageKey = this.storagePrefix + key;
      const encrypted = localStorage.getItem(storageKey);
      
      if (!encrypted) {
        console.log(`存储项不存在: ${key}`);
        return false;
      }

      // 尝试不同的解密方法
      console.log(`尝试修复存储数据: ${key}`);

      // 方法1: 直接解密（当前版本）
      try {
        const decrypted = this.crypto.decrypt(encrypted);
        if (decrypted) {
          const parsedData = JSON.parse(decrypted);
          if (parsedData.data && parsedData.timestamp) {
            console.log(`数据修复成功（方法1）: ${key}`);
            return true;
          }
        }
      } catch (error) {
        console.log(`方法1修复失败: ${error.message}`);
      }

      // 方法2: 尝试旧版本解密（如果有的话）
      try {
        // 这里可以添加对旧版本加密格式的支持
        console.log(`尝试旧版本解密: ${key}`);
        // 暂时跳过，因为当前只有一个版本
      } catch (error) {
        console.log(`方法2修复失败: ${error.message}`);
      }

      // 方法3: 尝试直接Base64解码
      try {
        const decoded = atob(encrypted);
        console.log(`Base64解码成功，但数据可能仍然损坏: ${key}`);
      } catch (error) {
        console.log(`Base64解码失败: ${error.message}`);
      }

      console.log(`数据修复失败，建议删除: ${key}`);
      return false;
    } catch (error) {
      console.error(`修复存储数据时出错: ${key}`, error);
      return false;
    }
  }
}

// 创建单例实例
const secureStorage = new SecureStorage();

export default secureStorage;
export { SecureStorage };