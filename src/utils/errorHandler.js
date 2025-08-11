/**
 * 错误处理工具类
 * 提供统一的错误分类和处理策略
 */

/**
 * 错误类型枚举
 */
export const ErrorTypes = {
  NETWORK_ERROR: 'NetworkError',
  TIMEOUT_ERROR: 'TimeoutError',
  HTTP_ERROR: 'HttpError',
  AUTH_ERROR: 'AuthError',
  PARSE_ERROR: 'ParseError',
  VALIDATION_ERROR: 'ValidationError',
  CONFIG_ERROR: 'ConfigError',
  RATE_LIMIT_ERROR: 'RateLimitError',
  SERVER_ERROR: 'ServerError',
  CLIENT_ERROR: 'ClientError'
};

/**
 * 错误处理策略配置
 */
export const errorHandlers = {
  [ErrorTypes.NETWORK_ERROR]: (error) => ({
    message: '网络连接失败，请检查网络设置',
    suggestion: '请检查网络连接或稍后重试',
    retry: true,
    delay: 5000,
    userFriendly: true,
    severity: 'error',
    icon: 'ui:AlertSmall'
  }),
  
  [ErrorTypes.TIMEOUT_ERROR]: (error) => ({
    message: '请求超时，请稍后重试',
    suggestion: '网络较慢或服务器响应缓慢，建议稍后重试',
    retry: true,
    delay: 3000,
    userFriendly: true,
    severity: 'warning',
    icon: 'ui:ClockSmall'
  }),
  
  [ErrorTypes.HTTP_ERROR]: (error) => {
    if (error.status >= 500) {
      return {
        message: '服务器内部错误',
        suggestion: '服务器暂时不可用，请稍后重试',
        retry: true,
        delay: 10000,
        userFriendly: true,
        severity: 'error',
        icon: 'ui:ServerSmall'
      };
    } else if (error.status === 404) {
      return {
        message: '请求的资源不存在',
        suggestion: '请检查API端点地址是否正确',
        retry: false,
        userFriendly: true,
        severity: 'warning',
        icon: 'ui:SearchSmall'
      };
    } else if (error.status === 403) {
      return {
        message: '访问被拒绝',
        suggestion: '您没有权限访问此资源，请检查Token权限',
        retry: false,
        userFriendly: true,
        severity: 'error',
        icon: 'ui:LockSmall'
      };
    } else if (error.status >= 400) {
      return {
        message: `客户端请求错误 (${error.status})`,
        suggestion: '请检查请求参数和格式',
        retry: false,
        userFriendly: true,
        severity: 'warning',
        icon: 'ui:AlertSmall'
      };
    }
    return {
      message: `HTTP错误: ${error.message}`,
      suggestion: '请联系技术支持',
      retry: false,
      userFriendly: false,
      severity: 'error',
      icon: 'ui:AlertSmall'
    };
  },
  
  [ErrorTypes.AUTH_ERROR]: (error) => ({
    message: '认证失败',
    suggestion: '请检查访问Token是否正确或已过期',
    retry: false,
    userFriendly: true,
    requiresAuth: true,
    severity: 'error',
    icon: 'ui:KeySmall'
  }),
  
  [ErrorTypes.PARSE_ERROR]: (error) => ({
    message: '数据格式错误',
    suggestion: '服务器返回的数据格式不正确，请联系技术支持',
    retry: false,
    userFriendly: true,
    severity: 'error',
    icon: 'ui:DataSmall'
  }),
  
  [ErrorTypes.VALIDATION_ERROR]: (error) => ({
    message: '输入验证失败',
    suggestion: '请检查输入的数据格式和内容',
    retry: false,
    userFriendly: true,
    severity: 'warning',
    icon: 'ui:CheckmarkSmall'
  }),
  
  [ErrorTypes.CONFIG_ERROR]: (error) => ({
    message: '配置错误',
    suggestion: '请检查API配置是否正确',
    retry: false,
    userFriendly: true,
    severity: 'error',
    icon: 'ui:SettingsSmall'
  }),
  
  [ErrorTypes.RATE_LIMIT_ERROR]: (error) => ({
    message: '请求频率过高',
    suggestion: '请稍后再试，避免频繁请求',
    retry: true,
    delay: 30000,
    userFriendly: true,
    severity: 'warning',
    icon: 'ui:SpeedSmall'
  }),
  
  [ErrorTypes.SERVER_ERROR]: (error) => ({
    message: '服务器错误',
    suggestion: '服务器暂时不可用，请稍后重试',
    retry: true,
    delay: 15000,
    userFriendly: true,
    severity: 'error',
    icon: 'ui:ServerSmall'
  }),
  
  [ErrorTypes.CLIENT_ERROR]: (error) => ({
    message: '客户端错误',
    suggestion: '请检查请求参数和配置',
    retry: false,
    userFriendly: true,
    severity: 'warning',
    icon: 'ui:DeviceSmall'
  })
};

