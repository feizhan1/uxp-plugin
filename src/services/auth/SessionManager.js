/**
 * 会话管理器
 * 负责管理用户会话状态、过期检测和会话监听器
 */
class SessionManager {
  constructor() {
    this.currentUser = null;
    this.sessionStartTime = null;
    this.sessionExpiresAt = null;
    this.isSessionActive = false;
    this.sessionListeners = [];
  }
  
  /**
   * 启动新会话
   * @param {Object} user - 用户信息对象
   * @param {number} expiresIn - 会话过期时间（秒）
   */
  startSession(username, expiresIn) {
    this.currentUser = username;
    this.sessionStartTime = Date.now();
    this.sessionExpiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : null;
    this.isSessionActive = true;
    
    console.log('会话已启动:', username);
    this.notifySessionChange('started', username);
  }
  
  /**
   * 恢复已存在的会话
   * @param {Object} username - 用户信息对象
   * @param {number} expiresIn - 会话过期时间（秒）
   */
  restoreSession(username, expiresIn) {
    this.currentUser = username;
    this.sessionStartTime = Date.now(); // 重置会话开始时间
    this.sessionExpiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : null;
    this.isSessionActive = true;
    
    console.log('会话已恢复:', username);
    this.notifySessionChange('restored', username);
  }
  
  /**
   * 结束当前会话
   */
  endSession() {
    const previousUser = this.currentUser;
    
    this.currentUser = null;
    this.sessionStartTime = null;
    this.sessionExpiresAt = null;
    this.isSessionActive = false;
    
    console.log('会话已结束');
    this.notifySessionChange('ended', previousUser);
  }
  
  /**
   * 获取当前用户信息
   * @returns {Object|null} 当前用户对象或null
   */
  getCurrentUser() {
    return this.currentUser;
  }
  
  /**
   * 检查会话是否处于活跃状态
   * @returns {boolean} 会话是否活跃
   */
  isActive() {
    if (!this.isSessionActive) {
      return false;
    }
    
    // 检查会话是否过期
    if (this.sessionExpiresAt && Date.now() >= this.sessionExpiresAt) {
      this.endSession();
      return false;
    }
    
    return true;
  }
  
  /**
   * 获取会话详细信息
   * @returns {Object} 会话信息对象
   */
  getSessionInfo() {
    return {
      user: this.currentUser,
      startTime: this.sessionStartTime,
      expiresAt: this.sessionExpiresAt,
      isActive: this.isActive(),
      duration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0
    };
  }
  
  /**
   * 添加会话状态变化监听器
   * @param {Function} listener - 监听器函数
   */
  addSessionListener(listener) {
    this.sessionListeners.push(listener);
  }
  
  /**
   * 移除会话状态变化监听器
   * @param {Function} listener - 要移除的监听器函数
   */
  removeSessionListener(listener) {
    const index = this.sessionListeners.indexOf(listener);
    if (index > -1) {
      this.sessionListeners.splice(index, 1);
    }
  }
  
  /**
   * 通知所有监听器会话状态变化
   * @param {string} event - 事件类型 ('started', 'restored', 'ended', 'expiring_soon')
   * @param {Object} user - 相关用户对象
   */
  notifySessionChange(event, user) {
    this.sessionListeners.forEach(listener => {
      try {
        listener(event, user);
      } catch (error) {
        console.error('会话监听器执行失败:', error);
      }
    });
  }
  
  /**
   * 检查会话是否即将过期
   * @param {number} warningMinutes - 提前警告的分钟数，默认5分钟
   * @returns {boolean} 是否即将过期
   */
  isSessionExpiringSoon(warningMinutes = 5) {
    if (!this.sessionExpiresAt) {
      return false;
    }
    
    const warningTime = warningMinutes * 60 * 1000; // 转换为毫秒
    const timeUntilExpiry = this.sessionExpiresAt - Date.now();
    
    return timeUntilExpiry > 0 && timeUntilExpiry <= warningTime;
  }
  
  /**
   * 获取会话剩余时间（毫秒）
   * @returns {number} 剩余时间，如果已过期或无过期时间则返回0或-1
   */
  getTimeUntilExpiry() {
    if (!this.sessionExpiresAt) {
      return -1; // 无过期时间
    }
    
    const remaining = this.sessionExpiresAt - Date.now();
    return Math.max(0, remaining);
  }
}

export default SessionManager;