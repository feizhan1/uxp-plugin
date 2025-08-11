import SessionManager from './SessionManager.js';
import AuthenticatedHttpClient from '../AuthenticatedHttpClient.js';
import { AuthErrorFactory, AuthErrorHandler } from '../../utils/AuthErrors.js';
import MemoryProtection from '../../utils/MemoryProtection.js';

/**
 * 身份验证服务
 * 提供登录、登出和Token验证的核心功能
 */
class AuthService {
  constructor(httpClient, credentialsManager) {
    // 如果传入的不是AuthenticatedHttpClient，则包装它
    if (httpClient instanceof AuthenticatedHttpClient) {
      this.httpClient = httpClient;
    } else {
      console.log('包装HttpClient为AuthenticatedHttpClient');
      this.httpClient = new AuthenticatedHttpClient({
        baseURL: httpClient.baseURL,
        timeout: httpClient.timeout,
        headers: httpClient.headers,
        tokenManager: httpClient.tokenManager
      });
    }
    
    this.credentialsManager = credentialsManager;
    this.sessionManager = new SessionManager();
    
    // 建立双向绑定
    this.httpClient.setAuthService(this);
    
    // API端点配置
    this.loginEndpoint = '/auth/login?apifoxToken=HU51ZPYgwuKgCuPk_gK9S';
    this.logoutEndpoint = '/auth/logout';
    this.verifyEndpoint = '/auth/verify';
    
    // Token过期检测定时器
    this.expirationCheckTimer = null;
    this.expirationCheckInterval = 60000; // 每分钟检查一次
    
    // 初始化自动过期检测
    this.startExpirationCheck();
  }
  
  /**
   * 用户登录（增强安全版）
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<Object>} 登录结果对象
   */
  async login(username, password) {
    const identifier = username?.trim() || 'unknown';
    
    try {
      // 输入验证
      if (!username || !username.trim()) {
        throw AuthErrorFactory.fromValidation('username', username, 'required');
      }
      
      if (!password || !password.trim()) {
        throw AuthErrorFactory.fromValidation('password', password, 'required');
      }
      
      console.log('开始用户登录流程:', { 
        username: identifier
      });
      
      // 创建安全的密码包装器
      const securePassword = MemoryProtection.securePassword(password);
      
      try {
        // 发送登录请求
        const response = await this.httpClient.post(this.loginEndpoint, {
          username: identifier,
          password: securePassword.getValue()
        });
        
        console.log(response, '---response')
        const { token, username, password } = response.data.data;
        
        // 验证响应数据
        if (!token) {
          throw AuthErrorFactory.fromHttpStatus(422, '服务器响应缺少访问令牌', {
            field: 'accessToken'
          });
        }
        
        if (!username) {
          throw AuthErrorFactory.fromHttpStatus(422, '服务器响应缺少用户信息', {
            field: 'user'
          });
        }
        
        // 创建安全的Token包装器
        const secureToken = MemoryProtection.secureToken(token);
        
        // 定义过期时间（30天）
        const expiresIn = 1000 * 60 * 60 * 24 * 30;
        
        // 存储认证信息
        const storeSuccess = await this.credentialsManager.storeCredentials({
          username: username,
          token: secureToken.getValue(),
          expiresIn: expiresIn,
          loginTime: Date.now()
        });
        
        if (!storeSuccess) {
          console.warn('凭据存储失败，但继续登录流程');
        }
        
        // 设置HTTP客户端的Token
        const tokenSetSuccess = await this.httpClient.setToken(secureToken.getValue());
        if (!tokenSetSuccess) {
          console.warn('HTTP客户端Token设置失败');
        }
        
        // 初始化会话
        this.sessionManager.startSession(username, expiresIn);
        
        // 登录成功，无需记录尝试
        
        console.log('用户登录成功:', { 
          username,
          expiresIn 
        });
        
        return {
          success: true,
          username,
          token: secureToken.getValue(),
          expiresIn,
          message: '登录成功'
        };
        
      } finally {
        // 确保密码被安全清理
        securePassword.clear();
      }
      
    } catch (error) {
      console.error('登录失败:', error);
      
      // 登录失败，无需记录尝试
      
      // 使用增强的错误处理
      const authError = this.handleLoginError(error);
      AuthErrorHandler.log(authError, {
        operation: 'login',
        username: identifier,
        timestamp: Date.now()
      });
      
      throw authError;
    }
  }
  
