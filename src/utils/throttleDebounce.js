/**
 * 防抖和节流工具函数
 * 用于优化API请求频率和性能
 */

/**
 * 防抖函数 - 延迟执行，在指定时间内多次调用只执行最后一次
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {Object} options - 配置选项
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay, options = {}) {
  const {
    immediate = false, // 是否立即执行第一次调用
    maxWait = null,    // 最大等待时间
    leading = false,   // 是否在延迟开始前调用
    trailing = true    // 是否在延迟结束后调用
  } = options;

  let timeoutId = null;
  let maxTimeoutId = null;
  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let lastArgs = null;
  let lastThis = null;
  let result = undefined;

  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    lastInvokeTime = time;
    timeoutId = setTimeout(timerExpired, delay);
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = delay - timeSinceLastCall;

    return maxWait !== null
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === 0 ||
      timeSinceLastCall >= delay ||
      timeSinceLastCall < 0 ||
      (maxWait !== null && timeSinceLastInvoke >= maxWait)
    );
  }

  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeoutId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timeoutId = null;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId !== null) {
      clearTimeout(maxTimeoutId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeoutId = maxTimeoutId = undefined;
  }

  function flush() {
    return timeoutId === null ? result : trailingEdge(Date.now());
  }

  function pending() {
    return timeoutId !== null;
  }

  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        return leadingEdge(lastCallTime);
      }
      if (maxWait !== null) {
        timeoutId = setTimeout(timerExpired, delay);
        return invokeFunc(lastCallTime);
      }
    }
    if (timeoutId === null) {
      timeoutId = setTimeout(timerExpired, delay);
    }
    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
}

/**
 * 节流函数 - 限制执行频率，在指定时间间隔内最多执行一次
 * @param {Function} func - 要节流的函数
 * @param {number} wait - 等待时间（毫秒）
 * @param {Object} options - 配置选项
 * @returns {Function} 节流后的函数
 */
export function throttle(func, wait, options = {}) {
  const {
    leading = true,  // 是否在节流开始前调用
    trailing = true  // 是否在节流结束后调用
  } = options;

  return debounce(func, wait, {
    leading,
    trailing,
    maxWait: wait
  });
}

/**
 * 创建请求防抖器 - 专门用于API请求的防抖
 * @param {Function} requestFunc - 请求函数
 * @param {number} delay - 防抖延迟（毫秒）
 * @param {Object} options - 配置选项
 * @returns {Object} 包含防抖请求函数和控制方法的对象
 */
export function createRequestDebouncer(requestFunc, delay = 300, options = {}) {
  const {
    immediate = false,
    maxWait = 2000,
    onPending = null,    // 请求挂起时的回调
    onCancel = null,     // 请求取消时的回调
    onExecute = null     // 请求执行时的回调
  } = options;

  let pendingPromise = null;
  let pendingResolve = null;
  let pendingReject = null;

  const debouncedFunc = debounce(
    async (...args) => {
      try {
        if (onExecute) {
          onExecute(...args);
        }

        const result = await requestFunc(...args);
        
        if (pendingResolve) {
          pendingResolve(result);
          pendingPromise = pendingResolve = pendingReject = null;
        }
        
        return result;
      } catch (error) {
        if (pendingReject) {
          pendingReject(error);
          pendingPromise = pendingResolve = pendingReject = null;
        }
        throw error;
      }
    },
    delay,
    { immediate, maxWait }
  );

  const request = (...args) => {
    // 如果已有挂起的请求，返回同一个Promise
    if (pendingPromise) {
      return pendingPromise;
    }

    // 创建新的Promise
    pendingPromise = new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    if (onPending) {
      onPending(...args);
    }

    // 执行防抖函数
    debouncedFunc(...args).catch(() => {
      // 错误已在debouncedFunc中处理
    });

    return pendingPromise;
  };

  const cancel = () => {
    debouncedFunc.cancel();
    
    if (pendingReject) {
      const cancelError = new Error('请求已取消');
      cancelError.name = 'RequestCancelled';
      pendingReject(cancelError);
    }
    
    pendingPromise = pendingResolve = pendingReject = null;
    
    if (onCancel) {
      onCancel();
    }
  };

  const flush = () => {
    return debouncedFunc.flush();
  };

  const pending = () => {
    return debouncedFunc.pending() || pendingPromise !== null;
  };

  return {
    request,
    cancel,
    flush,
    pending
  };
}

