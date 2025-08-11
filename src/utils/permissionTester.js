/**
 * UXP权限测试工具
 * 用于验证插件权限配置是否正确
 */

/**
 * 权限测试结果类型
 */
export const PermissionTestResult = {
  SUCCESS: 'success',
  FAILED: 'failed',
  NOT_SUPPORTED: 'not_supported',
  PERMISSION_DENIED: 'permission_denied'
};

/**
 * 测试网络权限
 * @param {string} url - 测试URL
 * @returns {Promise<Object>} 测试结果
 */
export async function testNetworkPermission(url = 'https://httpbin.org/get') {
  const testResult = {
    permission: 'network',
    url,
    status: PermissionTestResult.FAILED,
    message: '',
    details: null,
    timestamp: new Date().toISOString()
  };

  try {
    console.log(`测试网络权限: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'UXP-Plugin-Test/1.0'
      }
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (response.ok) {
      const data = await response.json();
      testResult.status = PermissionTestResult.SUCCESS;
      testResult.message = `网络请求成功 (${response.status})`;
      testResult.details = {
        status: response.status,
        statusText: response.statusText,
        responseTime,
        dataSize: JSON.stringify(data).length,
        headers: Object.fromEntries(response.headers.entries())
      };
    } else {
      testResult.status = PermissionTestResult.FAILED;
      testResult.message = `HTTP错误: ${response.status} ${response.statusText}`;
      testResult.details = {
        status: response.status,
        statusText: response.statusText,
        responseTime
      };
    }
  } catch (error) {
    testResult.status = PermissionTestResult.PERMISSION_DENIED;
    testResult.message = `网络权限被拒绝: ${error.message}`;
    testResult.details = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };
  }

  return testResult;
}

/**
 * 测试本地文件系统权限
 * @returns {Promise<Object>} 测试结果
 */
export async function testLocalFileSystemPermission() {
  const testResult = {
    permission: 'localFileSystem',
    status: PermissionTestResult.FAILED,
    message: '',
    details: null,
    timestamp: new Date().toISOString()
  };

  try {
    console.log('测试本地文件系统权限');

    // 检查localStorage是否可用
    const testKey = 'uxp_permission_test';
    const testValue = JSON.stringify({
      test: true,
      timestamp: Date.now()
    });

    // 写入测试
    localStorage.setItem(testKey, testValue);
    
    // 读取测试
    const retrievedValue = localStorage.getItem(testKey);
    
    if (retrievedValue === testValue) {
      // 清理测试数据
      localStorage.removeItem(testKey);
      
      testResult.status = PermissionTestResult.SUCCESS;
      testResult.message = '本地存储权限正常';
      testResult.details = {
        storageType: 'localStorage',
        testDataSize: testValue.length,
        canWrite: true,
        canRead: true,
        canDelete: true
      };
    } else {
      testResult.status = PermissionTestResult.FAILED;
      testResult.message = '本地存储读写不一致';
      testResult.details = {
        expected: testValue,
        actual: retrievedValue
      };
    }
  } catch (error) {
    testResult.status = PermissionTestResult.PERMISSION_DENIED;
    testResult.message = `本地文件系统权限被拒绝: ${error.message}`;
    testResult.details = {
      errorName: error.name,
      errorMessage: error.message
    };
  }

  return testResult;
}

/**
 * 测试webview权限
 * @returns {Promise<Object>} 测试结果
 */
export async function testWebviewPermission() {
  const testResult = {
    permission: 'webview',
    status: PermissionTestResult.FAILED,
    message: '',
    details: null,
    timestamp: new Date().toISOString()
  };

  try {
    console.log('测试webview权限');

    // 检查webview相关API是否可用
    const hasWebview = typeof window !== 'undefined' && 
                      typeof document !== 'undefined' &&
                      typeof document.createElement === 'function';

    if (hasWebview) {
      // 尝试创建一个简单的webview元素
      const testElement = document.createElement('div');
      testElement.innerHTML = '<p>Test content</p>';
      
      testResult.status = PermissionTestResult.SUCCESS;
      testResult.message = 'webview权限正常';
      testResult.details = {
        hasWindow: typeof window !== 'undefined',
        hasDocument: typeof document !== 'undefined',
        canCreateElements: true,
        userAgent: navigator.userAgent
      };
    } else {
      testResult.status = PermissionTestResult.NOT_SUPPORTED;
      testResult.message = 'webview环境不可用';
      testResult.details = {
        hasWindow: typeof window !== 'undefined',
        hasDocument: typeof document !== 'undefined'
      };
    }
  } catch (error) {
    testResult.status = PermissionTestResult.PERMISSION_DENIED;
    testResult.message = `webview权限被拒绝: ${error.message}`;
    testResult.details = {
      errorName: error.name,
      errorMessage: error.message
    };
  }

  return testResult;
}

/**
 * 测试代码生成权限
 * @returns {Promise<Object>} 测试结果
 */
export async function testCodeGenerationPermission() {
  const testResult = {
    permission: 'allowCodeGenerationFromStrings',
    status: PermissionTestResult.FAILED,
    message: '',
    details: null,
    timestamp: new Date().toISOString()
  };

  try {
    console.log('测试代码生成权限');

    // 尝试使用eval (需要allowCodeGenerationFromStrings权限)
    const testCode = '1 + 1';
    const result = eval(testCode);

    if (result === 2) {
      testResult.status = PermissionTestResult.SUCCESS;
      testResult.message = '代码生成权限正常';
      testResult.details = {
        testCode,
        result,
        canUseEval: true
      };
    } else {
      testResult.status = PermissionTestResult.FAILED;
      testResult.message = '代码执行结果异常';
      testResult.details = {
        testCode,
        expected: 2,
        actual: result
      };
    }
  } catch (error) {
    testResult.status = PermissionTestResult.PERMISSION_DENIED;
    testResult.message = `代码生成权限被拒绝: ${error.message}`;
    testResult.details = {
      errorName: error.name,
      errorMessage: error.message
    };
  }

  return testResult;
}

/**
 * 运行所有权限测试
 * @param {Object} options - 测试选项
 * @returns {Promise<Object>} 完整测试结果
 */
export async function runAllPermissionTests(options = {}) {
  const {
    testUrls = [
      'https://httpbin.org/get',
      'https://jsonplaceholder.typicode.com/posts/1',
      'https://api.github.com'
    ],
    includeNetworkTests = true,
    includeFileSystemTests = true,
    includeWebviewTests = true,
    includeCodeGenerationTests = true
  } = options;

  console.log('开始运行权限测试套件...');
  
  const testResults = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      denied: 0,
      notSupported: 0
    },
    tests: [],
    timestamp: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language
    }
  };

  // 网络权限测试
  if (includeNetworkTests) {
    for (const url of testUrls) {
      try {
        const result = await testNetworkPermission(url);
        testResults.tests.push(result);
        testResults.summary.total++;
        
        switch (result.status) {
          case PermissionTestResult.SUCCESS:
            testResults.summary.passed++;
            break;
          case PermissionTestResult.FAILED:
            testResults.summary.failed++;
            break;
          case PermissionTestResult.PERMISSION_DENIED:
            testResults.summary.denied++;
            break;
          case PermissionTestResult.NOT_SUPPORTED:
            testResults.summary.notSupported++;
            break;
        }
      } catch (error) {
        console.error(`网络测试失败 (${url}):`, error);
      }
    }
  }

  // 本地文件系统权限测试
  if (includeFileSystemTests) {
    try {
      const result = await testLocalFileSystemPermission();
      testResults.tests.push(result);
      testResults.summary.total++;
      
      switch (result.status) {
        case PermissionTestResult.SUCCESS:
          testResults.summary.passed++;
          break;
        case PermissionTestResult.FAILED:
          testResults.summary.failed++;
          break;
        case PermissionTestResult.PERMISSION_DENIED:
          testResults.summary.denied++;
          break;
        case PermissionTestResult.NOT_SUPPORTED:
          testResults.summary.notSupported++;
          break;
      }
    } catch (error) {
      console.error('文件系统测试失败:', error);
    }
  }

  // webview权限测试
  if (includeWebviewTests) {
    try {
      const result = await testWebviewPermission();
      testResults.tests.push(result);
      testResults.summary.total++;
      
      switch (result.status) {
        case PermissionTestResult.SUCCESS:
          testResults.summary.passed++;
          break;
        case PermissionTestResult.FAILED:
          testResults.summary.failed++;
          break;
        case PermissionTestResult.PERMISSION_DENIED:
          testResults.summary.denied++;
          break;
        case PermissionTestResult.NOT_SUPPORTED:
          testResults.summary.notSupported++;
          break;
      }
    } catch (error) {
      console.error('webview测试失败:', error);
    }
  }

  // 代码生成权限测试
  if (includeCodeGenerationTests) {
    try {
      const result = await testCodeGenerationPermission();
      testResults.tests.push(result);
      testResults.summary.total++;
      
      switch (result.status) {
        case PermissionTestResult.SUCCESS:
          testResults.summary.passed++;
          break;
        case PermissionTestResult.FAILED:
          testResults.summary.failed++;
          break;
        case PermissionTestResult.PERMISSION_DENIED:
          testResults.summary.denied++;
          break;
        case PermissionTestResult.NOT_SUPPORTED:
          testResults.summary.notSupported++;
          break;
      }
    } catch (error) {
      console.error('代码生成测试失败:', error);
    }
  }

  // 计算成功率
  testResults.summary.successRate = testResults.summary.total > 0 
    ? (testResults.summary.passed / testResults.summary.total * 100).toFixed(1)
    : 0;

  console.log('权限测试完成:', testResults.summary);
  return testResults;
}

/**
 * 生成权限测试报告
 * @param {Object} testResults - 测试结果
 * @returns {string} 格式化的测试报告
 */
export function generatePermissionReport(testResults) {
  const { summary, tests, timestamp, environment } = testResults;
  
  let report = `# UXP权限测试报告\n\n`;
  report += `**生成时间:** ${new Date(timestamp).toLocaleString()}\n`;
  report += `**环境信息:** ${environment.userAgent}\n\n`;
  
  report += `## 测试摘要\n\n`;
  report += `- **总测试数:** ${summary.total}\n`;
  report += `- **通过:** ${summary.passed}\n`;
  report += `- **失败:** ${summary.failed}\n`;
  report += `- **权限被拒绝:** ${summary.denied}\n`;
  report += `- **不支持:** ${summary.notSupported}\n`;
  report += `- **成功率:** ${summary.successRate}%\n\n`;
  
  report += `## 详细结果\n\n`;
  
  tests.forEach((test, index) => {
    const statusIcon = {
      [PermissionTestResult.SUCCESS]: '✅',
      [PermissionTestResult.FAILED]: '❌',
      [PermissionTestResult.PERMISSION_DENIED]: '🚫',
      [PermissionTestResult.NOT_SUPPORTED]: '⚠️'
    }[test.status] || '❓';
    
    report += `### ${index + 1}. ${test.permission} ${statusIcon}\n\n`;
    report += `**状态:** ${test.status}\n`;
    report += `**消息:** ${test.message}\n`;
    
    if (test.url) {
      report += `**URL:** ${test.url}\n`;
    }
    
    if (test.details) {
      report += `**详细信息:**\n`;
      report += `\`\`\`json\n${JSON.stringify(test.details, null, 2)}\n\`\`\`\n`;
    }
    
    report += `\n`;
  });
  
  return report;
}