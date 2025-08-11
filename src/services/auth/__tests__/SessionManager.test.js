import SessionManager from '../SessionManager.js';

describe('SessionManager', () => {
  let sessionManager;
  let mockListener;
  
  beforeEach(() => {
    sessionManager = new SessionManager();
    mockListener = jest.fn();
    jest.clearAllMocks();
  });
  
  describe('startSession', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该成功启动会话', () => {
      sessionManager.addSessionListener(mockListener);
      
      sessionManager.startSession(mockUser, 3600);
      
      expect(sessionManager.getCurrentUser()).toEqual(mockUser);
      expect(sessionManager.isActive()).toBe(true);
      expect(sessionManager.sessionStartTime).toBeGreaterThan(0);
      expect(sessionManager.sessionExpiresAt).toBeGreaterThan(Date.now());
      expect(mockListener).toHaveBeenCalledWith('started', mockUser);
    });
    
    it('应该在没有过期时间时正确启动会话', () => {
      sessionManager.startSession(mockUser);
      
      expect(sessionManager.getCurrentUser()).toEqual(mockUser);
      expect(sessionManager.isActive()).toBe(true);
      expect(sessionManager.sessionExpiresAt).toBeNull();
    });
  });
  
  describe('restoreSession', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该成功恢复会话', () => {
      sessionManager.addSessionListener(mockListener);
      
      sessionManager.restoreSession(mockUser, 3600);
      
      expect(sessionManager.getCurrentUser()).toEqual(mockUser);
      expect(sessionManager.isActive()).toBe(true);
      expect(mockListener).toHaveBeenCalledWith('restored', mockUser);
    });
  });
  
  describe('endSession', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该成功结束会话', () => {
      sessionManager.addSessionListener(mockListener);
      sessionManager.startSession(mockUser, 3600);
      
      sessionManager.endSession();
      
      expect(sessionManager.getCurrentUser()).toBeNull();
      expect(sessionManager.isActive()).toBe(false);
      expect(sessionManager.sessionStartTime).toBeNull();
      expect(sessionManager.sessionExpiresAt).toBeNull();
      expect(mockListener).toHaveBeenCalledWith('ended', mockUser);
    });
  });
  
  describe('isActive', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该在会话活跃时返回true', () => {
      sessionManager.startSession(mockUser, 3600);
      
      expect(sessionManager.isActive()).toBe(true);
    });
    
    it('应该在会话未启动时返回false', () => {
      expect(sessionManager.isActive()).toBe(false);
    });
    
    it('应该在会话过期时自动结束会话并返回false', () => {
      sessionManager.addSessionListener(mockListener);
      // 设置一个已过期的会话
      sessionManager.startSession(mockUser, -1); // 负数表示已过期
      
      const isActive = sessionManager.isActive();
      
      expect(isActive).toBe(false);
      expect(sessionManager.getCurrentUser()).toBeNull();
      expect(mockListener).toHaveBeenCalledWith('ended', mockUser);
    });
  });
  
  describe('getSessionInfo', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该返回完整的会话信息', () => {
      sessionManager.startSession(mockUser, 3600);
      
      const sessionInfo = sessionManager.getSessionInfo();
      
      expect(sessionInfo).toEqual({
        user: mockUser,
        startTime: expect.any(Number),
        expiresAt: expect.any(Number),
        isActive: true,
        duration: expect.any(Number)
      });
    });
    
    it('应该在没有会话时返回空信息', () => {
      const sessionInfo = sessionManager.getSessionInfo();
      
      expect(sessionInfo).toEqual({
        user: null,
        startTime: null,
        expiresAt: null,
        isActive: false,
        duration: 0
      });
    });
  });
  
  describe('会话监听器管理', () => {
    it('应该能够添加和移除监听器', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      sessionManager.addSessionListener(listener1);
      sessionManager.addSessionListener(listener2);
      
      sessionManager.startSession({ id: '1' }, 3600);
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      
      sessionManager.removeSessionListener(listener1);
      sessionManager.endSession();
      
      expect(listener1).toHaveBeenCalledTimes(1); // 只被调用一次（startSession时）
      expect(listener2).toHaveBeenCalledTimes(2); // 被调用两次（start和end）
    });
    
    it('应该处理监听器执行中的异常', () => {
      const errorListener = jest.fn(() => {
        throw new Error('监听器错误');
      });
      const normalListener = jest.fn();
      
      sessionManager.addSessionListener(errorListener);
      sessionManager.addSessionListener(normalListener);
      
      // 不应该因为一个监听器出错而影响其他监听器
      expect(() => {
        sessionManager.startSession({ id: '1' }, 3600);
      }).not.toThrow();
      
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });
  
  describe('isSessionExpiringSoon', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该在会话即将过期时返回true', () => {
      // 设置一个4分钟后过期的会话
      sessionManager.startSession(mockUser, 240); // 4分钟 = 240秒
      
      const isExpiringSoon = sessionManager.isSessionExpiringSoon(5); // 5分钟警告
      
      expect(isExpiringSoon).toBe(true);
    });
    
    it('应该在会话还有很长时间时返回false', () => {
      // 设置一个1小时后过期的会话
      sessionManager.startSession(mockUser, 3600);
      
      const isExpiringSoon = sessionManager.isSessionExpiringSoon(5);
      
      expect(isExpiringSoon).toBe(false);
    });
    
    it('应该在没有过期时间时返回false', () => {
      sessionManager.startSession(mockUser); // 无过期时间
      
      const isExpiringSoon = sessionManager.isSessionExpiringSoon(5);
      
      expect(isExpiringSoon).toBe(false);
    });
  });
  
  describe('getTimeUntilExpiry', () => {
    const mockUser = { id: '1', username: 'testuser' };
    
    it('应该返回正确的剩余时间', () => {
      sessionManager.startSession(mockUser, 3600); // 1小时
      
      const timeUntilExpiry = sessionManager.getTimeUntilExpiry();
      
      expect(timeUntilExpiry).toBeGreaterThan(3590000); // 应该接近1小时（毫秒）
      expect(timeUntilExpiry).toBeLessThanOrEqual(3600000);
    });
    
    it('应该在没有过期时间时返回-1', () => {
      sessionManager.startSession(mockUser); // 无过期时间
      
      const timeUntilExpiry = sessionManager.getTimeUntilExpiry();
      
      expect(timeUntilExpiry).toBe(-1);
    });
    
    it('应该在已过期时返回0', () => {
      sessionManager.startSession(mockUser, -1); // 已过期
      
      const timeUntilExpiry = sessionManager.getTimeUntilExpiry();
      
      expect(timeUntilExpiry).toBe(0);
    });
  });
});