  /**
   * 用户登出
   * @returns {Promise<Object>} 登出结果对象
   */
  async logout() {
    console.log('开始用户登出流程');
    
    const currentUser = this.getCurrentUser();
    let serverLogoutSuccess = false;
    
    try {
      // 尝试向服务器发送登出请求
      if (await this.httpClient.hasToken()) {
        try {
          await this.httpClient.post(this.logoutEndpoint);
          serverLogoutSuccess = true;
          console.log('服务器登出请求成功');
        } catch (error) {
          console.warn('服务器登出请求失败，继续本地清理:', {
            status: error.status,
            message: error.message
          });
          
          // 如果是网络错误或服务器错误，不影响本地清理
          if (error.status !== 401 && error.name !== 'NetworkError') {
            console.error('服务器登出时发生意外错误:', error);
          }
        }
      } else {
        console.log('没有Token，跳过服务器登出请求');
      }
      
      // 执行本地清理（无论服务器请求是否成功）
      const cleanupResults = await this.performLocalCleanup();
      
      console.log('用户已成功登出:', {
        user: currentUser?.username,
        serverLogout: serverLogoutSuccess,
        localCleanup: cleanupResults
      });
      
      return { 
        success: true, 
        message: '已成功登出',
        serverLogout: serverLogoutSuccess,
        localCleanup: cleanupResults
      };
      
    } catch (error) {
      console.error('登出过程中发生严重错误:', error);
      
      // 即使发生错误，也尝试执行本地清理
      try {
        await this.performLocalCleanup();
        console.log('紧急本地清理完成');
      } catch (cleanupError) {
        console.error('紧急本地清理也失败:', cleanupError);
      }
      
      throw this.createAuthError('登出失败，请稍后重试', 'LOGOUT_ERROR');
    }
  }
  
  /**
   * 验证访问令牌
   * @returns {Promise<Object>} 验证结果对象
   */
  async verifyToken() {
    try {
      console.log('开始Token验证流程');
      
      // 获取存储的凭据
      const credentials = await this.credentialsManager.getCredentials();
      if (!credentials || !credentials.accessToken) {
        console.log('没有找到存储的Token');
        return { valid: false, reason: 'no_token', message: '未找到访问令牌' };
      }
      
      // 检查Token是否在本地已过期
      if (this.isTokenExpired(credentials)) {
        console.log('Token已在本地过期');
        return { 
          valid: false, 
          reason: 'expired', 
          message: '访问令牌已过期',
          expiredAt: credentials.loginTime + (credentials.expiresIn * 1000)
        };
      }
      
      // 确保HTTP客户端有Token
      const hasToken = await this.httpClient.hasToken();
      if (!hasToken) {
        console.log('HTTP客户端没有Token，重新设置');
        await this.httpClient.setToken(credentials.accessToken);
      }
      
      // 向服务器验证Token
      console.log('向服务器验证Token');
      const response = await this.httpClient.get(this.verifyEndpoint);
      
      const { user, expiresIn } = response.data;
      
      // 验证响应数据
      if (!user) {
        console.warn('服务器验证响应缺少用户信息');
        return { 
          valid: false, 
          reason: 'invalid_response', 
          message: '服务器响应无效' 
        };
      }
      
      console.log('Token验证成功:', { 
        userId: user.id, 
        username: user.username,
        expiresIn 
      });
      
      return {
        valid: true,
        user,
        expiresIn,
        credentials,
        message: 'Token验证成功'
      };
      
    } catch (error) {
      console.error('Token验证失败:', error);
      
      // 处理不同类型的验证错误
      return this.handleTokenVerificationError(error);
    }
  }
  
