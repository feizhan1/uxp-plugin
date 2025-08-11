import { AuthService, UserCredentialsManager, SessionManager } from '../index.js';

// 模拟SecureStorage以避免实际的localStorage操作
const mockSecureStorage = {
  storeCredentials: jest.fn(),
  getCredentials: jest.fn(),
  removeCredentials: jest.fn(),
  hasCredentials: jest.fn()
};

// 模拟HTTP客户端
const mockHttpClient = {
  post: jest.fn(),
  get: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  hasToken: jest.fn()
};

describe('身份验证服务集成测试', () => {
  let authService;
  let credentialsManager;
  
  beforeEach(() => {
    // 使用模拟的SecureStorage
    credentialsManager = new UserCredentialsManager(mockSecureStorage);
    authService = new AuthService(mockHttpClient, credentialsManager);
    
    jest.clearAllMocks();
    
    // 设置默认的mock返回值
    mockHttpClient.hasToken.mockResolvedValue(true);
    mockHttpClient.setToken.mockResolvedValue(true);
    mockHttpClient.clearToken.mockResolvedValue(true);
    mockSecureStorage.storeCredentials.mockResolvedValue(true);
    mockSecureStorage.removeCredentials.mockResolvedValue(true);
  });
  
  describe('完整登录流程', () => {
    const mockLoginResponse = {
      data: {
        accessToken: 'integration-test-token',
        refreshToken: 'integration-refresh-token',
        user: { 
          id: 'user123', 
          username: 'integrationuser',
          email: 'test@example.com'
        },
        expiresIn: 3600
      }
    };
    
    it('应该完成完整的登录-验证-登出流程', async () => {
      // 1. 模拟存储的凭据
      const storedCredentials = {
        username: 'integrationuser',
        accessToken: 'integration-test-token',
        refreshToken: 'integration-refresh-token',
        user: mockLoginResponse.data.user,
        expiresIn: 3600,
        rememberMe: true,
        loginTime: Date.now()
      };
      
      mockSecureStorage.getCredentials.mockResolvedValue(storedCredentials);
      
      // 2. 模拟登录成功
      mockHttpClient.post.mockResolvedValue(mockLoginResponse);
      
      // 3. 执行登录
      const loginResult = await authService.login('integrationuser', 'password', true);
      
      // 4. 验证登录结果
      expect(loginResult.success).toBe(true);
      expect(loginResult.user.username).toBe('integrationuser');
      expect(loginResult.expiresIn).toBe(3600);
      expect(authService.isLoggedIn()).toBe(true);
      
      // 5. 验证存储被调用
      expect(mockSecureStorage.storeCredentials).toHaveBeenCalledWith(
        'user_credentials',
        expect.objectContaining({
          username: 'integrationuser',
          accessToken: 'integration-test-token',
          user: mockLoginResponse.data.user
        })
      );
      
      // 6. 验证会话状态
      const sessionInfo = authService.getSessionManager().getSessionInfo();
      expect(sessionInfo.isActive).toBe(true);
      expect(sessionInfo.user.username).toBe('integrationuser');
      
      // 7. 模拟Token验证
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: mockLoginResponse.data.user,
          expiresIn: 3600
        }
      });
      
      const verifyResult = await authService.verifyToken();
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.message).toBe('Token验证成功');
      
      // 8. 执行登出
      mockHttpClient.post.mockResolvedValue(); // 登出请求
      
      const logoutResult = await authService.logout();
      
      // 9. 验证登出结果
      expect(logoutResult.success).toBe(true);
      expect(logoutResult.serverLogout).toBe(true);
      expect(logoutResult.localCleanup.credentialsCleared).toBe(true);
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
      
      // 10. 验证清除方法被调用
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalledWith('user_credentials');
    });
    
    it('应该正确处理会话恢复流程', async () => {
      // 1. 模拟存储中有有效凭据
      const validCredentials = {
        username: 'integrationuser',
        accessToken: 'integration-test-token',
        refreshToken: 'integration-refresh-token',
        user: mockLoginResponse.data.user,
        expiresIn: 3600,
        rememberMe: true,
        loginTime: Date.now() - 1800000 // 30分钟前，仍然有效
      };
      
      mockSecureStorage.getCredentials.mockResolvedValue(validCredentials);
      
      // 2. 模拟Token验证成功
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: mockLoginResponse.data.user,
          expiresIn: 3600
        }
      });
      
      // 3. 创建新的AuthService实例模拟应用重启
      const newAuthService = new AuthService(mockHttpClient, credentialsManager);
      
      // 4. 尝试恢复会话
      const restoreResult = await newAuthService.restoreSession();
      
      // 5. 验证恢复结果
      expect(restoreResult.restored).toBe(true);
      expect(restoreResult.user.username).toBe('integrationuser');
      expect(newAuthService.isLoggedIn()).toBe(true);
      expect(newAuthService.getCurrentUser().username).toBe('integrationuser');
      
      // 6. 验证HTTP客户端Token被设置
      expect(mockHttpClient.setToken).toHaveBeenCalledWith('integration-test-token');
    });
    
    it('应该正确处理Token过期的情况', async () => {
      // 1. 模拟存储中有过期的凭据
      const expiredCredentials = {
        username: 'expireduser',
        accessToken: 'expired-token',
        refreshToken: 'expired-refresh',
        user: { id: 'expired123', username: 'expireduser' },
        expiresIn: 3600,
        rememberMe: true,
        loginTime: Date.now() - 7200000 // 2小时前，已过期
      };
      
      mockSecureStorage.getCredentials.mockResolvedValue(expiredCredentials);
      
      // 2. 尝试验证过期的Token
      const verifyResult = await authService.verifyToken();
      
      // 3. 验证结果应该是过期
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe('expired');
      expect(verifyResult.message).toBe('访问令牌已过期');
      expect(verifyResult.expiredAt).toBeDefined();
      
      // 4. 尝试恢复会话应该失败
      const restoreResult = await authService.restoreSession();
      
      expect(restoreResult.restored).toBe(false);
      expect(restoreResult.reason).toBe('expired');
      
      // 5. 验证过期凭据被清除
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalledWith('user_credentials');
    });
  });
  
  describe('会话监听器集成', () => {
    it('应该正确触发会话状态变化事件', async () => {
      const sessionListener = jest.fn();
      authService.getSessionManager().addSessionListener(sessionListener);
      
      // 模拟存储成功
      mockSecureStorage.storeCredentials.mockResolvedValue(true);
      mockSecureStorage.removeCredentials.mockResolvedValue(true);
      
      // 模拟登录
      mockHttpClient.post.mockResolvedValue({
        data: {
          accessToken: 'test-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      
      await authService.login('testuser', 'password');
      
      // 验证启动事件被触发
      expect(sessionListener).toHaveBeenCalledWith('started', { id: '1', username: 'testuser' });
      
      // 模拟登出
      mockHttpClient.post.mockResolvedValue();
      await authService.logout();
      
      // 验证结束事件被触发
      expect(sessionListener).toHaveBeenCalledWith('ended', { id: '1', username: 'testuser' });
    });
  });
  
  describe('错误处理集成', () => {
    it('应该正确处理网络错误并保持状态一致', async () => {
      // 模拟网络错误
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockHttpClient.post.mockRejectedValue(networkError);
      
      // 尝试登录
      await expect(authService.login('testuser', 'password'))
        .rejects.toMatchObject({
          name: 'AuthError',
          code: 'NETWORK_ERROR',
          message: '网络连接失败，请检查网络设置'
        });
      
      // 验证状态保持未登录
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
      
      // 验证没有尝试存储凭据
      expect(mockSecureStorage.storeCredentials).not.toHaveBeenCalled();
    });
    
    it('应该正确处理登出时的服务器错误', async () => {
      // 先模拟登录成功
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          accessToken: 'test-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }
      });
      
      await authService.login('testuser', 'password');
      expect(authService.isLoggedIn()).toBe(true);
      
      // 模拟登出时服务器错误
      mockHttpClient.post.mockRejectedValueOnce(new Error('Server Error'));
      
      // 执行登出
      const logoutResult = await authService.logout();
      
      // 验证即使服务器错误，本地清理仍然成功
      expect(logoutResult.success).toBe(true);
      expect(logoutResult.serverLogout).toBe(false);
      expect(logoutResult.localCleanup.credentialsCleared).toBe(true);
      expect(authService.isLoggedIn()).toBe(false);
    });
    
    it('应该正确处理Token验证时的各种错误', async () => {
      const testCredentials = {
        accessToken: 'test-token',
        loginTime: Date.now(),
        expiresIn: 3600
      };
      
      mockSecureStorage.getCredentials.mockResolvedValue(testCredentials);
      
      // 测试401错误
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.status = 401;
      mockHttpClient.get.mockRejectedValueOnce(unauthorizedError);
      
      let result = await authService.verifyToken();
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_token');
      
      // 测试网络错误
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockHttpClient.get.mockRejectedValueOnce(networkError);
      
      result = await authService.verifyToken();
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('network_error');
    });
  });
});