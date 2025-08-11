# 用户身份验证系统文档

## 概述

本文档描述了Adobe UXP React插件中的用户身份验证系统的使用方法、API接口和最佳实践。

## 架构概览

认证系统采用分层架构设计：

```
┌─────────────────┐
│   UI组件层      │  UserLogin, AuthGuard
├─────────────────┤
│   Hook层        │  useAuth
├─────────────────┤
│   服务层        │  AuthService, SessionManager
├─────────────────┤
│   存储层        │  UserCredentialsManager, SecureStorage
└─────────────────┘
```

## 核心组件

### 1. AuthService

认证服务是系统的核心，负责处理所有认证相关的业务逻辑。

#### 基本用法

```javascript
import { AuthService, UserCredentialsManager } from './services/auth/index.js';
import { HttpClient } from './services/HttpClient.js';
import { SecureStorage } from './utils/SecureStorage.js';

// 创建依赖实例
const httpClient = new HttpClient({ baseURL: 'https://api.example.com' });
const secureStorage = new SecureStorage();
const credentialsManager = new UserCredentialsManager(secureStorage);

// 创建认证服务
const authService = new AuthService(httpClient, credentialsManager);
```

#### API方法

##### login(username, password, rememberMe)

用户登录方法。

```javascript
try {
  const result = await authService.login('username', 'password', true);
  console.log('登录成功:', result.user);
} catch (error) {
  console.error('登录失败:', error.message);
}
```

**参数：**
- `username` (string): 用户名
- `password` (string): 密码
- `rememberMe` (boolean, 可选): 是否记住登录状态，默认false

**返回值：**
```javascript
{
  success: true,
  user: {
    id: 'user123',
    username: 'testuser',
    displayName: '测试用户',
    email: 'test@example.com'
  },
  accessToken: 'jwt-token-string',
  expiresIn: 3600,
  message: '登录成功'
}
```

**错误类型：**
- `INVALID_CREDENTIALS`: 用户名或密码错误
- `ACCOUNT_DISABLED`: 账户被禁用
- `RATE_LIMITED`: 登录尝试过于频繁
- `NETWORK_ERROR`: 网络连接失败
- `SERVER_ERROR`: 服务器错误

##### logout()

用户登出方法。

```javascript
try {
  const result = await authService.logout();
  console.log('登出成功:', result.message);
} catch (error) {
  console.error('登出失败:', error.message);
}
```

**返回值：**
```javascript
{
  success: true,
  message: '已成功登出',
  serverLogout: true,
  localCleanup: {
    credentialsCleared: true,
    tokenCleared: true,
    sessionEnded: true
  }
}
```

##### verifyToken()

验证当前Token的有效性。

```javascript
const result = await authService.verifyToken();
if (result.valid) {
  console.log('Token有效，用户:', result.user);
} else {
  console.log('Token无效，原因:', result.reason);
}
```

**返回值：**
```javascript
// 成功时
{
  valid: true,
  user: { /* 用户信息 */ },
  expiresIn: 3600,
  credentials: { /* 凭据信息 */ },
  message: 'Token验证成功'
}

// 失败时
{
  valid: false,
  reason: 'expired', // 'no_token', 'expired', 'invalid_token', 'network_error'
  message: '访问令牌已过期'
}
```

##### restoreSession()

恢复用户会话，通常在应用启动时调用。

```javascript
const result = await authService.restoreSession();
if (result.restored) {
  console.log('会话恢复成功，用户:', result.user);
} else {
  console.log('会话恢复失败，原因:', result.reason);
}
```

##### 其他方法

```javascript
// 检查登录状态
const isLoggedIn = authService.isLoggedIn();

// 获取当前用户
const currentUser = authService.getCurrentUser();

// 检查Token是否过期
const isExpired = authService.isTokenExpired(credentials);

// 获取会话管理器
const sessionManager = authService.getSessionManager();
```

### 2. UserLogin 组件

用户登录界面组件。

#### 基本用法

```jsx
import React from 'react';
import UserLogin from './components/UserLogin';

const App = () => {
  const handleLoginSuccess = async (credentials) => {
    // 处理登录成功
    console.log('登录成功:', credentials);
  };

  const handleLoginError = (error) => {
    // 处理登录错误
    console.error('登录失败:', error);
  };

  return (
    <UserLogin
      onLoginSuccess={handleLoginSuccess}
      onLoginError={handleLoginError}
      isLoading={false}
      initialCredentials={{ username: 'saveduser' }}
    />
  );
};
```

