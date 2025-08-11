import AuthService from '../AuthService.js';
import SessionManager from '../SessionManager.js';

// 模拟依赖
const mockHttpClient = {
  post: jest.fn(),
  get: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  hasToken: jest.fn()
};

const mockCredentialsManager = {
  storeCredentials: jest.fn(),
  getCredentials: jest.fn(),
  clearCredentials: jest.fn()
};

describe('AuthService', () => {
  let authService;
  
  beforeEach(() => {
    authService = new AuthService(mockHttpClient, mockCredentialsManager);
    jest.clearAllMocks();
    
    // 设置默认的mock返回值
    mockHttpClient.hasToken.mockResolvedValue(true);
    mockHttpClient.setToken.mockResolvedValue(true);
    mockHttpClient.clearToken.mockResolvedValue(true);
    mockCredentialsManager.storeCredentials.mockResolvedValue(true);
    mockCredentialsManager.clearCredentials.mockResolvedValue(true);
  });
  
  describe('login', () => {
    const mockLoginResponse = {
      data: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: { id: '1', username: 'testuser' },
        expiresIn: 3600
      }
    };
    
    it('应该成功登录用户', async () => {
      mockHttpClient.post.mockResolvedValue(mockLoginResponse);
      
      const result = await authService.login('testuser', 'password', true);
      
      expect(mockHttpClient.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'password',
        rememberMe: true
      });
      
      expect(mockCredentialsManager.storeCredentials).toHaveBeenCalledWith({
        username: 'testuser',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: { id: '1', username: 'testuser' },
        expiresIn: 3600,
        rememberMe: true,
        loginTime: expect.any(Number)
      });
      
      expect(mockHttpClient.setToken).toHaveBeenCalledWith('test-access-token');
      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getCurrentUser()).toEqual({ id: '1', username: 'testuser' });
      
      expect(result).toEqual({
        success: true,
        user: { id: '1', username: 'testuser' },
        accessToken: 'test-access-token',
        expiresIn: 3600,
        message: '登录成功'
      });
    });
    
    it('应该验证输入参数', async () => {
      await expect(authService.login('', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'VALIDATION_ERROR',
          field: 'username'
        });
        
      await expect(authService.login('testuser', ''))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'VALIDATION_ERROR',
          field: 'password'
        });
    });
    
    it('应该处理401认证错误', async () => {
      const error = new Error('Unauthorized');
      error.status = 401;
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'wrongpassword'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误'
        });
    });
    
    it('应该处理429频率限制错误', async () => {
      const error = new Error('Too Many Requests');
      error.status = 429;
      error.headers = { 'retry-after': '120' };
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'RATE_LIMITED',
          message: '登录尝试过于频繁，请稍后重试',
          details: { retryAfter: '120' }
        });
    });
    
    it('应该处理403账户禁用错误', async () => {
      const error = new Error('Forbidden');
      error.status = 403;
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'ACCOUNT_DISABLED',
          message: '账户已被禁用，请联系管理员'
        });
    });
    
    it('应该处理网络错误', async () => {
      const error = new Error('Network Error');
      error.name = 'NetworkError';
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR',
          message: '网络连接失败，请检查网络设置'
        });
    });
    
    it('应该处理服务器错误', async () => {
      const error = new Error('Internal Server Error');
      error.status = 500;
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'SERVER_ERROR',
          message: '服务器内部错误，请稍后重试'
        });
    });
    
    it('应该处理其他未知错误', async () => {
      const error = new Error('Unknown Error');
      mockHttpClient.post.mockRejectedValue(error);
      
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'UNKNOWN_ERROR',
          message: '登录失败，请稍后重试'
        });
    });
    
    it('应该去除用户名的空格', async () => {
      mockHttpClient.post.mockResolvedValue(mockLoginResponse);
      mockCredentialsManager.storeCredentials.mockResolvedValue(true);
      
      await authService.login('  testuser  ', 'password');
      
      expect(mockHttpClient.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'password',
        rememberMe: false
      });
    });
  });
  
  describe('logout', () => {
    it('应该成功登出用户', async () => {
      mockHttpClient.post.mockResolvedValue();
      mockHttpClient.hasToken.mockResolvedValue(true);
      
      // 先登录一个用户
      authService.sessionManager.startSession({ id: '1', username: 'testuser' }, 3600);
      
      const result = await authService.logout();
      
      expect(mockHttpClient.hasToken).toHaveBeenCalled();
      expect(mockHttpClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(mockHttpClient.clearToken).toHaveBeenCalled();
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
      
      expect(result).toMatchObject({
        success: true,
        message: '已成功登出',
        serverLogout: true,
        localCleanup: {
          credentialsCleared: true,
          tokenCleared: true,
          sessionEnded: true
        }
      });
    });
    
    it('应该在没有Token时跳过服务器登出', async () => {
      mockHttpClient.hasToken.mockResolvedValue(false);
      
      authService.sessionManager.startSession({ id: '1', username: 'testuser' }, 3600);
      
      const result = await authService.logout();
      
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(result.serverLogout).toBe(false);
      expect(result.success).toBe(true);
    });
    
    it('应该在服务器登出失败时继续本地清理', async () => {
      mockHttpClient.hasToken.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('Server Error'));
      
      authService.sessionManager.startSession({ id: '1', username: 'testuser' }, 3600);
      
      const result = await authService.logout();
      
      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(mockHttpClient.clearToken).toHaveBeenCalled();
      expect(authService.isLoggedIn()).toBe(false);
      expect(result.success).toBe(true);
      expect(result.serverLogout).toBe(false);
    });
    
    it('应该处理登出过程中的严重异常', async () => {
      mockHttpClient.hasToken.mockRejectedValue(new Error('Critical Error'));
      
      await expect(authService.logout())
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'LOGOUT_ERROR',
          message: '登出失败，请稍后重试'
        });
    });
  });
  
  describe('verifyToken', () => {
    const mockCredentials = {
      accessToken: 'test-token',
      loginTime: Date.now(),
      expiresIn: 3600
    };
    
    it('应该成功验证有效Token', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(true);
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      
      const result = await authService.verifyToken();
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/auth/verify');
      expect(result).toMatchObject({
        valid: true,
        user: { id: '1', username: 'testuser' },
        expiresIn: 3600,
        credentials: mockCredentials,
        message: 'Token验证成功'
      });
    });
    
    it('应该在HTTP客户端没有Token时重新设置', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(false);
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      
      await authService.verifyToken();
      
      expect(mockHttpClient.setToken).toHaveBeenCalledWith('test-token');
    });
    
    it('应该在没有凭据时返回无效', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(null);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'no_token',
        message: '未找到访问令牌'
      });
    });
    
    it('应该在Token过期时返回无效', async () => {
      const expiredCredentials = {
        accessToken: 'test-token',
        loginTime: Date.now() - 7200000, // 2小时前
        expiresIn: 3600 // 1小时有效期
      };
      mockCredentialsManager.getCredentials.mockResolvedValue(expiredCredentials);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'expired',
        message: '访问令牌已过期',
        expiredAt: expect.any(Number)
      });
    });
    
    it('应该处理401验证失败', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(true);
      const error = new Error('Unauthorized');
      error.status = 401;
      mockHttpClient.get.mockRejectedValue(error);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'invalid_token',
        message: '访问令牌无效或已过期'
      });
    });
    
    it('应该处理403权限不足', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(true);
      const error = new Error('Forbidden');
      error.status = 403;
      mockHttpClient.get.mockRejectedValue(error);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'access_denied',
        message: '访问被拒绝，权限不足'
      });
    });
    
    it('应该处理网络错误', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(true);
      const error = new Error('Network Error');
      error.name = 'NetworkError';
      mockHttpClient.get.mockRejectedValue(error);
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'network_error',
        message: '网络连接失败，无法验证Token'
      });
    });
    
    it('应该处理其他验证错误', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.hasToken.mockResolvedValue(true);
      mockHttpClient.get.mockRejectedValue(new Error('Server Error'));
      
      const result = await authService.verifyToken();
      
      expect(result).toMatchObject({
        valid: false,
        reason: 'verification_error',
        message: 'Token验证失败'
      });
    });
  });
  
  describe('restoreSession', () => {
    const mockCredentials = {
      accessToken: 'test-token',
      loginTime: Date.now(),
      expiresIn: 3600
    };
    
    it('应该成功恢复会话', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      mockHttpClient.setToken.mockResolvedValue();
      
      const result = await authService.restoreSession();
      
      expect(mockHttpClient.setToken).toHaveBeenCalledWith('test-token');
      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getCurrentUser()).toEqual({ id: '1', username: 'testuser' });
      
      expect(result).toEqual({
        restored: true,
        user: { id: '1', username: 'testuser' },
        credentials: mockCredentials
      });
    });
    
    it('应该在没有凭据时返回恢复失败', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(null);
      
      const result = await authService.restoreSession();
      
      expect(result).toEqual({
        restored: false,
        reason: 'no_credentials'
      });
    });
    
    it('应该在Token无效时清除凭据并返回失败', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(mockCredentials);
      const error = new Error('Unauthorized');
      error.status = 401;
      mockHttpClient.get.mockRejectedValue(error);
      mockCredentialsManager.clearCredentials.mockResolvedValue(true);
      
      const result = await authService.restoreSession();
      
      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(result).toEqual({
        restored: false,
        reason: 'invalid_token'
      });
    });
    
    it('应该处理恢复过程中的异常', async () => {
      mockCredentialsManager.getCredentials.mockRejectedValue(new Error('Get Error'));
      
      const result = await authService.restoreSession();
      
      expect(result).toEqual({
        restored: false,
        reason: 'restore_error'
      });
    });
  });
  
  describe('isTokenExpired', () => {
    it('应该正确检测过期的Token', () => {
      const expiredCredentials = {
        loginTime: Date.now() - 7200000, // 2小时前
        expiresIn: 3600 // 1小时有效期
      };
      
      const isExpired = authService.isTokenExpired(expiredCredentials);
      
      expect(isExpired).toBe(true);
    });
    
    it('应该正确检测未过期的Token', () => {
      const validCredentials = {
        loginTime: Date.now() - 1800000, // 30分钟前
        expiresIn: 3600 // 1小时有效期
      };
      
      const isExpired = authService.isTokenExpired(validCredentials);
      
      expect(isExpired).toBe(false);
    });
    
    it('应该在缺少过期信息时返回false', () => {
      const credentialsWithoutExpiry = {
        accessToken: 'test-token'
      };
      
      const isExpired = authService.isTokenExpired(credentialsWithoutExpiry);
      
      expect(isExpired).toBe(false);
    });
  });
  
  describe('performLocalCleanup', () => {
    it('应该成功执行所有清理操作', async () => {
      const result = await authService.performLocalCleanup();
      
      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(mockHttpClient.clearToken).toHaveBeenCalled();
      expect(result).toEqual({
        credentialsCleared: true,
        tokenCleared: true,
        sessionEnded: true
      });
    });
    
    it('应该处理清理过程中的部分失败', async () => {
      mockCredentialsManager.clearCredentials.mockRejectedValue(new Error('Clear Error'));
      
      const result = await authService.performLocalCleanup();
      
      expect(result.credentialsCleared).toBe(false);
      expect(result.tokenCleared).toBe(true);
      expect(result.sessionEnded).toBe(true);
    });
  });
  
  describe('错误处理方法', () => {
    describe('handleLoginError', () => {
      it('应该处理各种HTTP状态码', () => {
        const testCases = [
          { status: 401, expectedCode: 'INVALID_CREDENTIALS' },
          { status: 403, expectedCode: 'ACCOUNT_DISABLED' },
          { status: 429, expectedCode: 'RATE_LIMITED' },
          { status: 422, expectedCode: 'VALIDATION_ERROR' },
          { status: 500, expectedCode: 'SERVER_ERROR' }
        ];
        
        testCases.forEach(({ status, expectedCode }) => {
          const error = new Error('Test Error');
          error.status = status;
          
          const result = authService.handleLoginError(error);
          
          expect(result.name).toBe('AuthError');
          expect(result.code).toBe(expectedCode);
        });
      });
      
      it('应该处理网络和超时错误', () => {
        const networkError = new Error('Network Error');
        networkError.name = 'NetworkError';
        
        const result = authService.handleLoginError(networkError);
        
        expect(result.name).toBe('AuthError');
        expect(result.code).toBe('NETWORK_ERROR');
      });
      
      it('应该直接返回已有的AuthError', () => {
        const authError = authService.createAuthError('Test', 'TEST_CODE');
        
        const result = authService.handleLoginError(authError);
        
        expect(result).toBe(authError);
      });
    });
    
    describe('handleTokenVerificationError', () => {
      it('应该处理各种验证错误', () => {
        const testCases = [
          { status: 401, expectedReason: 'invalid_token' },
          { status: 403, expectedReason: 'access_denied' },
          { status: 500, expectedReason: 'server_error' }
        ];
        
        testCases.forEach(({ status, expectedReason }) => {
          const error = new Error('Test Error');
          error.status = status;
          
          const result = authService.handleTokenVerificationError(error);
          
          expect(result.valid).toBe(false);
          expect(result.reason).toBe(expectedReason);
        });
      });
    });
    
    describe('createAuthError', () => {
      it('应该创建正确格式的认证错误', () => {
        const error = authService.createAuthError(
          'Test message', 
          'TEST_CODE', 
          'testField', 
          { extra: 'data' }
        );
        
        expect(error.name).toBe('AuthError');
        expect(error.message).toBe('Test message');
        expect(error.code).toBe('TEST_CODE');
        expect(error.field).toBe('testField');
        expect(error.details).toEqual({ extra: 'data' });
        expect(error.timestamp).toBeCloseTo(Date.now(), -2);
      });
    });
  });
  
  describe('Token过期检测和自动清理', () => {
    let originalSetInterval;
    let originalClearInterval;

    beforeEach(() => {
      // 保存原始函数
      originalSetInterval = global.setInterval;
      originalClearInterval = global.clearInterval;
      
      // 模拟定时器函数
      global.setInterval = jest.fn();
      global.clearInterval = jest.fn();
      
      jest.clearAllTimers();
      jest.useFakeTimers();
    });

    afterEach(() => {
      // 恢复原始函数
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      
      jest.useRealTimers();
    });

    it('应该启动Token过期检测定时器', () => {
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 默认1分钟间隔
      );
    });

    it('应该停止Token过期检测定时器', () => {
      authService.stopExpirationCheck();
      expect(clearInterval).toHaveBeenCalled();
    });

    it('应该检测到Token过期并自动清理', async () => {
      const expiredCredentials = {
        username: 'testuser',
        accessToken: 'expired-token',
        user: { id: '1', username: 'testuser' },
        expiresIn: 3600,
        loginTime: Date.now() - 3700000 // 超过1小时前
      };

      mockCredentialsManager.getCredentials.mockResolvedValue(expiredCredentials);
      mockCredentialsManager.clearCredentials.mockResolvedValue(true);
      mockHttpClient.clearToken.mockResolvedValue(true);

      // 模拟会话处于活跃状态
      authService.sessionManager.isActive = jest.fn().mockReturnValue(true);

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
      expect(mockHttpClient.clearToken).toHaveBeenCalled();
    });

    it('应该检测会话即将过期并发送通知', async () => {
      const soonToExpireCredentials = {
        username: 'testuser',
        accessToken: 'valid-token',
        user: { id: '1', username: 'testuser' },
        expiresIn: 3600,
        loginTime: Date.now() - 3300000 // 55分钟前，还有5分钟过期
      };

      mockCredentialsManager.getCredentials.mockResolvedValue(soonToExpireCredentials);
      
      // 模拟会话处于活跃状态
      authService.sessionManager.isActive = jest.fn().mockReturnValue(true);
      authService.sessionManager.isSessionExpiringSoon = jest.fn().mockReturnValue(true);
      authService.sessionManager.notifySessionChange = jest.fn();

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      expect(authService.sessionManager.notifySessionChange).toHaveBeenCalledWith(
        'expiring_soon',
        expect.any(Object)
      );
    });

    it('应该跳过非活跃会话的过期检测', async () => {
      // 模拟会话非活跃状态
      authService.sessionManager.isActive = jest.fn().mockReturnValue(false);

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      // 不应该调用任何清理方法
      expect(mockCredentialsManager.getCredentials).not.toHaveBeenCalled();
    });

    it('应该处理过期检测过程中的错误', async () => {
      mockCredentialsManager.getCredentials.mockRejectedValue(new Error('Storage error'));
      
      // 模拟会话处于活跃状态
      authService.sessionManager.isActive = jest.fn().mockReturnValue(true);

      // 手动调用过期检测，不应该抛出错误
      await expect(authService.checkTokenExpiration()).resolves.toBeUndefined();
    });

    it('应该允许设置自定义过期检测间隔', () => {
      const customInterval = 30000; // 30秒
      
      authService.setExpirationCheckInterval(customInterval);
      
      expect(authService.expirationCheckInterval).toBe(customInterval);
    });

    it('应该在销毁时清理资源', () => {
      const mockEndSession = jest.fn();
      authService.sessionManager.endSession = mockEndSession;

      authService.destroy();

      expect(clearInterval).toHaveBeenCalled();
      expect(mockEndSession).toHaveBeenCalled();
    });

    it('应该在没有凭据时结束会话', async () => {
      mockCredentialsManager.getCredentials.mockResolvedValue(null);
      
      // 模拟会话处于活跃状态
      authService.sessionManager.isActive = jest.fn().mockReturnValue(true);
      authService.sessionManager.endSession = jest.fn();

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      expect(authService.sessionManager.endSession).toHaveBeenCalled();
    });
  });

  describe('辅助方法', () => {
    it('应该返回SessionManager实例', () => {
      const sessionManager = authService.getSessionManager();
      
      expect(sessionManager).toBeInstanceOf(SessionManager);
    });
    
    it('应该正确处理认证要求', () => {
      authService.sessionManager.startSession({ id: '1' }, 3600);
      
      authService.handleAuthenticationRequired();
      
      expect(authService.isLoggedIn()).toBe(false);
    });
  });
});