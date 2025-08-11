import AuthService from '../AuthService.js';
import UserCredentialsManager from '../UserCredentialsManager.js';
import SessionManager from '../SessionManager.js';

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

describe('会话恢复和状态管理集成测试', () => {
  let authService;
  let credentialsManager;
  let sessionListeners;
  
  beforeEach(() => {
    jest.clearAllMocks();
    sessionListeners = [];
    
    // 设置默认的mock返回值
    mockHttpClient.hasToken.mockResolvedValue(true);
    mockHttpClient.setToken.mockResolvedValue(true);
    mockHttpClient.clearToken.mockResolvedValue(true);
    mockSecureStorage.storeCredentials.mockResolvedValue(true);
    mockSecureStorage.removeCredentials.mockResolvedValue(true);
    
    credentialsManager = new UserCredentialsManager(mockSecureStorage);
    authService = new AuthService(mockHttpClient, credentialsManager);
    
    // 模拟会话监听器
    const originalAddListener = authService.sessionManager.addSessionListener.bind(authService.sessionManager);
    authService.sessionManager.addSessionListener = jest.fn((listener) => {
      sessionListeners.push(listener);
      return originalAddListener(listener);
    });
  });

  describe('完整的会话恢复流程', () => {
    it('应该成功恢复有效会话并通知监听器', async () => {
      const mockUser = { id: '1', username: 'testuser', email: 'test@example.com' };
      const mockCredentials = {
        username: 'testuser',
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 1000 // 1秒前登录
      };

      // 模拟存储中有有效凭据
      mockSecureStorage.getCredentials.mockResolvedValue(mockCredentials);
      
      // 模拟Token验证成功
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: mockUser,
          expiresIn: 3500
        }
      });

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证恢复结果
      expect(result.restored).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.credentials).toEqual(mockCredentials);

      // 验证HTTP客户端设置了Token
      expect(mockHttpClient.setToken).toHaveBeenCalledWith('valid-token');

      // 验证会话状态
      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getCurrentUser()).toEqual(mockUser);

      // 验证会话监听器被调用
      expect(sessionListener).toHaveBeenCalledWith('restored', mockUser);
    });

    it('应该处理Token过期的情况并清理会话', async () => {
      const mockUser = { id: '1', username: 'testuser' };
      const expiredCredentials = {
        username: 'testuser',
        accessToken: 'expired-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 3700000 // 超过1小时前
      };

      // 模拟存储中有过期凭据
      mockSecureStorage.getCredentials.mockResolvedValue(expiredCredentials);

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证恢复失败
      expect(result.restored).toBe(false);
      expect(result.reason).toBe('expired');

      // 验证会话状态
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBe(null);

      // 验证没有调用会话监听器（因为会话没有启动）
      expect(sessionListener).not.toHaveBeenCalled();
    });

    it('应该处理服务器Token验证失败并清理凭据', async () => {
      const mockUser = { id: '1', username: 'testuser' };
      const invalidCredentials = {
        username: 'testuser',
        accessToken: 'invalid-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 1000
      };

      // 模拟存储中有无效凭据
      mockSecureStorage.getCredentials.mockResolvedValue(invalidCredentials);
      
      // 模拟服务器返回401错误
      const error = new Error('Unauthorized');
      error.status = 401;
      mockHttpClient.get.mockRejectedValue(error);

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证恢复失败
      expect(result.restored).toBe(false);
      expect(result.reason).toBe('invalid_token');

      // 验证清除了无效凭据
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalled();

      // 验证会话状态
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBe(null);
    });
  });

  describe('自动Token过期检测', () => {
    beforeEach(() => {
      // 停止自动启动的定时器
      authService.stopExpirationCheck();
    });

    it('应该检测到Token过期并自动清理会话', async () => {
      const mockUser = { id: '1', username: 'testuser' };
      const expiredCredentials = {
        username: 'testuser',
        accessToken: 'expired-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 3700000 // 超过1小时前
      };

      // 先启动一个会话
      authService.sessionManager.startSession(mockUser, 3600);

      // 模拟存储中有过期凭据
      mockSecureStorage.getCredentials.mockResolvedValue(expiredCredentials);

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      // 验证执行了清理操作
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalled();
      expect(mockHttpClient.clearToken).toHaveBeenCalled();

      // 验证会话被结束
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBe(null);

      // 验证会话监听器被调用
      expect(sessionListener).toHaveBeenCalledWith('ended', mockUser);
    });

    it('应该检测会话即将过期并发送通知', async () => {
      const mockUser = { id: '1', username: 'testuser' };
      const soonToExpireCredentials = {
        username: 'testuser',
        accessToken: 'valid-token',
        user: mockUser,
        expiresIn: 300, // 5分钟有效期
        loginTime: Date.now() - 1000 // 1秒前登录
      };

      // 先启动一个会话，设置为4分钟后过期（即将过期）
      const expiresInSeconds = 240; // 4分钟
      authService.sessionManager.startSession(mockUser, expiresInSeconds);

      // 模拟存储中有即将过期的凭据
      mockSecureStorage.getCredentials.mockResolvedValue(soonToExpireCredentials);

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 手动调用过期检测
      await authService.checkTokenExpiration();

      // 验证会话仍然活跃
      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getCurrentUser()).toEqual(mockUser);

      // 验证发送了即将过期通知
      expect(sessionListener).toHaveBeenCalledWith('expiring_soon', mockUser);
    });
  });

  describe('登录到会话恢复的完整流程', () => {
    it('应该完成登录、登出、再次恢复的完整周期', async () => {
      const mockUser = { id: '1', username: 'testuser', email: 'test@example.com' };
      const mockLoginResponse = {
        data: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          user: mockUser,
          expiresIn: 3600
        }
      };

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 1. 执行登录
      mockHttpClient.post.mockResolvedValue(mockLoginResponse);
      const loginResult = await authService.login('testuser', 'password', true);

      expect(loginResult.success).toBe(true);
      expect(authService.isLoggedIn()).toBe(true);
      expect(sessionListener).toHaveBeenCalledWith('started', mockUser);

      // 2. 执行登出
      mockHttpClient.post.mockResolvedValue(); // 登出请求成功
      await authService.logout();

      expect(authService.isLoggedIn()).toBe(false);
      expect(sessionListener).toHaveBeenCalledWith('ended', mockUser);

      // 3. 模拟应用重启后的会话恢复
      const storedCredentials = {
        username: 'testuser',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 1000
      };

      mockSecureStorage.getCredentials.mockResolvedValue(storedCredentials);
      mockHttpClient.get.mockResolvedValue({
        data: {
          user: mockUser,
          expiresIn: 3500
        }
      });

      const restoreResult = await authService.restoreSession();

      expect(restoreResult.restored).toBe(true);
      expect(authService.isLoggedIn()).toBe(true);
      expect(sessionListener).toHaveBeenCalledWith('restored', mockUser);

      // 验证整个流程中的监听器调用
      expect(sessionListener).toHaveBeenCalledTimes(3);
      expect(sessionListener).toHaveBeenNthCalledWith(1, 'started', mockUser);
      expect(sessionListener).toHaveBeenNthCalledWith(2, 'ended', mockUser);
      expect(sessionListener).toHaveBeenNthCalledWith(3, 'restored', mockUser);
    });
  });

  describe('错误恢复和状态同步', () => {
    it('应该在存储错误时正确处理状态', async () => {
      const mockUser = { id: '1', username: 'testuser' };

      // 模拟存储操作失败 - 直接在credentialsManager上模拟
      credentialsManager.getCredentials = jest.fn().mockRejectedValue(new Error('Storage error'));

      // 添加会话监听器
      const sessionListener = jest.fn();
      authService.sessionManager.addSessionListener(sessionListener);

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证恢复失败
      expect(result.restored).toBe(false);
      expect(result.reason).toBe('restore_error');

      // 验证会话状态保持未登录
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBe(null);

      // 验证没有调用会话监听器
      expect(sessionListener).not.toHaveBeenCalled();
    });

    it('应该在网络错误时保持会话状态一致', async () => {
      const mockUser = { id: '1', username: 'testuser' };
      const validCredentials = {
        username: 'testuser',
        accessToken: 'valid-token',
        user: mockUser,
        expiresIn: 3600,
        loginTime: Date.now() - 1000
      };

      // 模拟存储中有有效凭据但网络验证失败
      mockSecureStorage.getCredentials.mockResolvedValue(validCredentials);
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockHttpClient.get.mockRejectedValue(networkError);

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证恢复失败
      expect(result.restored).toBe(false);
      expect(result.reason).toBe('network_error');

      // 验证会话状态
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentUser()).toBe(null);

      // 验证没有清除凭据（因为是网络错误，不是认证错误）
      expect(mockSecureStorage.removeCredentials).not.toHaveBeenCalled();
    });
  });
});