/**
 * 创建请求节流器 - 专门用于API请求的节流
 * @param {Function} requestFunc - 请求函数
 * @param {number} wait - 节流间隔（毫秒）
 * @param {Object} options - 配置选项
 * @returns {Object} 包含节流请求函数和控制方法的对象
 */
export function createRequestThrottler(requestFunc, wait = 1000, options = {}) {
  const {
    leading = true,
    trailing = false,
    onSkip = null,      // 请求被跳过时的回调
    onExecute = null    // 请求执行时的回调
  } = options;

  let lastExecuteTime = 0;
  let skippedCount = 0;

  const throttledFunc = throttle(
    async (...args) => {
      try {
        if (onExecute) {
          onExecute(...args, { skippedCount });
        }

        lastExecuteTime = Date.now();
        skippedCount = 0;
        
        return await requestFunc(...args);
      } catch (error) {
        throw error;
      }
    },
    wait,
    { leading, trailing }
  );

  const request = (...args) => {
    const now = Date.now();
    const timeSinceLastExecute = now - lastExecuteTime;
    
    // 如果在节流期间，记录跳过次数
    if (timeSinceLastExecute < wait && lastExecuteTime > 0) {
      skippedCount++;
      
      if (onSkip) {
        onSkip(...args, { skippedCount, timeSinceLastExecute });
      }
    }

    return throttledFunc(...args);
  };

  const cancel = () => {
    throttledFunc.cancel();
    skippedCount = 0;
  };

  const flush = () => {
    return throttledFunc.flush();
  };

  const pending = () => {
    return throttledFunc.pending();
  };

  const getStats = () => {
    return {
      lastExecuteTime,
      skippedCount,
      timeSinceLastExecute: Date.now() - lastExecuteTime
    };
  };

  return {
    request,
    cancel,
    flush,
    pending,
    getStats
  };
}

/**
 * 批量请求管理器 - 将多个请求合并为批量请求
 * @param {Function} batchRequestFunc - 批量请求函数
 * @param {Object} options - 配置选项
 * @returns {Function} 批量请求函数
 */
export function createBatchRequestManager(batchRequestFunc, options = {}) {
  const {
    batchSize = 10,      // 批量大小
    batchDelay = 100,    // 批量延迟（毫秒）
    maxWaitTime = 1000   // 最大等待时间
  } = options;

  let pendingRequests = [];
  let batchTimer = null;
  let maxWaitTimer = null;

  const processBatch = async () => {
    if (pendingRequests.length === 0) return;

    const currentBatch = pendingRequests.splice(0, batchSize);
    
    // 清除定时器
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }

    try {
      const requests = currentBatch.map(item => item.request);
      const results = await batchRequestFunc(requests);
      
      // 解析结果
      currentBatch.forEach((item, index) => {
        const result = results[index];
        if (result && result.error) {
          item.reject(new Error(result.error));
        } else {
          item.resolve(result);
        }
      });
    } catch (error) {
      // 批量请求失败，拒绝所有请求
      currentBatch.forEach(item => {
        item.reject(error);
      });
    }

    // 如果还有待处理的请求，继续处理
    if (pendingRequests.length > 0) {
      scheduleBatch();
    }
  };

  const scheduleBatch = () => {
    if (!batchTimer) {
      batchTimer = setTimeout(processBatch, batchDelay);
    }
    
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(processBatch, maxWaitTime);
    }
  };

  return (request) => {
    return new Promise((resolve, reject) => {
      pendingRequests.push({
        request,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // 如果达到批量大小，立即处理
      if (pendingRequests.length >= batchSize) {
        processBatch();
      } else {
        scheduleBatch();
      }
    });
  };
}

export default {
  debounce,
  throttle,
  createRequestDebouncer,
  createRequestThrottler,
  createBatchRequestManager
};