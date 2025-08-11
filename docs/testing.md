# 测试文档

本文档说明了HTTP API访问功能的测试结构和运行方法。

## 测试结构

### 测试文件组织

```
src/
├── components/
│   └── __tests__/
│       ├── ApiConfig.test.jsx
│       ├── ApiDataDisplay.test.jsx
│       ├── ErrorNotification.test.jsx
│       └── PermissionChecker.test.jsx
├── hooks/
│   └── __tests__/
│       ├── useApiConfig.test.js
│       ├── useApiData.test.js
│       ├── useApiManager.test.js
│       ├── useErrorNotification.test.js
│       ├── usePaginatedApi.test.js
│       └── useRealtimeApi.test.js
├── services/
│   └── __tests__/
│       ├── HttpClient.test.js
│       ├── TokenManager.test.js
│       └── integration.test.js
├── utils/
│   └── __tests__/
│       ├── SecureStorage.test.js
│       ├── errorHandler.test.js
│       └── permissionChecker.test.js
├── panels/
│   └── __tests__/
│       └── integration.test.jsx
└── setupTests.js
```

### 测试类型

1. **单元测试** - 测试单个函数、类或组件
2. **集成测试** - 测试多个组件之间的交互
3. **Hook测试** - 测试自定义React Hook的行为
4. **组件测试** - 测试React组件的渲染和交互

## 运行测试

### 基本命令

```bash
# 运行所有测试
npm test

# 监视模式运行测试
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# CI环境运行测试
npm run test:ci
```

### 运行特定测试

```bash
# 运行特定文件的测试
npm test HttpClient.test.js

# 运行特定目录的测试
npm test src/hooks/__tests__

# 运行匹配模式的测试
npm test -- --testNamePattern="应该成功获取数据"
```

### 调试测试

```bash
# 以调试模式运行测试
npm test -- --runInBand --no-cache

# 运行单个测试文件并显示详细输出
npm test HttpClient.test.js -- --verbose
```

## 测试配置

### Jest配置

测试使用Jest作为测试框架，配置在`package.json`中：

```json
{
  "jest": {
    "testEnvironment": "jsdom",
    "setupFilesAfterEnv": ["<rootDir>/src/setupTests.js"],
    "moduleNameMapping": {
      "\\.(css|less|scss|sass)$": "identity-obj-proxy"
    },
    "transform": {
      "^.+\\.(js|jsx)$": "babel-jest"
    },
    "collectCoverageFrom": [
      "src/**/*.{js,jsx}",
      "!src/index.jsx",
      "!src/setupTests.js",
      "!src/**/*.test.{js,jsx}"
    ],
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

### 测试环境设置

`src/setupTests.js`文件配置了测试环境：

- Mock UXP APIs
- Mock localStorage
- Mock fetch API
- Mock WebSocket和EventSource
- Mock Adobe Spectrum Web Components
- 设置测试工具库

## 测试覆盖的功能

### HTTP客户端 (HttpClient)

- ✅ 基础HTTP请求 (GET, POST, PUT, DELETE)
- ✅ URL构建和参数处理
- ✅ 请求头管理
- ✅ 超时处理
- ✅ 错误处理
- ✅ Token认证集成
- ✅ 配置管理

### Token管理 (TokenManager)

- ✅ Token存储和获取
- ✅ Token验证
- ✅ 安全存储集成
- ✅ Token格式化
- ✅ Token生命周期管理

### 安全存储 (SecureStorage)

- ✅ 凭据加密存储
- ✅ 凭据获取和删除
- ✅ 存储检查
- ✅ 批量清理
- ✅ 错误处理

### React组件

#### ApiConfig组件
- ✅ 表单渲染和验证
- ✅ 配置更新
- ✅ 连接测试
- ✅ 用户交互

#### ApiDataDisplay组件
- ✅ 数据获取和显示
- ✅ 加载状态管理
- ✅ 错误处理
- ✅ JSON数据渲染
- ✅ 刷新功能

#### ErrorNotification组件
- ✅ 通知渲染
- ✅ 不同类型通知
- ✅ 详细信息显示
- ✅ 用户交互
- ✅ 可访问性

#### PermissionChecker组件
- ✅ 权限检查执行
- ✅ 结果显示
- ✅ 配置建议
- ✅ 用户交互

### React Hooks

#### useApiConfig
- ✅ 配置状态管理
- ✅ 配置验证
- ✅ 连接测试
- ✅ 配置持久化

#### useApiData
- ✅ 数据获取
- ✅ 状态管理
- ✅ 缓存功能
- ✅ 错误处理
- ✅ 回调函数

#### useApiManager
- ✅ 请求管理
- ✅ 批量请求
- ✅ 请求取消
- ✅ 统计信息

#### useErrorNotification
- ✅ 通知管理
- ✅ 自动移除
- ✅ 重复处理
- ✅ 过滤功能

#### usePaginatedApi
- ✅ 分页数据获取
- ✅ 分页导航
- ✅ 缓存功能
- ✅ 搜索和过滤

#### useRealtimeApi
- ✅ 实时连接管理
- ✅ 多种连接模式
- ✅ 数据处理
- ✅ 错误恢复

### 工具函数

#### errorHandler
- ✅ 错误分类
- ✅ 用户友好消息
- ✅ 错误建议
- ✅ 重试判断
- ✅ 错误格式化

#### permissionChecker
- ✅ 权限检查
- ✅ 配置建议生成
- ✅ 报告生成

## 测试最佳实践

### 1. 测试命名

使用描述性的测试名称：

```javascript
test('应该在API URL为空时显示验证错误', () => {
  // 测试代码
});
```

### 2. 测试结构

使用AAA模式（Arrange, Act, Assert）：

```javascript
test('应该成功获取用户数据', async () => {
  // Arrange - 准备测试数据
  const mockData = { id: 1, name: 'Test User' };
  mockHttpClient.get.mockResolvedValue({ data: mockData });

  // Act - 执行操作
  const { result } = renderHook(() => useApiData(mockHttpClient));
  await act(async () => {
    await result.current.fetchData('/users/1');
  });

  // Assert - 验证结果
  expect(result.current.data).toEqual(mockData);
});
```

### 3. Mock管理

在每个测试前清理Mock：

```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### 4. 异步测试

