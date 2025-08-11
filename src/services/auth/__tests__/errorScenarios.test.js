/**
 * 认证服务错误场景测试
 * 测试各种错误情况下的系统行为
 */
import AuthService from '../AuthService.js';
import UserCredentialsManager from '../UserCredentialsManager.js';

// 模拟依赖
const mockHttpClient = {
  post: jest.fn(),
  get: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  hasToken: jest.fn()
};

const mockSecureStorage = {
  storeCredentials: jest.fn(),
  getCredentials: jest.fn(),
  removeCredentials: jest.fn(),
  hasCredentials: jest.fn()
};

describe('认证服务错误场景测试', () => {
  let authService;
  let credentialsManager;
  
  beforeEach(() => {
    credentialsManager = new UserCredentialsManager(mockSecureStorage);
    authService = new AuthService(mockHttpClient, credentialsManager);
    
    jest.clearAllMocks();
    
    // 设置默认的成功mock
    mockHttpClient.setToken.mockResolvedValue(true);
    mockHttpClient.clearToken.mockResolvedValue(true);
    mockHttpClient.hasToken.mockResolvedValue(true);
    mockSecureStorage.storeCredentials.mockResolvedValue(true);
    mockSecureStorage.removeCredentials.mockResolvedValue(true);
  });
  
  describe('网络错误场景', () => {
    it('应该处理连接超时错误', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      timeoutError.code = 'TIMEOUT';
      mockHttpClient.post.mockRejectedValue(timeoutError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR',
          message: '网络连接失败，请检查网络设置'
        });
      
      // 验证状态保持一致
      expect(authService.isLoggedIn()).toBe(false);
      expect(mockSecureStorage.storeCredentials).not.toHaveBeenCalled();
    });
    
    it('应该处理DNS解析失败', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      dnsError.name = 'NetworkError';
      dnsError.code = 'ENOTFOUND';
      mockHttpClient.post.mockRejectedValue(dnsError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR',
          message: '网络连接失败，请检查网络设置'
        });
    });
    
    it('应该处理网络连接中断', async () => {
      const connectionError = new Error('Connection reset');
      connectionError.name = 'NetworkError';
      connectionError.code = 'ECONNRESET';
      mockHttpClient.post.mockRejectedValue(connectionError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR'
        });
    });
    
    it('应该处理网络不可达错误', async () => {
      const networkError = new Error('Network is unreachable');
      networkError.name = 'NetworkError';
      networkError.code = 'ENETUNREACH';
      mockHttpClient.post.mockRejectedValue(networkError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR'
        });
    });
  });
  
  describe('服务器错误场景', () => {
    it('应该处理500内部服务器错误', async () => {
      const serverError = new Error('Internal Server Error');
      serverError.status = 500;
      mockHttpClient.post.mockRejectedValue(serverError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'SERVER_ERROR',
          message: '服务器内部错误，请稍后重试'
        });
    });
    
    it('应该处理502网关错误', async () => {
      const gatewayError = new Error('Bad Gateway');
      gatewayError.status = 502;
      mockHttpClient.post.mockRejectedValue(gatewayError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'SERVER_ERROR'
        });
    });
    
    it('应该处理503服务不可用', async () => {
      const serviceError = new Error('Service Unavailable');
      serviceError.status = 503;
      mockHttpClient.post.mockRejectedValue(serviceError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'SERVER_ERROR'
        });
    });
    
    it('应该处理504网关超时', async () => {
      const timeoutError = new Error('Gateway Timeout');
      timeoutError.status = 504;
      mockHttpClient.post.mockRejectedValue(timeoutError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'SERVER_ERROR'
        });
    });
  });
  
  describe('认证错误场景', () => {
    it('应该处理401未授权错误', async () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      mockHttpClient.post.mockRejectedValue(authError);
      
      await expect(authService.login('user', 'wrongpassword'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误'
        });
    });
    
    it('应该处理403账户禁用错误', async () => {
      const forbiddenError = new Error('Forbidden');
      forbiddenError.status = 403;
      mockHttpClient.post.mockRejectedValue(forbiddenError);
      
      await expect(authService.login('disableduser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'ACCOUNT_DISABLED',
          message: '账户已被禁用，请联系管理员'
        });
    });
    
    it('应该处理429频率限制错误', async () => {
      const rateLimitError = new Error('Too Many Requests');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '300' };
      mockHttpClient.post.mockRejectedValue(rateLimitError);
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'RATE_LIMITED',
          message: '登录尝试过于频繁，请稍后重试',
          details: { retryAfter: '300' }
        });
    });
    
    it('应该处理422验证错误', async () => {
      const validationError = new Error('Validation Error');
      validationError.status = 422;
      validationError.data = {
        errors: {
          username: ['用户名格式不正确'],
          password: ['密码强度不足']
        }
      };
      mockHttpClient.post.mockRejectedValue(validationError);
      
      await expect(authService.login('invalid@user', 'weak'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'VALIDATION_ERROR'
        });
    });
  });
  
  describe('存储错误场景', () => {
    it('应该处理凭据存储失败', async () => {
      mockHttpClient.post.mockResolvedValue({
        data: {
          accessToken: 'test-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      
      // 模拟存储失败
      mockSecureStorage.storeCredentials.mockRejectedValue(new Error('Storage full'));
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'STORAGE_ERROR',
          message: '凭据存储失败，请检查存储空间'
        });
    });
    
    it('应该处理凭据读取失败', async () => {
      mockSecureStorage.getCredentials.mockRejectedValue(new Error('Storage corrupted'));
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'storage_error',
        message: '凭据读取失败'
      });
    });
    
    it('应该处理凭据清除失败', async () => {
      // 先登录
      mockHttpClient.post.mockResolvedValue({
        data: {
          accessToken: 'test-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      await authService.login('user', 'password');
      
      // 模拟清除失败
      mockSecureStorage.removeCredentials.mockRejectedValue(new Error('Storage locked'));
      mockHttpClient.post.mockResolvedValue(); // 服务器登出成功
      
      const result = await authService.logout();
      
      // 即使存储清除失败，登出应该继续进行
      expect(result.success).toBe(true);
      expect(result.localCleanup.credentialsCleared).toBe(false);
      expect(authService.isLoggedIn()).toBe(false); // 会话仍应结束
    });
  });
  
  describe('Token验证错误场景', () => {
    it('应该处理Token验证时的401错误', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'invalid-token',
        loginTime: Date.now(),
        expiresIn: 3600
      });
      
      const authError = new Error('Unauthorized');
      authError.status = 401;
      mockHttpClient.get.mockRejectedValue(authError);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'invalid_token',
        message: '访问令牌无效或已过期'
      });
    });
    
    it('应该处理Token验证时的网络错误', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'valid-token',
        loginTime: Date.now(),
        expiresIn: 3600
      });
      
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockHttpClient.get.mockRejectedValue(networkError);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'network_error',
        message: '网络连接失败，无法验证Token'
      });
    });
  });
  
  describe('会话恢复错误场景', () => {
    it('应该处理会话恢复时的存储错误', async () => {
      mockSecureStorage.getCredentials.mockRejectedValue(new Error('Storage error'));
      
      const result = await authService.restoreSession();
      
      expect(result).toMatchObject({
        restored: false,
        reason: 'restore_error'
      });
    });
    
    it('应该处理会话恢复时的Token无效', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'expired-token',
        loginTime: Date.now() - 7200000, // 2小时前
        expiresIn: 3600 // 1小时有效期
      });
      
      const result = await authService.restoreSession();
      
      expect(result).toMatchObject({
        restored: false,
        reason: 'expired'
      });
      
      // 验证过期凭据被清除
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalled();
    });
    
    it('应该处理会话恢复时的HTTP客户端错误', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'valid-token',
        loginTime: Date.now(),
        expiresIn: 3600
      });
      
      mockHttpClient.setToken.mockRejectedValue(new Error('HTTP client error'));
      
      const result = await authService.restoreSession();
      
      expect(result).toMatchObject({
        restored: false,
        reason: 'restore_error'
      });
    });
  });
  
  describe('并发错误场景', () => {
    it('应该处理并发登录请求的冲突', async () => {
      let callCount = 0;
      mockHttpClient.post.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: {
              accessToken: 'token1',
              user: { id: '1', username: 'user1' },
              expiresIn: 3600
            }
          });
        } else {
          const error = new Error('Conflict');
          error.status = 409;
          return Promise.reject(error);
        }
      });
      
      const promise1 = authService.login('user1', 'password');
      const promise2 = authService.login('user2', 'password');
      
      const results = await Promise.allSettled([promise1, promise2]);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[1].reason.code).toBe('SERVER_ERROR');
    });
    
    it('应该处理并发Token验证请求', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
        loginTime: Date.now(),
        expiresIn: 3600
      });
      
      let callCount = 0;
      mockHttpClient.get.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({
            data: {
              user: { id: '1', username: 'testuser' },
              expiresIn: 3600
            }
          });
        } else {
          const error = new Error('Too many requests');
          error.status = 429;
          return Promise.reject(error);
        }
      });
      
      const promises = [
        authService.verifyToken(),
        authService.verifyToken(),
        authService.verifyToken()
      ];
      
      const results = await Promise.allSettled(promises);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
      expect(results[2].value.valid).toBe(false);
      expect(results[2].value.reason).toBe('server_error');
    });
  });
  
  describe('边界条件错误场景', () => {
    it('应该处理空响应数据', async () => {
      mockHttpClient.post.mockResolvedValue({ data: null });
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'INVALID_RESPONSE',
          message: '服务器响应格式错误'
        });
    });
    
    it('应该处理缺少必要字段的响应', async () => {
      mockHttpClient.post.mockResolvedValue({
        data: {
          // 缺少accessToken
          user: { id: '1', username: 'testuser' }
        }
      });
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'INVALID_RESPONSE',
          message: '服务器响应格式错误'
        });
    });
    
    it('应该处理格式错误的Token', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: '', // 空Token
        loginTime: Date.now(),
        expiresIn: 3600
      });
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'no_token',
        message: '未找到访问令牌'
      });
    });
    
    it('应该处理异常的过期时间', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
        loginTime: Date.now(),
        expiresIn: -1 // 负数过期时间
      });
      
      const result = await authService.verifyToken();
      
      // 应该忽略异常的过期时间，继续验证
      expect(mockHttpClient.get).toHaveBeenCalled();
    });
  });
  
  describe('资源清理错误场景', () => {
    it('应该处理销毁时的清理错误', () => {
      const mockEndSession = jest.fn(() => {
        throw new Error('Session cleanup error');
      });
      authService.sessionManager.endSession = mockEndSession;
      
      // 销毁操作不应该抛出错误
      expect(() => {
        authService.destroy();
      }).not.toThrow();
    });
    
    it('应该处理定时器清理错误', () => {
      // 模拟clearInterval失败
      const originalClearInterval = global.clearInterval;
      global.clearInterval = jest.fn(() => {
        throw new Error('Timer cleanup error');
      });
      
      try {
        // 销毁操作不应该抛出错误
        expect(() => {
          authService.destroy();
        }).not.toThrow();
      } finally {
        global.clearInterval = originalClearInterval;
      }
    });
  });
  
  describe('异常恢复场景', () => {
    it('应该能够从网络错误中恢复', async () => {
      // 第一次请求失败
      mockHttpClient.post.mockRejectedValueOnce(new Error('Network Error'));
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR'
        });
      
      // 第二次请求成功
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          accessToken: 'recovery-token',
          user: { id: '1', username: 'user' },
          expiresIn: 3600
        }
      });
      
      const result = await authService.login('user', 'password');
      
      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('recovery-token');
    });
    
    it('应该能够从存储错误中恢复', async () => {
      mockHttpClient.post.mockResolvedValue({
        data: {
          accessToken: 'test-token',
          user: { id: '1', username: 'user' },
          expiresIn: 3600
        }
      });
      
      // 第一次存储失败
      mockSecureStorage.storeCredentials.mockRejectedValueOnce(new Error('Storage error'));
      
      await expect(authService.login('user', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'STORAGE_ERROR'
        });
      
      // 第二次存储成功
      mockSecureStorage.storeCredentials.mockResolvedValueOnce(true);
      
      const result = await authService.login('user', 'password');
      
      expect(result.success).toBe(true);
    });
  });
});