#### Props

| 属性 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| onLoginSuccess | function | 是 | - | 登录成功回调函数 |
| onLoginError | function | 是 | - | 登录失败回调函数 |
| isLoading | boolean | 否 | false | 是否显示加载状态 |
| initialCredentials | object | 否 | {} | 初始凭据信息 |

#### 回调函数参数

**onLoginSuccess(credentials)**
```javascript
{
  username: 'testuser',
  password: 'password123',
  rememberMe: true
}
```

**onLoginError(error)**
```javascript
{
  name: 'AuthError',
  message: '用户名或密码错误',
  code: 'INVALID_CREDENTIALS',
  field: 'password' // 可选，指示错误字段
}
```

### 3. AuthGuard 组件

权限保护组件，用于保护需要认证的内容。

#### 基本用法

```jsx
import React from 'react';
import AuthGuard from './components/AuthGuard';
import { useAuth } from './hooks/useAuth';

const ProtectedComponent = () => {
  return (
    <AuthGuard
      fallback={<div>请先登录</div>}
      onAuthRequired={() => console.log('需要认证')}
    >
      <div>这是受保护的内容</div>
    </AuthGuard>
  );
};
```

#### Props

| 属性 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| children | ReactNode | 是 | - | 受保护的内容 |
| fallback | ReactNode | 否 | 默认提示 | 未认证时显示的内容 |
| requireAuth | boolean | 否 | true | 是否需要认证 |
| onAuthRequired | function | 否 | - | 需要认证时的回调 |

### 4. useAuth Hook

认证状态管理Hook。

#### 基本用法

```jsx
import React from 'react';
import { useAuth } from './hooks/useAuth';

const MyComponent = () => {
  const { 
    isLoggedIn, 
    user, 
    isLoading, 
    error, 
    login, 
    logout, 
    verifyToken 
  } = useAuth();

  const handleLogin = async () => {
    try {
      await login('username', 'password', true);
      console.log('登录成功');
    } catch (error) {
      console.error('登录失败:', error);
    }
  };

  if (isLoading) {
    return <div>加载中...</div>;
  }

  if (isLoggedIn) {
    return (
      <div>
        <p>欢迎，{user.displayName}</p>
        <button onClick={logout}>登出</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={handleLogin}>登录</button>
      {error && <p>错误: {error}</p>}
    </div>
  );
};
```

#### 返回值

| 属性 | 类型 | 描述 |
|------|------|------|
| isLoggedIn | boolean | 是否已登录 |
| user | object\|null | 当前用户信息 |
| isLoading | boolean | 是否正在加载 |
| error | string\|null | 错误信息 |
| login | function | 登录方法 |
| logout | function | 登出方法 |
| verifyToken | function | Token验证方法 |

## 完整使用示例

### 1. 基本认证流程

```jsx
import React, { useState, useEffect } from 'react';
import UserLogin from './components/UserLogin';
import AuthGuard from './components/AuthGuard';
import { AuthService, UserCredentialsManager } from './services/auth/index.js';
import { HttpClient } from './services/HttpClient.js';
import { SecureStorage } from './utils/SecureStorage.js';

const App = () => {
  const [authState, setAuthState] = useState({
    isLoggedIn: false,
    user: null,
    isLoading: true,
    error: null
  });

  // 创建认证服务
  const [authService] = useState(() => {
    const httpClient = new HttpClient({ baseURL: 'https://api.example.com' });
    const secureStorage = new SecureStorage();
    const credentialsManager = new UserCredentialsManager(secureStorage);
    return new AuthService(httpClient, credentialsManager);
  });

  // 应用启动时恢复会话
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const result = await authService.restoreSession();
        if (result.restored) {
          setAuthState({
            isLoggedIn: true,
            user: result.user,
            isLoading: false,
            error: null
          });
        } else {
          setAuthState({
            isLoggedIn: false,
            user: null,
            isLoading: false,
            error: null
          });
        }
      } catch (error) {
        setAuthState({
          isLoggedIn: false,
          user: null,
          isLoading: false,
          error: error.message
        });
      }
    };

    restoreSession();
  }, [authService]);

  const handleLoginSuccess = async (credentials) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await authService.login(
        credentials.username,
        credentials.password,
        credentials.rememberMe
      );
      
      setAuthState({
        isLoggedIn: true,
        user: result.user,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      throw error;
    }
  };

  const handleLoginError = (error) => {
    console.error('登录错误:', error);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setAuthState({
        isLoggedIn: false,
        user: null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      console.error('登出失败:', error);
    }
  };

  if (authState.isLoading) {
    return <div>正在加载...</div>;
  }

  if (!authState.isLoggedIn) {
    return (
      <UserLogin
        onLoginSuccess={handleLoginSuccess}
        onLoginError={handleLoginError}
        isLoading={authState.isLoading}
      />
    );
  }

  return (
    <div>
      <header>
        <span>欢迎，{authState.user.displayName}</span>
        <button onClick={handleLogout}>登出</button>
      </header>
      
      <main>
        <AuthGuard>
          <div>受保护的主要内容</div>
        </AuthGuard>
      </main>
    </div>
  );
};

export default App;
```