/**
 * 处理API错误
 * @param {Error} error - 错误对象
 * @returns {Object} 处理后的错误信息
 */
export function handleApiError(error) {
  console.error('API错误:', error);
  
  // 确定错误类型
  let errorType = ErrorTypes.HTTP_ERROR;
  
  if (error.name === 'NetworkError' || error.code === 'NETWORK_ERROR') {
    errorType = ErrorTypes.NETWORK_ERROR;
  } else if (error.name === 'TimeoutError' || error.code === 'TIMEOUT') {
    errorType = ErrorTypes.TIMEOUT_ERROR;
  } else if (error.authError || error.status === 401) {
    errorType = ErrorTypes.AUTH_ERROR;
  } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    errorType = ErrorTypes.PARSE_ERROR;
  } else if (error.name === 'ValidationError') {
    errorType = ErrorTypes.VALIDATION_ERROR;
  } else if (error.name === 'ConfigError') {
    errorType = ErrorTypes.CONFIG_ERROR;
  } else if (error.status === 429) {
    errorType = ErrorTypes.RATE_LIMIT_ERROR;
  } else if (error.status >= 500) {
    errorType = ErrorTypes.SERVER_ERROR;
  } else if (error.status >= 400) {
    errorType = ErrorTypes.CLIENT_ERROR;
  }
  
  // 获取错误处理策略
  const handler = errorHandlers[errorType];
  const errorInfo = handler ? handler(error) : {
    message: error.message || '未知错误',
    suggestion: '请联系技术支持',
    retry: false,
    userFriendly: false,
    severity: 'error',
    icon: 'ui:AlertSmall'
  };
  
  return {
    ...errorInfo,
    type: errorType,
    originalError: error,
    timestamp: new Date().toISOString(),
    requestId: error.requestId || generateRequestId()
  };
}

/**
 * 生成请求ID
 * @returns {string} 请求ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化用户友好的错误消息
 * @param {Error} error - 错误对象
 * @returns {string} 用户友好的错误消息
 */
export function formatUserError(error) {
  const errorInfo = handleApiError(error);
  return errorInfo.userFriendly ? errorInfo.message : '操作失败，请稍后重试';
}

/**
 * 检查错误是否可以重试
 * @param {Error} error - 错误对象
 * @returns {boolean} 是否可以重试
 */
export function canRetry(error) {
  const errorInfo = handleApiError(error);
  return errorInfo.retry;
}

/**
 * 获取重试延迟时间
 * @param {Error} error - 错误对象
 * @param {number} attempt - 重试次数
 * @returns {number} 延迟时间（毫秒）
 */
export function getRetryDelay(error, attempt = 1) {
  const errorInfo = handleApiError(error);
  const baseDelay = errorInfo.delay || 3000;
  
  // 指数退避策略
  return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
}

/**
 * 创建用户友好的错误通知
 * @param {Error} error - 错误对象
 * @returns {Object} 通知配置
 */
export function createErrorNotification(error) {
  const errorInfo = handleApiError(error);
  
  return {
    title: errorInfo.message,
    message: errorInfo.suggestion,
    type: errorInfo.severity,
    icon: errorInfo.icon,
    duration: errorInfo.severity === 'error' ? 0 : 5000, // 错误消息不自动消失
    actions: errorInfo.retry ? [
      {
        label: '重试',
        action: 'retry'
      }
    ] : [],
    metadata: {
      errorType: errorInfo.type,
      timestamp: errorInfo.timestamp,
      requestId: errorInfo.requestId
    }
  };
}

/**
 * 记录错误到控制台（开发模式）或发送到错误监控服务
 * @param {Error} error - 错误对象
 * @param {Object} context - 上下文信息
 */
