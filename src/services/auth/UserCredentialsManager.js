/**
 * 用户凭据管理器
 * 负责安全存储和管理用户登录凭据
 */
class UserCredentialsManager {
  constructor(secureStorage) {
    this.secureStorage = secureStorage;
    this.storageKey = 'user_credentials';
  }
  
  /**
   * 存储用户凭据
   * @param {Object} credentials - 用户凭据对象
   * @param {string} credentials.username - 用户名
   * @param {string} credentials.accessToken - 访问令牌
   * @param {string} credentials.refreshToken - 刷新令牌
   * @param {Object} credentials.user - 用户信息
   * @param {number} credentials.expiresIn - 过期时间（秒）
   * @param {boolean} credentials.rememberMe - 是否记住登录状态
   * @param {number} credentials.loginTime - 登录时间戳
   * @returns {Promise<boolean>} 存储是否成功
   */
  async storeCredentials(credentials) {
    try {
      const credentialsToStore = {
        username: credentials.username,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        user: credentials.user,
        expiresIn: credentials.expiresIn,
        rememberMe: credentials.rememberMe,
        loginTime: credentials.loginTime || Date.now()
      };
      
      const success = await this.secureStorage.storeCredentials(
        this.storageKey, 
        credentialsToStore
      );
      
      if (success) {
        console.log('用户凭据已安全存储');
        return true;
      } else {
        throw new Error('凭据存储失败');
      }
    } catch (error) {
      console.error('存储用户凭据失败:', error);
      return false;
    }
  }
  
  /**
   * 获取存储的用户凭据
   * @returns {Promise<Object|null>} 用户凭据对象或null
   */
  async getCredentials() {
    try {
      const credentials = await this.secureStorage.getCredentials(this.storageKey);
      if (credentials) {
        console.log('用户凭据已成功获取');
      }
      return credentials;
    } catch (error) {
      console.error('获取用户凭据失败:', error);
      return null;
    }
  }
  
  /**
   * 清除存储的用户凭据
   * @returns {Promise<boolean>} 清除是否成功
   */
  async clearCredentials() {
    try {
      const success = await this.secureStorage.removeCredentials(this.storageKey);
      if (success) {
        console.log('用户凭据已清除');
        return true;
      } else {
        throw new Error('凭据清除失败');
      }
    } catch (error) {
      console.error('清除用户凭据失败:', error);
      return false;
    }
  }
  
  /**
   * 检查是否存在存储的凭据
   * @returns {Promise<boolean>} 是否存在凭据
   */
  async hasCredentials() {
    return this.secureStorage.hasCredentials(this.storageKey);
  }
  
  /**
   * 获取存储的用户名
   * @returns {Promise<string|null>} 用户名或null
   */
  async getStoredUsername() {
    try {
      const credentials = await this.getCredentials();
      return credentials?.username || null;
    } catch (error) {
      console.error('获取存储的用户名失败:', error);
      return null;
    }
  }
}

export default UserCredentialsManager;