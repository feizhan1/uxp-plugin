import HttpClient from './HttpClient.js';

/**
 * 认证增强的HTTP客户端
 * 扩展基础HttpClient，提供完整的认证集成功能
 */
class AuthenticatedHttpClient extends HttpClient {
  constructor(config = {}) {
    super(config);
    
    // 认证相关配置
    this.maxRetryAttempts = config.maxRetryAttempts || 1;
    this.retryDelay = config.retryDelay || 1000;
    this.autoRetryOn401 = config.autoRetryOn401 !== false;
    
    // 请求拦截器队列
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    
    // 认证状态监听器
    this.authStateListeners = [];
    
    console.log('AuthenticatedHttpClient已初始化');
  }

  /**
   * 发送请求（带认证重试机制）
   * @param {string} method - HTTP方法
   * @param {string} endpoint - API端点
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async request(method, endpoint, data = null, options = {}) {
    const {
      skipAuth = false,
      maxRetries = this.maxRetryAttempts,
      retryDelay = this.retryDelay,
      ...requestOptions
    } = options;

    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // 执行请求拦截器
        const interceptedOptions = await this.executeRequestInterceptors({
          method,
          endpoint,
          data,
          options: requestOptions,
          skipAuth,
          attempt
        });

        // 发送请求
        const response = await super.request(
          method,
          endpoint,
          data,
          interceptedOptions
        );

        // 执行响应拦截器
        const interceptedResponse = await this.executeResponseInterceptors(response, {
          method,
          endpoint,
          data,
          attempt
        });

        // 请求成功，重置重试计数
        if (attempt > 0) {
          console.log(`请求在第${attempt + 1}次尝试后成功: ${method} ${endpoint}`);
        }

        return interceptedResponse;

      } catch (error) {
        lastError = error;
        attempt++;

        // 如果是401错误且启用自动重试
        if (error.status === 401 && this.autoRetryOn401 && !skipAuth && attempt <= maxRetries) {
          console.log(`401错误，准备第${attempt}次重试: ${method} ${endpoint}`);
          
          // 处理认证错误
          await this.handleAuthError(error);
          
          // 通知认证状态监听器
          this.notifyAuthStateChange('auth_required', error);
          
          // 等待一段时间后重试
          if (attempt <= maxRetries) {
            await this.delay(retryDelay);
            continue;
          }
        }

        // 其他错误或重试次数用完，直接抛出
        break;
      }
    }

    // 所有重试都失败了
    if (attempt > 1) {
      console.error(`请求在${attempt}次尝试后仍然失败: ${method} ${endpoint}`, lastError);
    }

    throw lastError;
  }

  /**
   * 添加请求拦截器
   * @param {Function} interceptor - 拦截器函数
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
    console.log('已添加请求拦截器');
  }

  /**
   * 添加响应拦截器
   * @param {Function} interceptor - 拦截器函数
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
    console.log('已添加响应拦截器');
  }

  /**
   * 执行请求拦截器
   * @param {Object} requestConfig - 请求配置
   * @returns {Promise<Object>} 处理后的请求配置
   */
  async executeRequestInterceptors(requestConfig) {
    let config = { ...requestConfig };

    for (const interceptor of this.requestInterceptors) {
      try {
        config = await interceptor(config) || config;
      } catch (error) {
        console.error('请求拦截器执行失败:', error);
      }
    }

    return config.options || {};
  }

  /**
   * 执行响应拦截器
   * @param {Object} response - 响应对象
   * @param {Object} requestInfo - 请求信息
   * @returns {Promise<Object>} 处理后的响应
   */
  async executeResponseInterceptors(response, requestInfo) {
    let processedResponse = response;

    for (const interceptor of this.responseInterceptors) {
      try {
        processedResponse = await interceptor(processedResponse, requestInfo) || processedResponse;
      } catch (error) {
        console.error('响应拦截器执行失败:', error);
      }
    }

    return processedResponse;
  }

  /**
   * 添加认证状态监听器
   * @param {Function} listener - 监听器函数
   */
  addAuthStateListener(listener) {
    this.authStateListeners.push(listener);
  }

  /**
   * 移除认证状态监听器
   * @param {Function} listener - 监听器函数
   */
  removeAuthStateListener(listener) {
    const index = this.authStateListeners.indexOf(listener);
    if (index > -1) {
      this.authStateListeners.splice(index, 1);
    }
  }