### 2. 使用Context的认证系统

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

// 创建认证上下文
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    isLoggedIn: false,
    user: null,
    isLoading: true,
    error: null
  });

  const [authService] = useState(() => {
    // 初始化认证服务
    const httpClient = new HttpClient({ baseURL: process.env.REACT_APP_API_URL });
    const secureStorage = new SecureStorage();
    const credentialsManager = new UserCredentialsManager(secureStorage);
    return new AuthService(httpClient, credentialsManager);
  });

  useEffect(() => {
    // 应用启动时恢复会话
    const restoreSession = async () => {
      try {
        const result = await authService.restoreSession();
        setAuthState({
          isLoggedIn: result.restored,
          user: result.user || null,
          isLoading: false,
          error: null
        });
      } catch (error) {
        setAuthState({
          isLoggedIn: false,
          user: null,
          isLoading: false,
          error: error.message
        });
      }
    };

    restoreSession();
  }, [authService]);

  const login = async (username, password, rememberMe) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await authService.login(username, password, rememberMe);
      setAuthState({
        isLoggedIn: true,
        user: result.user,
        isLoading: false,
        error: null
      });
      return result;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setAuthState({
        isLoggedIn: false,
        user: null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        error: error.message
      }));
      throw error;
    }
  };

  const value = {
    ...authState,
    login,
    logout,
    authService
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

## 错误处理

### 错误类型

系统定义了以下错误类型：

```javascript
const AuthErrorCodes = {
  // 验证错误
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // 认证错误
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  RATE_LIMITED: 'RATE_LIMITED',
  
  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  
  // Token错误
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // 存储错误
  STORAGE_ERROR: 'STORAGE_ERROR',
  
  // 其他错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};
```

### 错误处理最佳实践

```javascript
const handleAuthError = (error) => {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      // 显示用户名或密码错误
      showErrorMessage('用户名或密码错误，请重新输入');
      break;
      
    case 'RATE_LIMITED':
      // 显示频率限制错误，可能包含重试时间
      const retryAfter = error.details?.retryAfter || 60;
      showErrorMessage(`登录尝试过于频繁，请${retryAfter}秒后重试`);
      break;
      
    case 'NETWORK_ERROR':
      // 显示网络错误，提供重试选项
      showErrorMessage('网络连接失败，请检查网络设置后重试', {
        action: 'retry',
        onRetry: () => retryLogin()
      });
      break;
      
    case 'ACCOUNT_DISABLED':
      // 显示账户禁用错误，提供联系支持的选项
      showErrorMessage('账户已被禁用，请联系管理员', {
        action: 'contact',
        onContact: () => openSupportPage()
      });
      break;
      
    default:
      // 显示通用错误信息
      showErrorMessage('登录失败，请稍后重试');
  }
};
```

## 安全考虑

### 1. 密码安全

- 密码在客户端不进行存储
- 使用HTTPS传输所有认证请求
- 实现密码强度验证（可选）

### 2. Token安全

- 使用加密存储保护访问令牌
- 实现Token自动过期机制
- 支持Token刷新（如果服务器支持）

### 3. 会话安全

- 实现会话超时检测
- 支持多标签页会话同步
- 在应用关闭时清理敏感信息

### 4. 输入验证

```javascript
const validateCredentials = (username, password) => {
  const errors = {};
  
  // 用户名验证
  if (!username || username.trim().length === 0) {
    errors.username = '请输入用户名';
  } else if (username.length < 3) {
    errors.username = '用户名至少需要3个字符';
  } else if (username.length > 50) {
    errors.username = '用户名长度不能超过50个字符';
  } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.username = '用户名只能包含字母、数字、下划线和连字符';
  }
  
  // 密码验证
  if (!password || password.length === 0) {
    errors.password = '请输入密码';
  } else if (password.length < 6) {
    errors.password = '密码至少需要6个字符';
  } else if (password.length > 128) {
    errors.password = '密码长度不能超过128个字符';
  }
  
  return errors;
};
```

## 性能优化

### 1. 组件优化

```jsx
import React, { memo } from 'react';

// 使用memo优化UserLogin组件
const UserLogin = memo(({ onLoginSuccess, onLoginError, isLoading }) => {
  // 组件实现
});

// 使用useCallback优化回调函数
const App = () => {
  const handleLoginSuccess = useCallback(async (credentials) => {
    // 处理登录成功
  }, []);

  const handleLoginError = useCallback((error) => {
    // 处理登录错误
  }, []);

  return (
    <UserLogin
      onLoginSuccess={handleLoginSuccess}
      onLoginError={handleLoginError}
      isLoading={isLoading}
    />
  );
};
```

### 2. 请求优化

```javascript
// 实现请求去重
class AuthService {
  constructor(httpClient, credentialsManager) {
    this.httpClient = httpClient;
    this.credentialsManager = credentialsManager;
    this.pendingRequests = new Map();
  }

  async login(username, password, rememberMe) {
    const requestKey = `login:${username}`;
    
    // 如果已有相同的请求在进行中，返回该请求的Promise
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    const loginPromise = this._performLogin(username, password, rememberMe);
    this.pendingRequests.set(requestKey, loginPromise);

    try {
      const result = await loginPromise;
      return result;
    } finally {
      this.pendingRequests.delete(requestKey);
    }
  }

  async _performLogin(username, password, rememberMe) {
    // 实际的登录逻辑
  }
}
```

## 测试

### 1. 单元测试示例

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserLogin from '../UserLogin';

describe('UserLogin组件', () => {
  test('应该正确渲染登录表单', () => {
    const mockOnLoginSuccess = jest.fn();
    const mockOnLoginError = jest.fn();

    render(
      <UserLogin
        onLoginSuccess={mockOnLoginSuccess}
        onLoginError={mockOnLoginError}
      />
    );

    expect(screen.getByLabelText(/用户名/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('应该在提交时调用onLoginSuccess', async () => {
    const mockOnLoginSuccess = jest.fn();
    const mockOnLoginError = jest.fn();

    render(
      <UserLogin
        onLoginSuccess={mockOnLoginSuccess}
        onLoginError={mockOnLoginError}
      />
    );

    fireEvent.change(screen.getByLabelText(/用户名/i), {
      target: { value: 'testuser' }
    });
    fireEvent.change(screen.getByLabelText(/密码/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password123',
        rememberMe: false
      });
    });
  });
});
```

### 2. 集成测试示例

```javascript
import { renderHook, act } from '@testing-library/react-hooks';
import { useAuth } from '../useAuth';

describe('useAuth Hook', () => {
  test('应该正确处理登录流程', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('testuser', 'password123', true);
    });

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.user.username).toBe('testuser');
  });
});
```

## 故障排除

### 常见问题

1. **登录按钮无响应**
   - 检查表单验证是否通过
   - 确认网络连接正常
   - 查看浏览器控制台错误信息

2. **会话无法恢复**
   - 检查存储权限
   - 确认Token未过期
   - 验证服务器端点可访问

3. **登出后仍显示登录状态**
   - 检查状态管理逻辑
   - 确认本地存储已清除
   - 验证组件重新渲染

### 调试技巧

```javascript
// 启用调试模式
const authService = new AuthService(httpClient, credentialsManager, {
  debug: true
});

// 添加会话监听器进行调试
authService.getSessionManager().addSessionListener((event, user) => {
  console.log(`会话事件: ${event}`, user);
});

// 监控Token过期
authService.on('tokenExpired', (user) => {
  console.log('Token已过期:', user);
});
```

## 更新日志

### v1.0.0
- 初始版本发布
- 基本认证功能
- UserLogin和AuthGuard组件
- useAuth Hook

### v1.1.0
- 添加会话恢复功能
- 改进错误处理
- 性能优化

### v1.2.0
- 添加Token自动刷新
- 改进安全性
- 完善测试覆盖

## 许可证

本项目采用Apache 2.0许可证。详见LICENSE文件。