  /**
   * 恢复用户会话
   * @returns {Promise<Object>} 恢复结果对象
   */
  async restoreSession() {
    try {
      const credentials = await this.credentialsManager.getCredentials();
      if (!credentials) {
        return { restored: false, reason: 'no_credentials' };
      }
      
      // 验证存储的Token
      const verification = await this.verifyToken();
      if (!verification.valid) {
        // 只有在Token确实无效时才清除凭据，网络错误时保留凭据
        if (verification.reason === 'invalid_token' || verification.reason === 'expired' || verification.reason === 'access_denied') {
          await this.credentialsManager.clearCredentials();
        }
        return { restored: false, reason: verification.reason };
      }
      
      // 恢复HTTP客户端的Token
      await this.httpClient.setToken(credentials.accessToken);
      
      // 恢复会话
      this.sessionManager.restoreSession(verification.user, verification.expiresIn);
      
      console.log('会话已成功恢复:', verification.user);
      
      return {
        restored: true,
        user: verification.user,
        credentials
      };
      
    } catch (error) {
      console.error('会话恢复失败:', error);
      return { restored: false, reason: 'restore_error' };
    }
  }
  
  /**
   * 检查Token是否过期
   * @param {Object} credentials - 凭据对象
   * @returns {boolean} 是否过期
   */
  isTokenExpired(credentials) {
    if (!credentials.expiresIn || !credentials.loginTime) {
      return false; // 无法确定过期时间，假设未过期
    }
    
    const expirationTime = credentials.loginTime + (credentials.expiresIn * 1000);
    return Date.now() >= expirationTime;
  }
  