正确处理异步操作：

```javascript
test('应该处理异步错误', async () => {
  const error = new Error('网络错误');
  mockHttpClient.get.mockRejectedValue(error);

  await act(async () => {
    await result.current.fetchData('/users');
  });

  expect(result.current.error).toBe(error);
});
```

### 5. 用户交互测试

使用Testing Library的用户事件：

```javascript
test('应该在点击按钮时提交表单', async () => {
  render(<ApiConfig onConfigChange={mockCallback} />);
  
  const button = screen.getByText('保存配置');
  fireEvent.click(button);
  
  await waitFor(() => {
    expect(mockCallback).toHaveBeenCalled();
  });
});
```

## 覆盖率目标

项目设置了以下覆盖率目标：

- **分支覆盖率**: 80%
- **函数覆盖率**: 80%
- **行覆盖率**: 80%
- **语句覆盖率**: 80%

## 持续集成

测试在CI环境中自动运行：

```bash
npm run test:ci
```

这个命令会：
- 运行所有测试
- 生成覆盖率报告
- 不启用监视模式
- 适合CI环境运行

## 故障排除

### 常见问题

1. **测试超时**
   ```bash
   # 增加超时时间
   npm test -- --testTimeout=10000
   ```

2. **Mock问题**
   ```bash
   # 清除Jest缓存
   npm test -- --clearCache
   ```

3. **内存问题**
   ```bash
   # 串行运行测试
   npm test -- --runInBand
   ```

### 调试技巧

1. 使用`console.log`调试测试
2. 使用`screen.debug()`查看DOM结构
3. 使用`--verbose`标志获取详细输出
4. 使用`--watch`模式进行迭代开发

## 贡献指南

添加新功能时，请确保：

1. 为新功能编写相应的测试
2. 保持测试覆盖率在目标水平以上
3. 遵循现有的测试模式和命名约定
4. 更新相关文档

## 参考资料

- [Jest文档](https://jestjs.io/docs/getting-started)
- [React Testing Library文档](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library用户指南](https://testing-library.com/docs/user-event/intro)
- [Jest DOM匹配器](https://github.com/testing-library/jest-dom)