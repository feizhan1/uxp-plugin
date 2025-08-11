/**
 * Token管理器类
 * 负责Bearer Token的存储、获取和管理
 * 提供安全的Token操作接口
 */

import secureStorage from '../utils/SecureStorage.js';

class TokenManager {
  constructor() {
    this.token = null;
    this.storageKey = 'bearer_token';
    this.tokenPrefix = 'Bearer ';
  }

  /**
   * 设置Token
   * @param {string} token - Bearer Token
   * @returns {Promise<boolean>} 设置是否成功
   */
  async setToken(token) {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Token必须是非空字符串');
      }

      // 清理Token格式（移除可能的Bearer前缀）
      const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
      
      if (!cleanToken) {
        throw new Error('Token不能为空');
      }

      this.token = cleanToken;
      
      // 安全存储Token
      const success = await secureStorage.storeCredentials(this.storageKey, { 
        token: cleanToken,
        timestamp: Date.now()
      });
      
      if (success) {
        console.log('Token已成功设置和存储');
        return true;
      } else {
        throw new Error('Token存储失败');
      }
    } catch (error) {
      console.error('设置Token失败:', error.message);
      this.token = null;
      return false;
    }
  }

  /**
   * 获取Token
   * @returns {Promise<string|null>} Token字符串或null
   */
  async getToken() {
    try {
      // 如果内存中有Token，直接返回
      if (this.token) {
        return this.token;
      }

      // 从安全存储中获取Token
      const stored = await secureStorage.getCredentials(this.storageKey);
      if (stored && stored.token) {
        this.token = stored.token;
        console.log('Token已从存储中恢复');
        return this.token;
      }

      return null;
    } catch (error) {
      console.error('获取Token失败:', error);
      return null;
    }
  }

  /**
   * 获取认证头部
   * @returns {Object} 包含Authorization头部的对象
   */
  getAuthHeaders() {
    if (!this.token) {
      return {};
    }

    return {
      'Authorization': `${this.tokenPrefix}${this.token}`
    };
  }

  /**
   * 异步获取认证头部（确保Token是最新的）
   * @returns {Promise<Object>} 包含Authorization头部的对象
   */
  async getAuthHeadersAsync() {
    const token = await this.getToken();
    if (!token) {
      return {};
    }

    return {
      'Authorization': `${this.tokenPrefix}${token}`
    };
  }

  /**
   * 验证Token格式
   * @param {string} token - 要验证的Token
   * @returns {boolean} Token格式是否有效
   */
  validateToken(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // 清理Token格式
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    
    // 基本格式验证（至少10个字符，包含字母数字）
    if (cleanToken.length < 10) {
      return false;
    }

    // 检查是否包含有效字符（字母、数字、常见符号）
    const validTokenPattern = /^[A-Za-z0-9\-_\.~\+\/=]+$/;
    return validTokenPattern.test(cleanToken);
  }

  /**
   * 检查Token是否存在
   * @returns {Promise<boolean>} Token是否存在
   */
  async hasToken() {
    const token = await this.getToken();
    return token !== null;
  }

  /**
   * 清除Token
   * @returns {Promise<boolean>} 清除是否成功
   */
  async clearToken() {
    try {
      this.token = null;
      const success = await secureStorage.removeCredentials(this.storageKey);
      
      if (success) {
        console.log('Token已成功清除');
        return true;
      } else {
        throw new Error('Token清除失败');
      }
    } catch (error) {
      console.error('清除Token失败:', error);
      return false;
    }
  }

  /**
   * 刷新Token（为将来的自动刷新功能预留）
   * @param {string} newToken - 新的Token
   * @returns {Promise<boolean>} 刷新是否成功
   */
  async refreshToken(newToken) {
    console.log('正在刷新Token...');
    return await this.setToken(newToken);
  }

  /**
   * 获取Token信息
   * @returns {Promise<Object|null>} Token信息对象
   */
  async getTokenInfo() {
    try {
      const stored = await secureStorage.getCredentials(this.storageKey);
      if (!stored) {
        return null;
      }

      return {
        hasToken: !!stored.token,
        tokenLength: stored.token ? stored.token.length : 0,
        storedAt: stored.timestamp ? new Date(stored.timestamp).toISOString() : null,
        isValid: stored.token ? this.validateToken(stored.token) : false
      };
    } catch (error) {
      console.error('获取Token信息失败:', error);
      return null;
    }
  }

  /**
   * 检查Token是否即将过期（如果Token包含过期信息）
   * 注意：这是一个基础实现，实际的JWT Token解析需要更复杂的逻辑
   * @returns {Promise<boolean>} Token是否即将过期
   */
  async isTokenExpiringSoon() {
    try {
      const stored = await secureStorage.getCredentials(this.storageKey);
      if (!stored || !stored.timestamp) {
        return false;
      }

      // 如果Token存储超过1小时，认为即将过期
      const oneHour = 60 * 60 * 1000;
      const tokenAge = Date.now() - stored.timestamp;
      
      return tokenAge > oneHour;
    } catch (error) {
      console.error('检查Token过期状态失败:', error);
      return false;
    }
  }

  /**
   * 检查Token是否有效（格式和存在性）
   * @returns {Promise<boolean>} Token是否有效
   */
  async isTokenValid() {
    try {
      const token = await this.getToken();
      return token && this.validateToken(token);
    } catch (error) {
      console.error('检查Token有效性失败:', error);
      return false;
    }
  }

  /**
   * 格式化Token用于显示（隐藏敏感部分）
   * @param {string} token - 要格式化的Token
   * @returns {string} 格式化后的Token
   */
  formatTokenForDisplay(token) {
    if (!token) {
      return '未设置';
    }

    if (token.length <= 8) {
      return '***';
    }

    const start = token.substring(0, 4);
    const end = token.substring(token.length - 4);
    return `${start}...${end}`;
  }
}

export default TokenManager;