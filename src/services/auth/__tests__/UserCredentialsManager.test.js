import UserCredentialsManager from '../UserCredentialsManager.js';

// 模拟SecureStorage
const mockSecureStorage = {
  storeCredentials: jest.fn(),
  getCredentials: jest.fn(),
  removeCredentials: jest.fn(),
  hasCredentials: jest.fn()
};

describe('UserCredentialsManager', () => {
  let credentialsManager;
  
  beforeEach(() => {
    credentialsManager = new UserCredentialsManager(mockSecureStorage);
    jest.clearAllMocks();
  });
  
  describe('storeCredentials', () => {
    const mockCredentials = {
      username: 'testuser',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      user: { id: '1', username: 'testuser' },
      expiresIn: 3600,
      rememberMe: true
    };
    
    it('应该成功存储用户凭据', async () => {
      mockSecureStorage.storeCredentials.mockResolvedValue(true);
      
      const result = await credentialsManager.storeCredentials(mockCredentials);
      
      expect(result).toBe(true);
      expect(mockSecureStorage.storeCredentials).toHaveBeenCalledWith(
        'user_credentials',
        expect.objectContaining({
          username: 'testuser',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          user: { id: '1', username: 'testuser' },
          expiresIn: 3600,
          rememberMe: true,
          loginTime: expect.any(Number)
        })
      );
    });
    
    it('应该在存储失败时返回false', async () => {
      mockSecureStorage.storeCredentials.mockResolvedValue(false);
      
      const result = await credentialsManager.storeCredentials(mockCredentials);
      
      expect(result).toBe(false);
    });
    
    it('应该在发生异常时返回false', async () => {
      mockSecureStorage.storeCredentials.mockRejectedValue(new Error('存储错误'));
      
      const result = await credentialsManager.storeCredentials(mockCredentials);
      
      expect(result).toBe(false);
    });
    
    it('应该自动添加loginTime如果未提供', async () => {
      mockSecureStorage.storeCredentials.mockResolvedValue(true);
      const credentialsWithoutTime = { ...mockCredentials };
      delete credentialsWithoutTime.loginTime;
      
      await credentialsManager.storeCredentials(credentialsWithoutTime);
      
      expect(mockSecureStorage.storeCredentials).toHaveBeenCalledWith(
        'user_credentials',
        expect.objectContaining({
          loginTime: expect.any(Number)
        })
      );
    });
  });
  
  describe('getCredentials', () => {
    it('应该成功获取存储的凭据', async () => {
      const mockStoredCredentials = {
        username: 'testuser',
        accessToken: 'test-token'
      };
      mockSecureStorage.getCredentials.mockResolvedValue(mockStoredCredentials);
      
      const result = await credentialsManager.getCredentials();
      
      expect(result).toEqual(mockStoredCredentials);
      expect(mockSecureStorage.getCredentials).toHaveBeenCalledWith('user_credentials');
    });
    
    it('应该在没有凭据时返回null', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue(null);
      
      const result = await credentialsManager.getCredentials();
      
      expect(result).toBeNull();
    });
    
    it('应该在发生异常时返回null', async () => {
      mockSecureStorage.getCredentials.mockRejectedValue(new Error('获取错误'));
      
      const result = await credentialsManager.getCredentials();
      
      expect(result).toBeNull();
    });
  });
  
  describe('clearCredentials', () => {
    it('应该成功清除凭据', async () => {
      mockSecureStorage.removeCredentials.mockResolvedValue(true);
      
      const result = await credentialsManager.clearCredentials();
      
      expect(result).toBe(true);
      expect(mockSecureStorage.removeCredentials).toHaveBeenCalledWith('user_credentials');
    });
    
    it('应该在清除失败时返回false', async () => {
      mockSecureStorage.removeCredentials.mockResolvedValue(false);
      
      const result = await credentialsManager.clearCredentials();
      
      expect(result).toBe(false);
    });
    
    it('应该在发生异常时返回false', async () => {
      mockSecureStorage.removeCredentials.mockRejectedValue(new Error('清除错误'));
      
      const result = await credentialsManager.clearCredentials();
      
      expect(result).toBe(false);
    });
  });
  
  describe('hasCredentials', () => {
    it('应该检查凭据是否存在', async () => {
      mockSecureStorage.hasCredentials.mockResolvedValue(true);
      
      const result = await credentialsManager.hasCredentials();
      
      expect(result).toBe(true);
      expect(mockSecureStorage.hasCredentials).toHaveBeenCalledWith('user_credentials');
    });
  });
  
  describe('getStoredUsername', () => {
    it('应该返回存储的用户名', async () => {
      const mockCredentials = { username: 'testuser' };
      mockSecureStorage.getCredentials.mockResolvedValue(mockCredentials);
      
      const result = await credentialsManager.getStoredUsername();
      
      expect(result).toBe('testuser');
    });
    
    it('应该在没有凭据时返回null', async () => {
      mockSecureStorage.getCredentials.mockResolvedValue(null);
      
      const result = await credentialsManager.getStoredUsername();
      
      expect(result).toBeNull();
    });
    
    it('应该在发生异常时返回null', async () => {
      mockSecureStorage.getCredentials.mockRejectedValue(new Error('获取错误'));
      
      const result = await credentialsManager.getStoredUsername();
      
      expect(result).toBeNull();
    });
  });
});