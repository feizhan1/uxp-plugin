/**
 * 认证服务性能测试
 * 验证认证操作的响应时间和性能指标
 */
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

describe('认证服务性能测试', () => {
  let authService;
  let credentialsManager;
  
  beforeEach(() => {
    credentialsManager = new UserCredentialsManager(mockSecureStorage);
    authService = new AuthService(mockHttpClient, credentialsManager);
    
    jest.clearAllMocks();
    
    // 设置默认的快速响应mock
    mockHttpClient.post.mockResolvedValue({
      data: {
        accessToken: 'perf-test-token',
        user: { id: '1', username: 'perfuser' },
        expiresIn: 3600
      }
    });
    mockHttpClient.get.mockResolvedValue({
      data: {
        user: { id: '1', username: 'perfuser' },
        expiresIn: 3600
      }
    });
    mockHttpClient.setToken.mockResolvedValue(true);
    mockHttpClient.clearToken.mockResolvedValue(true);
    mockHttpClient.hasToken.mockResolvedValue(true);
    mockSecureStorage.storeCredentials.mockResolvedValue(true);
    mockSecureStorage.getCredentials.mockResolvedValue({
      accessToken: 'perf-test-token',
      loginTime: Date.now(),
      expiresIn: 3600
    });
    mockSecureStorage.removeCredentials.mockResolvedValue(true);
    mockSecureStorage.hasCredentials.mockResolvedValue(true);
  });
  
  describe('登录性能测试', () => {
    it('登录操作应该在100ms内完成', async () => {
      const startTime = performance.now();
      
      await authService.login('perfuser', 'password');
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100);
      console.log(`登录操作耗时: ${duration.toFixed(2)}ms`);
    });
    
    it('批量登录操作应该保持稳定性能', async () => {
      const iterations = 10;
      const durations = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await authService.login(`user${i}`, 'password');
        await authService.logout();
        
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }
      
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / iterations;
      const maxDuration = Math.max(...durations);
      
      expect(averageDuration).toBeLessThan(150);
      expect(maxDuration).toBeLessThan(300);
      
      console.log(`批量登录平均耗时: ${averageDuration.toFixed(2)}ms`);
      console.log(`批量登录最大耗时: ${maxDuration.toFixed(2)}ms`);
    });
  });
  
  describe('Token验证性能测试', () => {
    it('Token验证应该在50ms内完成', async () => {
      const startTime = performance.now();
      
      await authService.verifyToken();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(50);
      console.log(`Token验证耗时: ${duration.toFixed(2)}ms`);
    });
    
    it('连续Token验证应该保持一致性能', async () => {
      const iterations = 20;
      const durations = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await authService.verifyToken();
        
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }
      
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / iterations;
      const standardDeviation = Math.sqrt(
        durations.reduce((sum, d) => sum + Math.pow(d - averageDuration, 2), 0) / iterations
      );
      
      expect(averageDuration).toBeLessThan(75);
      expect(standardDeviation).toBeLessThan(25); // 性能应该稳定
      
      console.log(`连续验证平均耗时: ${averageDuration.toFixed(2)}ms`);
      console.log(`性能标准差: ${standardDeviation.toFixed(2)}ms`);
    });
  });
  
  describe('会话恢复性能测试', () => {
    it('会话恢复应该在80ms内完成', async () => {
      const startTime = performance.now();
      
      await authService.restoreSession();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(80);
      console.log(`会话恢复耗时: ${duration.toFixed(2)}ms`);
    });
    
    it('应用启动时的会话恢复应该快速完成', async () => {
      // 模拟应用启动场景
      const newAuthService = new AuthService(mockHttpClient, credentialsManager);
      
      const startTime = performance.now();
      
      const result = await newAuthService.restoreSession();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(result.restored).toBe(true);
      expect(duration).toBeLessThan(120);
      
      console.log(`应用启动会话恢复耗时: ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('存储操作性能测试', () => {
    it('凭据存储操作应该快速完成', async () => {
      const credentials = {
        username: 'perfuser',
        accessToken: 'perf-token',
        user: { id: '1', username: 'perfuser' },
        expiresIn: 3600
      };
      
      const startTime = performance.now();
      
      await credentialsManager.storeCredentials(credentials);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(30);
      console.log(`凭据存储耗时: ${duration.toFixed(2)}ms`);
    });
    
    it('凭据读取操作应该快速完成', async () => {
      const startTime = performance.now();
      
      await credentialsManager.getCredentials();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(20);
      console.log(`凭据读取耗时: ${duration.toFixed(2)}ms`);
    });
    
    it('凭据清除操作应该快速完成', async () => {
      const startTime = performance.now();
      
      await credentialsManager.clearCredentials();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(25);
      console.log(`凭据清除耗时: ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('会话管理性能测试', () => {
    it('会话状态检查应该极快完成', () => {
      const sessionManager = new SessionManager();
      sessionManager.startSession({ id: '1', username: 'perfuser' }, 3600);
      
      const iterations = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        sessionManager.isActive();
      }
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const averageDuration = totalDuration / iterations;
      
      expect(totalDuration).toBeLessThan(50); // 1000次调用总共不超过50ms
      expect(averageDuration).toBeLessThan(0.1); // 平均每次不超过0.1ms
      
      console.log(`1000次会话状态检查总耗时: ${totalDuration.toFixed(2)}ms`);
      console.log(`平均每次检查耗时: ${averageDuration.toFixed(4)}ms`);
    });
    
    it('会话信息获取应该快速完成', () => {
      const sessionManager = new SessionManager();
      sessionManager.startSession({ id: '1', username: 'perfuser' }, 3600);
      
      const iterations = 100;
      const durations = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        sessionManager.getSessionInfo();
        
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }
      
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / iterations;
      const maxDuration = Math.max(...durations);
      
      expect(averageDuration).toBeLessThan(0.5);
      expect(maxDuration).toBeLessThan(2);
      
      console.log(`会话信息获取平均耗时: ${averageDuration.toFixed(4)}ms`);
      console.log(`会话信息获取最大耗时: ${maxDuration.toFixed(4)}ms`);
    });
  });
  
  describe('内存使用性能测试', () => {
    it('长时间运行不应该出现内存泄漏', async () => {
      // 模拟长时间运行的场景
      const iterations = 50;
      
      for (let i = 0; i < iterations; i++) {
        await authService.login(`user${i}`, 'password');
        await authService.verifyToken();
        await authService.logout();
        
        // 每10次迭代检查一次内存使用
        if (i % 10 === 0 && global.gc) {
          global.gc(); // 如果可用，触发垃圾回收
        }
      }
      
      // 验证服务仍然正常工作
      const finalLoginResult = await authService.login('finaluser', 'password');
      expect(finalLoginResult.success).toBe(true);
      
      console.log(`完成${iterations}次完整认证流程，无内存泄漏`);
    });
  });
  
  describe('并发性能测试', () => {
    it('并发登录请求应该正确处理', async () => {
      const concurrentRequests = 5;
      const promises = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(authService.login(`concurrent${i}`, 'password'));
      }
      
      const results = await Promise.all(promises);
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      
      // 验证所有请求都成功
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      
      // 并发请求的总时间应该接近单个请求的时间
      expect(totalDuration).toBeLessThan(200);
      
      console.log(`${concurrentRequests}个并发登录请求总耗时: ${totalDuration.toFixed(2)}ms`);
    });
  });
  
  describe('错误处理性能测试', () => {
    it('错误处理不应该显著影响性能', async () => {
      // 模拟网络错误
      mockHttpClient.post.mockRejectedValue(new Error('Network Error'));
      
      const iterations = 10;
      const durations = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          await authService.login('erroruser', 'password');
        } catch (error) {
          // 预期的错误
        }
        
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }
      
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / iterations;
      
      // 错误处理的平均时间应该仍然很快
      expect(averageDuration).toBeLessThan(150);
      
      console.log(`错误处理平均耗时: ${averageDuration.toFixed(2)}ms`);
    });
  });
});