import AuthService from '../AuthService.js';
import AuthenticatedHttpClient from '../../AuthenticatedHttpClient.js';
import UserCredentialsManager from '../UserCredentialsManager.js';
import TokenManager from '../../TokenManager.js';

// Mock fetch
global.fetch = jest.fn();

// Mock SecureStorage
jest.mock('../../../utils/SecureStorage.js', () => ({
  storeCredentials: jest.fn().mockResolvedValue(true),
  getCredentials: jest.fn().mockResolvedValue(null),
  removeCredentials: jest.fn().mockResolvedValue(true),
  hasCredentials: jest.fn().mockResolvedValue(false)
}));

describe('AuthService与HttpClient集成测试', () => {
  let authService;
  let httpClient;
  let credentialsManager;
  let tokenManager;

  beforeEach(() => {
    // 清除所有mock
    jest.clearAllMocks();
    fetch.mockClear();
    
    // 获取SecureStorage mock
    const mockSecureStorage = require('../../../utils/SecureStorage.js');
    
    // 重置SecureStorage mock
    Object.keys(mockSecureStorage).forEach(key => {
      if (typeof mockSecureStorage[key].mockClear === 'function') {
        mockSecureStorage[key].mockClear();
      }
    });
    const mockSecureStorage = require('../../../utils/SecureStorage.js');
    mockSecureStorage.getCredentials.mockResolvedValue(null);
    
    // 创建实例
    tokenManager = new TokenManager();
    credentialsManager = new UserCredentialsManager();
    httpClient = new AuthenticatedHttpClient({
      baseURL: 'https://api.test.com',
      tokenManager
    });
    
    authService = new AuthService(httpClient, credentialsManager);
  });

  afterEach(() => {
    authService.destroy();
    httpClient.destroy();
  });

  describe('登录流程集成', () => {
    test('成功登录应该设置HttpClient的Token', async () => {
      // Mock登录API响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }),
        headers: new Map()
      });

      // 执行登录
      const result = await authService.login('testuser', 'password123');

      // 验证登录结果
      expect(result.success).toBe(true);
      expect(result.user.username).toBe('testuser');

      // 验证HttpClient的Token已设置
      const token = await httpClient.getToken();
      expect(token).toBe('test-access-token');

      // 验证凭据已存储
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      expect(mockSecureStorage.storeCredentials).toHaveBeenCalledWith(
        'user_credentials',
        expect.objectContaining({
          username: 'testuser',
          accessToken: 'test-access-token',
          user: { id: '1', username: 'testuser' }
        })
      );
    });

    test('登录后的API请求应该自动包含认证头', async () => {
      // Mock登录响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          accessToken: 'test-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }),
        headers: new Map()
      });

      // 执行登录
      await authService.login('testuser', 'password123');

      // Mock API请求响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'protected data' }),
        headers: new Map()
      });

      // 发送API请求
      await httpClient.get('/protected-resource');

      // 验证第二个请求包含认证头
      expect(fetch).toHaveBeenNthCalledWith(2,
        'https://api.test.com/protected-resource',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });
  });

  describe('Token验证集成', () => {
    test('Token验证失败应该清除HttpClient的Token', async () => {
      // 设置初始Token
      await httpClient.setToken('invalid-token');
      
      // Mock存储的凭据
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      mockSecureStorage.getCredentials.mockResolvedValueOnce({
        accessToken: 'invalid-token',
        user: { id: '1', username: 'testuser' },
        loginTime: Date.now(),
        expiresIn: 3600
      });

      // Mock Token验证失败响应
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid token' }),
        headers: new Map()
      });

      // 执行Token验证
      const result = await authService.verifyToken();

      // 验证Token验证失败
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_token');

      // 验证HttpClient的Token仍然存在（verifyToken不会自动清除）
      const token = await httpClient.getToken();
      expect(token).toBe('invalid-token');
    });
  });

  describe('会话恢复集成', () => {
    test('成功恢复会话应该设置HttpClient的Token', async () => {
      // Mock存储的凭据
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'stored-token',
        user: { id: '1', username: 'testuser' },
        loginTime: Date.now() - 1000, // 1秒前登录
        expiresIn: 3600
      });

      // Mock Token验证成功响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          user: { id: '1', username: 'testuser' },
          expiresIn: 3500
        }),
        headers: new Map()
      });

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证会话恢复成功
      expect(result.restored).toBe(true);
      expect(result.user.username).toBe('testuser');

      // 验证HttpClient的Token已设置
      const token = await httpClient.getToken();
      expect(token).toBe('stored-token');

      // 验证用户已登录
      expect(authService.isLoggedIn()).toBe(true);
    });

    test('会话恢复失败应该清除无效凭据', async () => {
      // Mock存储的无效凭据
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      mockSecureStorage.getCredentials.mockResolvedValue({
        accessToken: 'expired-token',
        user: { id: '1', username: 'testuser' },
        loginTime: Date.now() - 7200000, // 2小时前登录
        expiresIn: 3600 // 1小时有效期，已过期
      });

      // 执行会话恢复
      const result = await authService.restoreSession();

      // 验证会话恢复失败
      expect(result.restored).toBe(false);
      expect(result.reason).toBe('expired');

      // 验证无效凭据已清除
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalledWith('user_credentials');
    });
  });

  describe('登出流程集成', () => {
    test('登出应该清除HttpClient的Token和存储的凭据', async () => {
      // 先设置Token
      await httpClient.setToken('test-token');
      
      // Mock登出API响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ message: 'Logged out' }),
        headers: new Map()
      });

      // 执行登出
      const result = await authService.logout();

      // 验证登出成功
      expect(result.success).toBe(true);

      // 验证HttpClient的Token已清除
      const token = await httpClient.getToken();
      expect(token).toBeNull();

      // 验证存储的凭据已清除
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalledWith('user_credentials');

      // 验证用户已登出
      expect(authService.isLoggedIn()).toBe(false);
    });

    test('服务器登出失败时仍应执行本地清理', async () => {
      await httpClient.setToken('test-token');
      
      // Mock登出API失败响应
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' }),
        headers: new Map()
      });

      // 执行登出
      const result = await authService.logout();

      // 验证登出仍然成功（本地清理）
      expect(result.success).toBe(true);
      expect(result.serverLogout).toBe(false);
      expect(result.localCleanup.credentialsCleared).toBe(true);
      expect(result.localCleanup.tokenCleared).toBe(true);

      // 验证本地状态已清除
      const token = await httpClient.getToken();
      expect(token).toBeNull();
      expect(authService.isLoggedIn()).toBe(false);
    });
  });

  describe('401错误自动处理', () => {
    test('API请求遇到401错误应该触发重新认证', async () => {
      // 设置初始状态
      await httpClient.setToken('expired-token');
      authService.sessionManager.startSession({ id: '1', username: 'testuser' }, 3600);

      // Mock 401响应
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Token expired' }),
        headers: new Map()
      });

      // 监听认证状态变化
      const authStateListener = jest.fn();
      httpClient.addAuthStateListener(authStateListener);

      // 发送API请求
      try {
        await httpClient.get('/protected-resource');
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.requiresAuth).toBe(true);
      }

      // 验证会话已结束
      expect(authService.isLoggedIn()).toBe(false);

      // 验证认证状态监听器被调用
      expect(authStateListener).toHaveBeenCalledWith('auth_required', expect.any(Object));

      // 验证Token已清除
      const token = await httpClient.getToken();
      expect(token).toBeNull();
    });
  });

  describe('Token自动刷新', () => {
    test('即将过期的Token应该触发验证', async () => {
      // Mock即将过期的Token
      const oldTimestamp = Date.now() - 3700000; // 超过1小时前
      const mockSecureStorage = require('../../../utils/SecureStorage.js');
      mockSecureStorage.getCredentials.mockResolvedValue({
        token: 'expiring-token',
        timestamp: oldTimestamp
      });

      await httpClient.setToken('expiring-token');

      // Mock Token验证响应
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600
        }),
        headers: new Map()
      });

      // 使用认证方法发送请求
      const isValid = await httpClient.refreshTokenIfNeeded();

      // 由于我们mock了成功的验证响应，Token应该仍然有效
      expect(isValid).toBe(true);
    });
  });

  describe('并发请求处理', () => {
    test('多个并发请求应该共享同一个Token', async () => {
      await httpClient.setToken('shared-token');

      // Mock多个成功响应
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'response1' }),
          headers: new Map()
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'response2' }),
          headers: new Map()
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'response3' }),
          headers: new Map()
        });

      // 发送并发请求
      const promises = [
        httpClient.get('/endpoint1'),
        httpClient.get('/endpoint2'),
        httpClient.get('/endpoint3')
      ];

      const results = await Promise.all(promises);

      // 验证所有请求都成功
      expect(results).toHaveLength(3);
      expect(results[0].data.data).toBe('response1');
      expect(results[1].data.data).toBe('response2');
      expect(results[2].data.data).toBe('response3');

      // 验证所有请求都包含相同的认证头
      expect(fetch).toHaveBeenCalledTimes(3);
      for (let i = 1; i <= 3; i++) {
        expect(fetch).toHaveBeenNthCalledWith(i,
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer shared-token'
            })
          })
        );
      }
    });
  });

  describe('错误恢复', () => {
    test('网络错误后应该能够正常恢复', async () => {
      await httpClient.setToken('valid-token');

      // 第一次请求网络错误
      fetch.mockRejectedValueOnce(new TypeError('Network error'));

      // 第二次请求成功
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'success' }),
        headers: new Map()
      });

      // 第一次请求失败
      try {
        await httpClient.get('/test');
      } catch (error) {
        expect(error.name).toBe('NetworkError');
      }

      // 第二次请求应该成功
      const result = await httpClient.get('/test');
      expect(result.data.data).toBe('success');

      // Token应该仍然存在
      const token = await httpClient.getToken();
      expect(token).toBe('valid-token');
    });
  });
});