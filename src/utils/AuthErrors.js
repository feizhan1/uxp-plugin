/**
 * 身份验证相关错误类定义
 * 提供详细的错误分类和用户友好的错误消息
 */

/**
 * 基础认证错误类
 */
class AuthError extends Error {
  constructor(message, code, field = null, details = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.field = field;
    this.details = details;
    this.timestamp = Date.now();
    this.userFriendly = true;
    
    // 确保错误堆栈正确
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /**
   * 转换为用户友好的错误信息
   * @returns {Object} 用户友好的错误信息
   */
  toUserFriendly() {
    return {
      message: this.message,
      code: this.code,
      field: this.field,
      suggestion: this.getSuggestion(),
      severity: this.getSeverity(),
      icon: this.getIcon(),
      retry: this.canRetry(),
      timestamp: this.timestamp
    };
  }

  /**
   * 获取错误建议
   * @returns {string} 建议信息
   */
  getSuggestion() {
    const suggestions = {
      'INVALID_CREDENTIALS': '请检查用户名和密码是否正确',
      'ACCOUNT_DISABLED': '请联系管理员解除账户限制',
      'RATE_LIMITED': '请稍后再试，避免频繁登录',
      'NETWORK_ERROR': '请检查网络连接后重试',
      'SERVER_ERROR': '服务器暂时不可用，请稍后重试',
      'VALIDATION_ERROR': '请检查输入的信息格式',
      'TOKEN_EXPIRED': '请重新登录',
      'INSUFFICIENT_PERMISSIONS': '请联系管理员获取相应权限'
    };
    
    return suggestions[this.code] || '请稍后重试或联系技术支持';
  }

  /**
   * 获取错误严重程度
   * @returns {string} 严重程度
   */
  getSeverity() {
    const severities = {
      'INVALID_CREDENTIALS': 'warning',
      'ACCOUNT_DISABLED': 'error',
      'RATE_LIMITED': 'warning',
      'NETWORK_ERROR': 'error',
      'SERVER_ERROR': 'error',
      'VALIDATION_ERROR': 'warning',
      'TOKEN_EXPIRED': 'info',
      'INSUFFICIENT_PERMISSIONS': 'error'
    };
    
    return severities[this.code] || 'error';
  }

  /**
   * 获取错误图标
   * @returns {string} 图标名称
   */
  getIcon() {
    const icons = {
      'INVALID_CREDENTIALS': 'ui:KeySmall',
      'ACCOUNT_DISABLED': 'ui:LockSmall',
      'RATE_LIMITED': 'ui:ClockSmall',
      'NETWORK_ERROR': 'ui:AlertSmall',
      'SERVER_ERROR': 'ui:ServerSmall',
      'VALIDATION_ERROR': 'ui:CheckmarkSmall',
      'TOKEN_EXPIRED': 'ui:RefreshSmall',
      'INSUFFICIENT_PERMISSIONS': 'ui:UserSmall'
    };
    
    return icons[this.code] || 'ui:AlertSmall';
  }

  /**
   * 判断是否可以重试
   * @returns {boolean} 是否可以重试
   */
  canRetry() {
    const retryableCodes = [
      'NETWORK_ERROR',
      'SERVER_ERROR',
      'TIMEOUT_ERROR'
    ];
    
    return retryableCodes.includes(this.code);
  }
}

/**
 * 登录凭据错误
 */
class CredentialsError extends AuthError {
  constructor(message, field = null, details = {}) {
    super(message, 'INVALID_CREDENTIALS', field, details);
    this.name = 'CredentialsError';
  }
}

/**
 * 账户状态错误
 */
class AccountError extends AuthError {
  constructor(message, code = 'ACCOUNT_ERROR', details = {}) {
    super(message, code, null, details);
    this.name = 'AccountError';
  }
}

/**
 * 频率限制错误
 */
class RateLimitError extends AuthError {
  constructor(message, retryAfter = 60, details = {}) {
    super(message, 'RATE_LIMITED', null, { retryAfter, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }

  /**
   * 获取重试延迟时间
   * @returns {number} 延迟时间（秒）
   */
  getRetryDelay() {
    return this.retryAfter;
  }

  /**
   * 获取格式化的等待时间
   * @returns {string} 格式化的等待时间
   */
  getFormattedWaitTime() {
    const seconds = this.retryAfter;
    if (seconds < 60) {
      return `${seconds} 秒`;
    } else if (seconds < 3600) {
      return `${Math.ceil(seconds / 60)} 分钟`;
    } else {
      return `${Math.ceil(seconds / 3600)} 小时`;
    }
  }
}

/**
 * 网络错误
 */
class NetworkError extends AuthError {
  constructor(message, originalError = null, details = {}) {
    super(message, 'NETWORK_ERROR', null, { originalError, ...details });
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * 服务器错误
 */
class ServerError extends AuthError {
  constructor(message, status = 500, details = {}) {
    super(message, 'SERVER_ERROR', null, { status, ...details });
    this.name = 'ServerError';
    this.status = status;
  }
}

/**
 * Token相关错误
 */
class TokenError extends AuthError {
  constructor(message, code = 'TOKEN_ERROR', details = {}) {
    super(message, code, null, details);
    this.name = 'TokenError';
  }
}

/**
 * 验证错误
 */
class ValidationError extends AuthError {
  constructor(message, field, value = null, details = {}) {
    super(message, 'VALIDATION_ERROR', field, { value, ...details });
    this.name = 'ValidationError';
    this.value = value;
  }
}

/**
 * 权限错误
 */
class PermissionError extends AuthError {
  constructor(message, requiredPermission = null, details = {}) {
    super(message, 'INSUFFICIENT_PERMISSIONS', null, { requiredPermission, ...details });
    this.name = 'PermissionError';
    this.requiredPermission = requiredPermission;
  }
}

/**
 * 会话错误
 */
class SessionError extends AuthError {
  constructor(message, code = 'SESSION_ERROR', details = {}) {
    super(message, code, null, details);
    this.name = 'SessionError';
  }
}

/**
 * 存储错误
 */
class StorageError extends AuthError {
  constructor(message, operation = null, details = {}) {
    super(message, 'STORAGE_ERROR', null, { operation, ...details });
    this.name = 'StorageError';
    this.operation = operation;
  }
}

/**
 * 错误工厂类
 * 根据不同情况创建相应的错误对象
 */
class AuthErrorFactory {
  /**
   * 根据HTTP状态码创建错误
   * @param {number} status - HTTP状态码
   * @param {string} message - 错误消息
   * @param {Object} details - 额外详情
   * @returns {AuthError} 错误对象
   */
  static fromHttpStatus(status, message, details = {}) {
    switch (status) {
      case 401:
        return new CredentialsError(message || '用户名或密码错误', null, details);
      case 403:
        if (details.reason === 'account_disabled') {
          return new AccountError('账户已被禁用，请联系管理员', 'ACCOUNT_DISABLED', details);
        }
        return new PermissionError(message || '访问被拒绝', null, details);
      case 429:
        const retryAfter = details.retryAfter || 60;
        return new RateLimitError(
          message || '登录尝试过于频繁，请稍后重试',
          retryAfter,
          details
        );
      case 422:
        return new ValidationError(message || '输入数据格式错误', details.field, details.value, details);
      case 500:
      case 502:
      case 503:
      case 504:
        return new ServerError(message || '服务器内部错误', status, details);
      default:
        return new AuthError(message || '未知错误', 'UNKNOWN_ERROR', null, { status, ...details });
    }
  }

  /**
   * 根据网络错误创建错误
   * @param {Error} networkError - 网络错误
   * @param {Object} details - 额外详情
   * @returns {NetworkError} 网络错误对象
   */
  static fromNetworkError(networkError, details = {}) {
    let message = '网络连接失败';
    
    if (networkError.name === 'TimeoutError') {
      message = '请求超时';
    } else if (networkError.message.includes('fetch')) {
      message = '网络请求失败';
    } else if (networkError.message.includes('CORS')) {
      message = '跨域请求被阻止';
    }
    
    return new NetworkError(message, networkError, details);
  }

  /**
   * 根据验证失败创建错误
   * @param {string} field - 字段名
   * @param {string} value - 字段值
   * @param {string} rule - 验证规则
   * @param {Object} details - 额外详情
   * @returns {ValidationError} 验证错误对象
   */
  static fromValidation(field, value, rule, details = {}) {
    const messages = {
      'required': `${this.getFieldDisplayName(field)}不能为空`,
      'minLength': `${this.getFieldDisplayName(field)}长度不能少于${details.minLength}个字符`,
      'maxLength': `${this.getFieldDisplayName(field)}长度不能超过${details.maxLength}个字符`,
      'pattern': `${this.getFieldDisplayName(field)}格式不正确`,
      'email': '邮箱格式不正确',
      'password': '密码强度不足'
    };
    
    const message = messages[rule] || `${this.getFieldDisplayName(field)}验证失败`;
    return new ValidationError(message, field, value, { rule, ...details });
  }

  /**
   * 获取字段显示名称
   * @param {string} field - 字段名
   * @returns {string} 显示名称
   */
  static getFieldDisplayName(field) {
    const displayNames = {
      'username': '用户名',
      'password': '密码',
      'email': '邮箱',
      'phone': '手机号',
      'code': '验证码'
    };
    
    return displayNames[field] || field;
  }

  /**
   * 根据Token错误创建错误
   * @param {string} reason - 错误原因
   * @param {Object} details - 额外详情
   * @returns {TokenError} Token错误对象
   */
  static fromTokenError(reason, details = {}) {
    const messages = {
      'expired': 'Token已过期，请重新登录',
      'invalid': 'Token无效，请重新登录',
      'missing': '缺少访问Token',
      'malformed': 'Token格式错误'
    };
    
    const codes = {
      'expired': 'TOKEN_EXPIRED',
      'invalid': 'TOKEN_INVALID',
      'missing': 'TOKEN_MISSING',
      'malformed': 'TOKEN_MALFORMED'
    };
    
    const message = messages[reason] || 'Token错误';
    const code = codes[reason] || 'TOKEN_ERROR';
    
    return new TokenError(message, code, details);
  }

  /**
   * 根据存储错误创建错误
   * @param {string} operation - 操作类型
   * @param {Error} originalError - 原始错误
   * @param {Object} details - 额外详情
   * @returns {StorageError} 存储错误对象
   */
  static fromStorageError(operation, originalError, details = {}) {
    const messages = {
      'store': '数据存储失败',
      'retrieve': '数据读取失败',
      'remove': '数据删除失败',
      'encrypt': '数据加密失败',
      'decrypt': '数据解密失败'
    };
    
    const message = messages[operation] || '存储操作失败';
    return new StorageError(message, operation, { originalError, ...details });
  }
}

/**
 * 错误处理工具函数
 */
class AuthErrorHandler {
  /**
   * 处理认证错误并返回用户友好的信息
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   * @returns {Object} 处理后的错误信息
   */
  static handle(error, context = {}) {
    try {
      // 如果已经是AuthError，直接返回用户友好信息
      if (error instanceof AuthError) {
        return {
          ...error.toUserFriendly(),
          context
        };
      }

      // 根据错误类型转换为AuthError
      let authError;
      
      if (error.status) {
        // HTTP错误
        authError = AuthErrorFactory.fromHttpStatus(error.status, error.message, {
          originalError: error,
          ...context
        });
      } else if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
        // 网络错误
        authError = AuthErrorFactory.fromNetworkError(error, context);
      } else {
        // 其他错误
        authError = new AuthError(
          error.message || '未知错误',
          'UNKNOWN_ERROR',
          null,
          { originalError: error, ...context }
        );
      }

      return {
        ...authError.toUserFriendly(),
        context
      };
    } catch (handlerError) {
      console.error('错误处理器异常:', handlerError);
      
      // 最后的安全网
      return {
        message: '系统发生错误，请稍后重试',
        code: 'HANDLER_ERROR',
        suggestion: '请刷新页面或联系技术支持',
        severity: 'error',
        icon: 'ui:AlertSmall',
        retry: true,
        timestamp: Date.now(),
        context: { handlerError: handlerError.message, ...context }
      };
    }
  }

  /**
   * 记录错误到控制台和存储
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   */
  static log(error, context = {}) {
    try {
      const errorInfo = this.handle(error, context);
      
      // 控制台记录
      console.group(`🔐 认证错误: ${errorInfo.code}`);
      console.error('错误消息:', errorInfo.message);
      console.log('错误详情:', errorInfo);
      console.log('上下文:', context);
      if (error.stack) {
        console.log('错误堆栈:', error.stack);
      }
      console.groupEnd();

      // 存储错误日志（用于调试）
      this.storeErrorLog(errorInfo, error);
    } catch (logError) {
      console.error('记录认证错误失败:', logError);
    }
  }

  /**
   * 存储错误日志
   * @param {Object} errorInfo - 错误信息
   * @param {Error} originalError - 原始错误
   */
  static storeErrorLog(errorInfo, originalError) {
    try {
      const logEntry = {
        ...errorInfo,
        stack: originalError.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: Date.now()
      };

      const existingLogs = JSON.parse(localStorage.getItem('auth_error_logs') || '[]');
      existingLogs.push(logEntry);

      // 只保留最近的20条错误日志
      if (existingLogs.length > 20) {
        existingLogs.splice(0, existingLogs.length - 20);
      }

      localStorage.setItem('auth_error_logs', JSON.stringify(existingLogs));
    } catch (storeError) {
      console.error('存储错误日志失败:', storeError);
    }
  }

  /**
   * 获取存储的错误日志
   * @returns {Array} 错误日志数组
   */
  static getStoredLogs() {
    try {
      return JSON.parse(localStorage.getItem('auth_error_logs') || '[]');
    } catch (error) {
      console.error('获取错误日志失败:', error);
      return [];
    }
  }

  /**
   * 清除存储的错误日志
   */
  static clearStoredLogs() {
    try {
      localStorage.removeItem('auth_error_logs');
    } catch (error) {
      console.error('清除错误日志失败:', error);
    }
  }
}

export {
  AuthError,
  CredentialsError,
  AccountError,
  RateLimitError,
  NetworkError,
  ServerError,
  TokenError,
  ValidationError,
  PermissionError,
  SessionError,
  StorageError,
  AuthErrorFactory,
  AuthErrorHandler
};