  /**
   * 通知认证状态变化
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   */
  notifyAuthStateChange(event, data) {
    this.authStateListeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('认证状态监听器执行失败:', error);
      }
    });
  }

  /**
   * 设置认证服务并建立双向绑定
   * @param {AuthService} authService - 认证服务实例
   */
  setAuthService(authService) {
    super.setAuthService(authService);
    
    // 监听认证状态变化
    if (authService && authService.getSessionManager) {
      const sessionManager = authService.getSessionManager();
      sessionManager.addSessionListener((event, user) => {
        this.handleSessionChange(event, user);
      });
    }
  }

  /**
   * 处理会话状态变化
   * @param {string} event - 会话事件
   * @param {Object} user - 用户信息
   */
  handleSessionChange(event, user) {
    console.log('HttpClient收到会话状态变化:', event, user?.username);
    
    switch (event) {
      case 'started':
      case 'restored':
        // 会话开始或恢复时，确保Token已设置
        this.syncTokenFromAuth();
        break;
      case 'ended':
        // 会话结束时，清除Token
        this.clearToken();
        break;
      case 'expiring_soon':
        // 会话即将过期时，通知监听器
        this.notifyAuthStateChange('token_expiring', user);
        break;
    }
  }

  /**
   * 从认证服务同步Token
   */
  async syncTokenFromAuth() {
    if (this.authService) {
      try {
        const credentials = await this.authService.credentialsManager.getCredentials();
        if (credentials && credentials.accessToken) {
          await this.setToken(credentials.accessToken);
          console.log('Token已从认证服务同步');
        }
      } catch (error) {
        console.error('从认证服务同步Token失败:', error);
      }
    }
  }

  /**
   * 检查并刷新Token（如果需要）
   * @returns {Promise<boolean>} 是否成功刷新
   */
  async refreshTokenIfNeeded() {
    try {
      // 首先检查是否有Token
      const hasToken = await this.tokenManager.hasToken();
      if (!hasToken) {
        console.log('没有Token，需要认证');
        return false;
      }

      // 检查Token是否即将过期
      const isExpiring = await this.tokenManager.isTokenExpiringSoon();
      if (!isExpiring) {
        return true; // Token还有效，不需要刷新
      }

      console.log('Token即将过期，尝试刷新');

      // 如果有认证服务，尝试验证Token
      if (this.authService) {
        const verification = await this.authService.verifyToken();
        if (verification.valid) {
          console.log('Token验证成功，无需刷新');
          return true;
        } else {
          console.log('Token验证失败，需要重新认证');
          this.notifyAuthStateChange('token_invalid', verification);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('Token刷新检查失败:', error);
      return false;
    }
  }

  /**
   * 创建带认证的请求方法
   * @param {string} method - HTTP方法
   * @returns {Function} 请求方法
   */
  createAuthenticatedMethod(method) {
    return async (endpoint, data, options = {}) => {
      // 在发送请求前检查Token
      const tokenValid = await this.refreshTokenIfNeeded();
      if (!tokenValid && !options.skipAuth) {
        throw this.createAuthError('认证令牌无效，请重新登录', 'TOKEN_INVALID');
      }

      return this.request(method, endpoint, data, options);
    };
  }

  /**
   * 带认证的GET请求
   * @param {string} endpoint - API端点
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async authenticatedGet(endpoint, options = {}) {
    return this.createAuthenticatedMethod('GET')(endpoint, null, options);
  }

  /**
   * 带认证的POST请求
   * @param {string} endpoint - API端点
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async authenticatedPost(endpoint, data, options = {}) {
    return this.createAuthenticatedMethod('POST')(endpoint, data, options);
  }

  /**
   * 带认证的PUT请求
   * @param {string} endpoint - API端点
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async authenticatedPut(endpoint, data, options = {}) {
    return this.createAuthenticatedMethod('PUT')(endpoint, data, options);
  }

  /**
   * 带认证的DELETE请求
   * @param {string} endpoint - API端点
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async authenticatedDelete(endpoint, options = {}) {
    return this.createAuthenticatedMethod('DELETE')(endpoint, null, options);
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} Promise对象
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建认证错误
   * @param {string} message - 错误消息
   * @param {string} code - 错误代码
   * @returns {Error} 认证错误对象
   */
  createAuthError(message, code) {
    const error = new Error(message);
    error.name = 'AuthError';
    error.code = code;
    error.requiresAuth = true;
    return error;
  }

  /**
   * 获取认证统计信息
   * @returns {Object} 认证相关统计
   */
  getAuthStats() {
    const baseStats = this.getStats();
    
    return {
      ...baseStats,
      auth: {
        hasAuthService: !!this.authService,
        autoRetryOn401: this.autoRetryOn401,
        maxRetryAttempts: this.maxRetryAttempts,
        requestInterceptors: this.requestInterceptors.length,
        responseInterceptors: this.responseInterceptors.length,
        authStateListeners: this.authStateListeners.length
      }
    };
  }

  /**
   * 销毁客户端实例
   */
  destroy() {
    // 清除监听器
    this.authStateListeners = [];
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    
    // 调用父类销毁方法
    super.destroy();
    
    console.log('AuthenticatedHttpClient已销毁');
  }
}

export default AuthenticatedHttpClient;