export function logError(error, context = {}) {
  const errorInfo = handleApiError(error);
  
  const logData = {
    ...errorInfo,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
  
  // 开发模式下详细记录
  if (process.env.NODE_ENV === 'development') {
    console.group(`🚨 ${errorInfo.type}: ${errorInfo.message}`);
    console.error('原始错误:', error);
    console.log('错误信息:', errorInfo);
    console.log('上下文:', context);
    console.log('完整日志:', logData);
    console.groupEnd();
  } else {
    // 生产模式下简化记录
    console.error(`[${errorInfo.type}] ${errorInfo.message}`, {
      requestId: errorInfo.requestId,
      timestamp: errorInfo.timestamp
    });
  }
  
  // 这里可以添加发送到错误监控服务的逻辑
  // 例如：Sentry, LogRocket, Bugsnag 等
}

/**
 * 创建错误边界处理函数
 * @param {Function} onError - 错误处理回调
 * @returns {Function} 错误边界处理函数
 */
export function createErrorBoundaryHandler(onError) {
  return (error, errorInfo) => {
    const enhancedError = {
      ...error,
      componentStack: errorInfo.componentStack,
      errorBoundary: true
    };
    
    logError(enhancedError, { type: 'react-error-boundary' });
    
    if (onError) {
      onError(enhancedError, errorInfo);
    }
  };
}

/**
 * 包装异步函数，添加错误处理
 * @param {Function} asyncFn - 异步函数
 * @param {Object} options - 选项
 * @returns {Function} 包装后的函数
 */
export function withErrorHandling(asyncFn, options = {}) {
  const { onError, context = {}, retries = 0 } = options;
  
  return async (...args) => {
    let lastError;
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        return await asyncFn(...args);
      } catch (error) {
        lastError = error;
        
        logError(error, { ...context, attempt, maxRetries: retries });
        
        if (attempt <= retries && canRetry(error)) {
          const delay = getRetryDelay(error, attempt);
          console.log(`重试第 ${attempt} 次，${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (onError) {
          onError(error);
        }
        
        throw error;
      }
    }
    
    throw lastError;
  };
}

/**
 * 安全地处理任何错误，确保不会导致插件崩溃
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 * @returns {Object} 处理后的错误信息
 */
export function safeHandleError(error, context = 'unknown') {
  try {
    // 如果是API相关错误，使用现有的API错误处理
    if (context === 'api' || context === 'http' || error.status) {
      return handleApiError(error);
    }

    // 组件错误处理
    if (context === 'component' || context === 'render') {
      return {
        type: 'component',
        message: '组件渲染失败',
        suggestion: '界面显示异常，请刷新页面',
        retry: true,
        userFriendly: true,
        severity: 'error',
        icon: 'ui:AlertSmall',
        safe: true,
        originalError: error,
        timestamp: new Date().toISOString()
      };
    }

    // 通用错误处理
    return {
      type: 'general',
      message: error.message || '发生未知错误',
      suggestion: '操作失败，请稍后重试',
      retry: true,
      userFriendly: true,
      severity: 'warning',
      icon: 'ui:AlertSmall',
      safe: true,
      context: context,
      originalError: error,
      timestamp: new Date().toISOString()
    };
  } catch (handlerError) {
    // 最后的安全网 - 如果错误处理本身出错
    console.error('安全错误处理器异常:', handlerError);
    return {
      type: 'critical',
      message: '系统发生严重错误',
      suggestion: '请重启插件',
      retry: false,
      userFriendly: true,
      severity: 'error',
      icon: 'ui:AlertSmall',
      safe: false,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 判断错误是否安全（不会导致插件崩溃）
 * @param {Object} errorInfo - 错误信息对象
 * @returns {boolean} 是否安全
 */
export function isSafeError(errorInfo) {
  try {
    return errorInfo.safe !== false;
  } catch (error) {
    console.error('判断错误安全性时出错:', error);
    return false;
  }
}

/**
 * 记录错误到本地存储（用于调试和错误报告）
 * @param {Object} errorInfo - 错误信息对象
 */
export function logErrorToStorage(errorInfo) {
  try {
    const errorLog = {
      ...errorInfo,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    const existingLogs = JSON.parse(localStorage.getItem('plugin_error_logs') || '[]');
    existingLogs.push(errorLog);

    // 只保留最近的50条错误日志
    if (existingLogs.length > 50) {
      existingLogs.splice(0, existingLogs.length - 50);
    }

    localStorage.setItem('plugin_error_logs', JSON.stringify(existingLogs));
  } catch (error) {
    console.error('记录错误日志时出错:', error);
  }
}

/**
 * 获取存储的错误日志
 * @returns {Array} 错误日志数组
 */
export function getStoredErrorLogs() {
  try {
    return JSON.parse(localStorage.getItem('plugin_error_logs') || '[]');
  } catch (error) {
    console.error('获取错误日志时出错:', error);
    return [];
  }
}

/**
 * 清除存储的错误日志
 */
export function clearStoredErrorLogs() {
  try {
    localStorage.removeItem('plugin_error_logs');
  } catch (error) {
    console.error('清除错误日志时出错:', error);
  }
}

/**
 * 创建安全的组件包装器，防止组件错误导致整个应用崩溃
 * @param {React.Component} Component - 要包装的组件
 * @param {Object} options - 选项
 * @returns {React.Component} 包装后的组件
 */
export function withSafeComponent(Component, options = {}) {
  const { fallback, onError } = options;
  
  return function SafeComponent(props) {
    try {
      return React.createElement(Component, props);
    } catch (error) {
      const errorInfo = safeHandleError(error, 'component');
      logErrorToStorage(errorInfo);
      
      if (onError) {
        onError(error, errorInfo);
      }
      
      if (fallback) {
        return fallback(error, errorInfo);
      }
      
      // 默认的安全回退UI
      return React.createElement('div', {
        className: 'safe-component-error',
        style: {
          padding: '20px',
          textAlign: 'center',
          color: 'var(--spectrum-global-color-red-600)',
          backgroundColor: 'var(--spectrum-global-color-red-100)',
          border: '1px solid var(--spectrum-global-color-red-400)',
          borderRadius: '4px',
          margin: '10px 0'
        }
      }, '组件加载失败，请刷新页面');
    }
  };
}