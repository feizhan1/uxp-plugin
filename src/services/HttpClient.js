import TokenManager from './TokenManager.js';
import ApiCache from '../utils/ApiCache.js';
import { createRequestDebouncer, createRequestThrottler } from '../utils/throttleDebounce.js';

/**
 * HTTP客户端服务类
 * 提供基础的HTTP请求功能，支持GET和POST请求
 * 集成Token鉴权、缓存和性能优化功能
 */
class HttpClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || '';
    this.timeout = config.timeout || 10000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    
    // 集成Token管理器
    this.tokenManager = config.tokenManager || new TokenManager();
    this.autoAuth = config.autoAuth !== false; // 默认启用自动鉴权
    
    // 认证服务引用（用于处理401错误）
    this.authService = config.authService || null;
    
    // 集成缓存管理器
    this.cache = config.cache || new ApiCache({
      maxSize: config.cacheMaxSize || 100,
      defaultTTL: config.cacheTTL || 5 * 60 * 1000,
      enablePersistence: config.enableCachePersistence !== false
    });
    this.enableCache = config.enableCache !== false;
    
    // 防抖和节流配置
    this.debounceDelay = config.debounceDelay || 300;
    this.throttleWait = config.throttleWait || 1000;
    this.enableDebounce = config.enableDebounce || false;
    this.enableThrottle = config.enableThrottle || false;
    
    // 创建防抖和节流器
    this.debouncers = new Map();
    this.throttlers = new Map();
    
    // 请求统计
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      debouncedRequests: 0,
      throttledRequests: 0,
      errors: 0
    };
  }

  /**
   * 设置Token
   * @param {string} token - Bearer Token
   * @returns {Promise<boolean>} 设置是否成功
   */
  async setToken(token) {
    return await this.tokenManager.setToken(token);
  }

  /**
   * 获取当前Token
   * @returns {Promise<string|null>} 当前Token
   */
  async getToken() {
    return await this.tokenManager.getToken();
  }

  /**
   * 清除Token
   * @returns {Promise<boolean>} 清除是否成功
   */
  async clearToken() {
    return await this.tokenManager.clearToken();
  }

  /**
   * 检查是否有Token
   * @returns {Promise<boolean>} 是否有Token
   */
  async hasToken() {
    return await this.tokenManager.hasToken();
  }

  /**
   * 发送GET请求（支持缓存）
   * @param {string} endpoint - API端点
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async get(endpoint, options = {}) {
    const {
      useCache = this.enableCache,
      cacheKey = null,
      cacheTTL = null,
      useDebounce = this.enableDebounce,
      useThrottle = this.enableThrottle,
      ...requestOptions
    } = options;

    // 生成缓存键
    const finalCacheKey = cacheKey || this.cache.generateKey(endpoint, requestOptions);
    
    // 尝试从缓存获取数据
    if (useCache) {
      const cachedData = this.cache.get(finalCacheKey);
      if (cachedData) {
        this.stats.cacheHits++;
        console.log(`缓存命中: ${endpoint}`);
        return cachedData;
      }
      this.stats.cacheMisses++;
    }

    // 创建请求函数
    const requestFunc = () => this.request('GET', endpoint, null, requestOptions);
    
    // 应用防抖或节流
    if (useDebounce) {
      return this.getDebouncer(finalCacheKey, requestFunc).request();
    } else if (useThrottle) {
      return this.getThrottler(finalCacheKey, requestFunc).request();
    }
    
    // 直接请求
    const response = await requestFunc();
    
    // 缓存响应数据
    if (useCache && response) {
      this.cache.set(finalCacheKey, response, cacheTTL);
    }
    
    return response;
  }

  /**
   * 发送POST请求
   * @param {string} endpoint - API端点
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async post(endpoint, data, options = {}) {
    const {
      useDebounce = false, // POST请求默认不使用防抖
      useThrottle = this.enableThrottle,
      ...requestOptions
    } = options;

    // 创建请求函数
    const requestFunc = () => this.request('POST', endpoint, data, requestOptions);
    
    // 应用防抖或节流
    if (useDebounce) {
      const cacheKey = this.cache.generateKey(endpoint, { data, ...requestOptions });
      return this.getDebouncer(cacheKey, requestFunc).request();
    } else if (useThrottle) {
      const cacheKey = this.cache.generateKey(endpoint, { data, ...requestOptions });
      return this.getThrottler(cacheKey, requestFunc).request();
    }
    
    return requestFunc();
  }

  /**
   * 统一的请求处理方法
   * @param {string} method - HTTP方法
   * @param {string} endpoint - API端点
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} API响应数据
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = this.buildUrl(endpoint);
    const controller = new AbortController();
    
    // 更新统计
    this.stats.totalRequests++;
    
    // 设置请求超时
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeout || this.timeout);

    try {
      // 构建请求头，包含鉴权信息
      const headers = await this.buildHeaders(options.headers);
      
      const requestOptions = {
        method,
        signal: options.signal || controller.signal,
        headers
      };

      // 添加请求体（仅对POST等方法）
      if (data && method !== 'GET') {
        requestOptions.body = JSON.stringify(data);
      }

      console.log(`发送${method}请求到: ${url}`);
      
      const response = await fetch(url, requestOptions);
      
      clearTimeout(timeoutId);

      // 检查响应状态
      if (!response.ok) {
        this.stats.errors++;
        const error = this.createHttpError(response);
        
        // 处理401鉴权失败
        if (response.status === 401) {
          await this.handleAuthError(error);
          
          // 如果有认证服务且支持自动重试，可以在这里添加重试逻辑
          // 但为了避免无限循环，这里只标记错误，让上层处理
        }
        
        throw error;
      }

      // 解析JSON响应
      const responseData = await response.json();
      
      console.log('请求成功，收到数据:', responseData);
      
      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers)
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw this.createTimeoutError();
      }
      
      if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Network'))) {
        this.stats.errors++;
        throw this.createNetworkError(error);
      }
      
      // 更新错误统计
      this.stats.errors++;
      
      // 重新抛出已知错误
      throw error;
    }
  }

  /**
   * 构建请求头，包含鉴权信息
   * @param {Object} customHeaders - 自定义头部
   * @returns {Promise<Object>} 完整的请求头
   */
  async buildHeaders(customHeaders = {}) {
    let headers = {
      ...this.headers,
      ...customHeaders
    };

    // 如果启用自动鉴权，添加Token头部
    if (this.autoAuth) {
      // 确保获取最新的Token
      const token = await this.tokenManager.getToken();
      if (token) {
        const authHeaders = this.tokenManager.getAuthHeaders();
        headers = {
          ...headers,
          ...authHeaders
        };
        console.log('已添加认证头部到请求');
      } else {
        console.log('没有可用的Token，跳过认证头部');
      }
    }

    return headers;
  }

  /**
   * 处理鉴权错误
   * @param {Error} error - 鉴权错误
   */
  async handleAuthError(error) {
    console.warn('检测到鉴权失败，可能需要更新Token');
    
    // 标记为鉴权错误
    error.authError = true;
    error.requiresAuth = true;
    
    // 如果设置了认证服务，触发重新认证流程
    if (this.authService) {
      console.log('触发重新认证流程');
      this.authService.handleAuthenticationRequired();
    }
    
    // 清除无效的Token
    await this.clearToken();
  }

  /**
   * 构建完整的URL
   * @param {string} endpoint - API端点
   * @returns {string} 完整的URL
   */
  buildUrl(endpoint) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    
    const baseUrl = this.baseURL.endsWith('/') ? this.baseURL.slice(0, -1) : this.baseURL;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    return `${baseUrl}${path}`;
  }

  /**
   * 创建HTTP错误对象
   * @param {Response} response - Fetch响应对象
   * @returns {Error} HTTP错误
   */
  createHttpError(response) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    error.name = 'HttpError';
    error.status = response.status;
    error.statusText = response.statusText;
    error.authError = response.status === 401;
    return error;
  }

  /**
   * 创建超时错误对象
   * @returns {Error} 超时错误
   */
  createTimeoutError() {
    const error = new Error('请求超时，请稍后重试');
    error.name = 'TimeoutError';
    error.code = 'TIMEOUT';
    return error;
  }

  /**
   * 创建网络错误对象
   * @param {Error} originalError - 原始错误
   * @returns {Error} 网络错误
   */
  createNetworkError(originalError) {
    const error = new Error('网络连接失败，请检查网络设置');
    error.name = 'NetworkError';
    error.code = 'NETWORK_ERROR';
    error.originalError = originalError;
    return error;
  }

  /**
   * 解析响应头
   * @param {Headers} headers - Fetch Headers对象
   * @returns {Object} 头部对象
   */
  parseHeaders(headers) {
    const headerObj = {};
    for (const [key, value] of headers.entries()) {
      headerObj[key] = value;
    }
    return headerObj;
  }

  /**
   * 更新基础URL
   * @param {string} baseURL - 新的基础URL
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
  }

  /**
   * 更新默认头部
   * @param {Object} headers - 新的头部
   */
  setHeaders(headers) {
    this.headers = {
      ...this.headers,
      ...headers
    };
  }

  /**
   * 更新超时时间
   * @param {number} timeout - 超时时间（毫秒）
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }

  /**
   * 启用或禁用自动鉴权
   * @param {boolean} enabled - 是否启用自动鉴权
   */
  setAutoAuth(enabled) {
    this.autoAuth = enabled;
    console.log(`自动鉴权已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取Token管理器实例
   * @returns {TokenManager} Token管理器实例
   */
  getTokenManager() {
    return this.tokenManager;
  }

  /**
   * 设置Token管理器实例
   * @param {TokenManager} tokenManager - Token管理器实例
   */
  setTokenManager(tokenManager) {
    this.tokenManager = tokenManager;
  }

  /**
   * 设置认证服务实例
   * @param {AuthService} authService - 认证服务实例
   */
  setAuthService(authService) {
    this.authService = authService;
    console.log('认证服务已设置到HttpClient');
  }

  /**
   * 获取认证服务实例
   * @returns {AuthService|null} 认证服务实例
   */
  getAuthService() {
    return this.authService;
  }

  /**
   * 获取或创建防抖器
   * @param {string} key - 防抖器键
   * @param {Function} requestFunc - 请求函数
   * @returns {Object} 防抖器对象
   */
  getDebouncer(key, requestFunc) {
    if (!this.debouncers.has(key)) {
      const debouncer = createRequestDebouncer(
        async (...args) => {
          this.stats.debouncedRequests++;
          const response = await requestFunc(...args);
          
          // 缓存响应数据
          if (this.enableCache && response) {
            this.cache.set(key, response);
          }
          
          return response;
        },
        this.debounceDelay,
        {
          onPending: () => console.log(`请求防抖中: ${key}`),
          onCancel: () => console.log(`请求已取消: ${key}`),
          onExecute: () => console.log(`执行防抖请求: ${key}`)
        }
      );
      
      this.debouncers.set(key, debouncer);
    }
    
    return this.debouncers.get(key);
  }

  /**
   * 获取或创建节流器
   * @param {string} key - 节流器键
   * @param {Function} requestFunc - 请求函数
   * @returns {Object} 节流器对象
   */
  getThrottler(key, requestFunc) {
    if (!this.throttlers.has(key)) {
      const throttler = createRequestThrottler(
        async (...args) => {
          this.stats.throttledRequests++;
          const response = await requestFunc(...args);
          
          // 缓存响应数据
          if (this.enableCache && response) {
            this.cache.set(key, response);
          }
          
          return response;
        },
        this.throttleWait,
        {
          onSkip: (args, { skippedCount }) => {
            console.log(`请求被节流跳过: ${key}, 跳过次数: ${skippedCount}`);
          },
          onExecute: (args, { skippedCount }) => {
            console.log(`执行节流请求: ${key}, 之前跳过: ${skippedCount}`);
          }
        }
      );
      
      this.throttlers.set(key, throttler);
    }
    
    return this.throttlers.get(key);
  }

  /**
   * 清除指定的防抖器
   * @param {string} key - 防抖器键
   */
  clearDebouncer(key) {
    const debouncer = this.debouncers.get(key);
    if (debouncer) {
      debouncer.cancel();
      this.debouncers.delete(key);
    }
  }

  /**
   * 清除指定的节流器
   * @param {string} key - 节流器键
   */
  clearThrottler(key) {
    const throttler = this.throttlers.get(key);
    if (throttler) {
      throttler.cancel();
      this.throttlers.delete(key);
    }
  }

  /**
   * 清除所有防抖器和节流器
   */
  clearAllDebouncersAndThrottlers() {
    // 清除所有防抖器
    for (const [key, debouncer] of this.debouncers.entries()) {
      debouncer.cancel();
    }
    this.debouncers.clear();
    
    // 清除所有节流器
    for (const [key, throttler] of this.throttlers.entries()) {
      throttler.cancel();
    }
    this.throttlers.clear();
    
    console.log('所有防抖器和节流器已清除');
  }

  /**
   * 获取缓存管理器
   * @returns {ApiCache} 缓存管理器实例
   */
  getCache() {
    return this.cache;
  }

  /**
   * 设置缓存管理器
   * @param {ApiCache} cache - 缓存管理器实例
   */
  setCache(cache) {
    this.cache = cache;
  }

  /**
   * 清除缓存
   * @param {string} key - 缓存键，不提供则清除所有缓存
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 启用或禁用缓存
   * @param {boolean} enabled - 是否启用缓存
   */
  setCacheEnabled(enabled) {
    this.enableCache = enabled;
    console.log(`缓存已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 启用或禁用防抖
   * @param {boolean} enabled - 是否启用防抖
   */
  setDebounceEnabled(enabled) {
    this.enableDebounce = enabled;
    if (!enabled) {
      this.clearAllDebouncersAndThrottlers();
    }
    console.log(`防抖已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 启用或禁用节流
   * @param {boolean} enabled - 是否启用节流
   */
  setThrottleEnabled(enabled) {
    this.enableThrottle = enabled;
    if (!enabled) {
      this.clearAllDebouncersAndThrottlers();
    }
    console.log(`节流已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 设置防抖延迟
   * @param {number} delay - 延迟时间（毫秒）
   */
  setDebounceDelay(delay) {
    this.debounceDelay = delay;
    // 清除现有防抖器，下次请求时会使用新的延迟时间
    this.debouncers.clear();
    console.log(`防抖延迟已设置为: ${delay}ms`);
  }

  /**
   * 设置节流等待时间
   * @param {number} wait - 等待时间（毫秒）
   */
  setThrottleWait(wait) {
    this.throttleWait = wait;
    // 清除现有节流器，下次请求时会使用新的等待时间
    this.throttlers.clear();
    console.log(`节流等待时间已设置为: ${wait}ms`);
  }

  /**
   * 获取性能统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const cacheStats = this.cache.getStats();
    
    return {
      ...this.stats,
      cache: cacheStats,
      performance: {
        cacheHitRate: this.stats.totalRequests > 0 
          ? ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
        errorRate: this.stats.totalRequests > 0 
          ? ((this.stats.errors / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
        optimizedRequests: this.stats.debouncedRequests + this.stats.throttledRequests,
        activeDebouncers: this.debouncers.size,
        activeThrottlers: this.throttlers.size
      }
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      debouncedRequests: 0,
      throttledRequests: 0,
      errors: 0
    };
    
    console.log('统计信息已重置');
  }

  /**
   * 销毁HTTP客户端，清理所有资源
   */
  destroy() {
    this.clearAllDebouncersAndThrottlers();
    this.cache.destroy();
    this.resetStats();
    console.log('HttpClient已销毁');
  }
}

export default HttpClient;