  /**
   * 获取当前用户信息
   * @returns {Object|null} 当前用户对象或null
   */
  getCurrentUser() {
    return this.sessionManager.getCurrentUser();
  }
  
  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    return this.sessionManager.isActive();
  }
  
  /**
   * 获取会话管理器实例
   * @returns {SessionManager} 会话管理器实例
   */
  getSessionManager() {
    return this.sessionManager;
  }
  
  /**
   * 处理认证要求（当需要重新认证时调用）
   */
  handleAuthenticationRequired() {
    console.log('检测到需要重新认证');
    this.sessionManager.endSession();
    // 这里可以触发重新登录的UI流程
    // 具体实现将在UI组件中处理
  }
  
  /**
   * 执行本地清理操作
   * @returns {Promise<Object>} 清理结果
   */
  async performLocalCleanup() {
    const results = {
      credentialsCleared: false,
      tokenCleared: false,
      sessionEnded: false
    };
    
    try {
      // 清除本地存储的认证信息
      results.credentialsCleared = await this.credentialsManager.clearCredentials();
      console.log('凭据清理结果:', results.credentialsCleared);
    } catch (error) {
      console.error('清除凭据失败:', error);
    }
    
    try {
      // 清除HTTP客户端的Token
      results.tokenCleared = await this.httpClient.clearToken();
      console.log('Token清理结果:', results.tokenCleared);
    } catch (error) {
      console.error('清除Token失败:', error);
    }
    
    try {
      // 结束会话
      this.sessionManager.endSession();
      results.sessionEnded = true;
      console.log('会话已结束');
    } catch (error) {
      console.error('结束会话失败:', error);
    }
    
    return results;
  }
  
  /**
   * 处理登录错误（增强版）
   * @param {Error} error - 原始错误
   * @returns {Error} 处理后的错误
   */
  handleLoginError(error) {
    // 如果已经是AuthError，直接返回
    if (error.name && error.name.includes('Error') && error.code) {
      return error;
    }
    
    // 使用错误工厂创建适当的错误类型
    if (error.code === 'RATE_LIMITED') {
      return AuthErrorFactory.fromHttpStatus(429, error.message, {
        retryAfter: error.retryAfter || 60
      });
    } else if (error.status) {
      return AuthErrorFactory.fromHttpStatus(error.status, error.message, {
        originalError: error,
        headers: error.headers
      });
    } else if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return AuthErrorFactory.fromNetworkError(error, {
        operation: 'login'
      });
    } else if (error.name === 'ValidationError') {
      return error; // 已经是正确的验证错误
    } else {
      // 未知错误
      console.error('未知登录错误:', error);
      return AuthErrorFactory.fromHttpStatus(500, '登录失败，请稍后重试', {
        originalError: error,
        code: 'UNKNOWN_ERROR'
      });
    }
  }
  
  /**
   * 处理Token验证错误
   * @param {Error} error - 原始错误
   * @returns {Object} 验证结果对象
   */
  handleTokenVerificationError(error) {
    if (error.status === 401) {
      return { 
        valid: false, 
        reason: 'invalid_token', 
        message: '访问令牌无效或已过期' 
      };
    } else if (error.status === 403) {
      return { 
        valid: false, 
        reason: 'access_denied', 
        message: '访问被拒绝，权限不足' 
      };
    } else if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return { 
        valid: false, 
        reason: 'network_error', 
        message: '网络连接失败，无法验证Token' 
      };
    } else if (error.status >= 500) {
      return { 
        valid: false, 
        reason: 'server_error', 
        message: '服务器错误，无法验证Token' 
      };
    } else {
      return { 
        valid: false, 
        reason: 'verification_error', 
        message: 'Token验证失败',
        error: error.message 
      };
    }
  }
  
  /**
   * 启动Token过期检测
   */
  startExpirationCheck() {
    // 清除现有定时器
    this.stopExpirationCheck();
    
    this.expirationCheckTimer = setInterval(async () => {
      try {
        await this.checkTokenExpiration();
      } catch (error) {
        console.error('Token过期检测失败:', error);
      }
    }, this.expirationCheckInterval);
    
    console.log('Token过期检测已启动');
  }
  
  /**
   * 停止Token过期检测
   */
  stopExpirationCheck() {
    if (this.expirationCheckTimer) {
      clearInterval(this.expirationCheckTimer);
      this.expirationCheckTimer = null;
      console.log('Token过期检测已停止');
    }
  }
  
  /**
   * 检查Token是否过期并自动清理
   */
  async checkTokenExpiration() {
    // 如果没有活跃会话，跳过检查
    if (!this.sessionManager.isActive()) {
      return;
    }
    
    try {
      const credentials = await this.credentialsManager.getCredentials();
      if (!credentials) {
        console.log('没有找到凭据，结束会话');
        this.sessionManager.endSession();
        return;
      }
      
      // 检查Token是否在本地已过期
      if (this.isTokenExpired(credentials)) {
        console.log('检测到Token已过期，自动清理会话');
        await this.performLocalCleanup();
        return;
      }
      
      // 检查会话是否即将过期（提前5分钟警告）
      if (this.sessionManager.isSessionExpiringSoon(5)) {
        console.log('会话即将过期，通知监听器');
        this.sessionManager.notifySessionChange('expiring_soon', this.getCurrentUser());
      }
      
    } catch (error) {
      console.error('Token过期检测过程中发生错误:', error);
    }
  }
  
  /**
   * 设置过期检测间隔
   * @param {number} interval - 检测间隔（毫秒）
   */
  setExpirationCheckInterval(interval) {
    this.expirationCheckInterval = interval;
    
    // 如果定时器正在运行，重新启动以应用新间隔
    if (this.expirationCheckTimer) {
      this.startExpirationCheck();
    }
  }
  
  /**
   * 销毁服务实例（清理资源）
   */
  destroy() {
    console.log('销毁AuthService实例');
    this.stopExpirationCheck();
    this.sessionManager.endSession();
  }
  
  /**
   * 创建认证错误对象
   * @param {string} message - 错误消息
   * @param {string} code - 错误代码
   * @param {string} field - 相关字段（可选）
   * @param {Object} details - 额外详情（可选）
   * @returns {Error} 认证错误对象
   */
  createAuthError(message, code, field = null, details = {}) {
    const error = new Error(message);
    error.name = 'AuthError';
    error.code = code;
    error.field = field;
    error.details = details;
    error.timestamp = Date.now();
    return error;
  }
}

export default AuthService;