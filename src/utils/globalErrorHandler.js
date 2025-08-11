/**
 * 全局异常处理器
 * 处理未捕获的JavaScript错误和Promise拒绝
 */

class GlobalErrorHandler {
  constructor() {
    this.errorListeners = [];
    this.isInitialized = false;
  }

  /**
   * 初始化全局错误处理
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    // 捕获未处理的JavaScript错误
    window.addEventListener('error', this.handleError.bind(this));
    
    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));

    this.isInitialized = true;
    console.log('全局错误处理器已初始化');
  }

  /**
   * 清理全局错误处理
   */
  cleanup() {
    if (!this.isInitialized) {
      return;
    }

    window.removeEventListener('error', this.handleError.bind(this));
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));
    
    this.errorListeners = [];
    this.isInitialized = false;
    console.log('全局错误处理器已清理');
  }

  /**
   * 处理JavaScript错误
   */
  handleError(event) {
    const error = {
      type: 'javascript',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    this.logError(error);
    this.notifyListeners(error);

    // 防止默认的错误处理（避免在控制台显示错误）
    if (this.shouldPreventDefault(error)) {
      event.preventDefault();
    }
  }

  /**
   * 处理Promise拒绝
   */
  handlePromiseRejection(event) {
    const error = {
      type: 'promise',
      message: event.reason?.message || '未处理的Promise拒绝',
      reason: event.reason,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    this.logError(error);
    this.notifyListeners(error);

    // 防止默认的错误处理
    if (this.shouldPreventDefault(error)) {
      event.preventDefault();
    }
  }

  /**
   * 记录错误信息
   */
  logError(error) {
    console.group(`🚨 全局错误 [${error.type}]`);
    console.error('错误信息:', error.message);
    console.error('时间戳:', error.timestamp);
    
    if (error.filename) {
      console.error('文件:', error.filename);
      console.error('位置:', `${error.lineno}:${error.colno}`);
    }
    
    if (error.error && error.error.stack) {
      console.error('堆栈:', error.error.stack);
    }
    
    if (error.reason) {
      console.error('原因:', error.reason);
    }
    
    console.groupEnd();
  }

  /**
   * 通知错误监听器
   */
  notifyListeners(error) {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('错误监听器执行失败:', listenerError);
      }
    });
  }

  /**
   * 添加错误监听器
   */
  addErrorListener(listener) {
    if (typeof listener === 'function') {
      this.errorListeners.push(listener);
    }
  }

  /**
   * 移除错误监听器
   */
  removeErrorListener(listener) {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * 判断是否应该阻止默认错误处理
   */
  shouldPreventDefault(error) {
    // API相关错误不阻止默认处理，让用户看到错误信息
    if (error.message && (
      error.message.includes('fetch') ||
      error.message.includes('API') ||
      error.message.includes('网络') ||
      error.message.includes('HTTP')
    )) {
      return false;
    }

    // 其他错误阻止默认处理，避免用户看到技术错误信息
    return true;
  }

  /**
   * 手动报告错误
   */
  reportError(error, context = {}) {
    const errorInfo = {
      type: 'manual',
      message: error.message || '手动报告的错误',
      error: error,
      context: context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    this.logError(errorInfo);
    this.notifyListeners(errorInfo);
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    // 这里可以实现错误统计逻辑
    return {
      totalErrors: 0,
      errorTypes: {},
      lastError: null
    };
  }
}

// 创建全局实例
const globalErrorHandler = new GlobalErrorHandler();

export default globalErrorHandler;