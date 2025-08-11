# UXP插件权限配置说明

本文档说明了HTTP API访问功能所需的各种UXP权限配置。

## 权限概述

### 1. allowCodeGenerationFromStrings
```json
"allowCodeGenerationFromStrings": true
```
**用途：** 允许插件动态生成和执行代码
**必要性：** React和现代JavaScript框架需要此权限来正常运行
**安全考虑：** 仅在可信环境中使用

### 2. localFileSystem
```json
"localFileSystem": "request"
```
**用途：** 允许插件访问本地文件系统
**必要性：** 用于配置文件的读写和数据缓存
**权限级别：** request - 需要用户授权

### 3. launchProcess
```json
"launchProcess": {
  "schemes": ["http", "https"],
  "extensions": [".svg", ".png", ".jpg", ".jpeg", ".gif", ".json"]
}
```
**用途：** 允许插件启动外部进程和打开文件
**schemes：** 支持HTTP和HTTPS协议
**extensions：** 支持的文件扩展名

### 4. webview
```json
"webview": {
  "allow": "yes",
  "domains": [...]
}
```
**用途：** 允许插件使用webview组件
**必要性：** 某些UI组件和外部内容展示需要
**域名限制：** 仅允许访问指定域名

### 5. network
```json
"network": {
  "domains": [...]
}
```
**用途：** 允许插件进行网络请求
**必要性：** HTTP API访问的核心权限
**域名限制：** 仅允许访问指定域名

## 允许的域名列表

### 官方服务
- `https://*.adobe.com` - Adobe官方服务
- `https://*.google.com` - Google服务

### 测试API服务
- `https://jsonplaceholder.typicode.com` - JSON占位符API
- `https://httpbin.org` - HTTP测试服务
- `https://reqres.in` - RESTful API测试服务
- `https://dummyjson.com` - 虚拟JSON数据API
- `https://fakestoreapi.com` - 虚拟商店API
- `https://randomuser.me` - 随机用户数据API

### 开发和测试域名
- `https://*.example.com` - 示例域名
- `https://*.test.com` - 测试域名
- `https://*.localhost` - 本地开发域名
- `https://localhost:*` - 本地开发服务器

## 权限使用场景

### HTTP API请求
- **权限：** network, webview
- **用途：** 发送GET、POST、PUT、DELETE请求
- **安全：** 仅限指定域名

### 数据缓存
- **权限：** localFileSystem
- **用途：** 缓存API响应数据
- **位置：** 插件数据目录

### Token存储
- **权限：** localFileSystem
- **用途：** 安全存储访问Token
- **加密：** 使用简单加密算法

### 错误日志
- **权限：** localFileSystem
- **用途：** 记录错误和调试信息
- **位置：** 插件日志目录

## 安全考虑

### 网络安全
1. **域名白名单：** 仅允许访问预定义的安全域名
2. **HTTPS强制：** 所有网络请求必须使用HTTPS
3. **Token保护：** 访问Token使用加密存储
4. **请求验证：** 验证所有输入参数

### 数据安全
1. **敏感数据：** 不在日志中记录敏感信息
2. **数据清理：** 定期清理缓存和临时文件
3. **权限最小化：** 仅请求必要的权限
4. **用户控制：** 用户可以控制数据访问

### 代码安全
1. **输入验证：** 验证所有用户输入
2. **XSS防护：** 清理显示的数据内容
3. **错误处理：** 安全的错误处理机制
4. **依赖管理：** 使用可信的依赖库

## 权限申请流程

### 开发阶段
1. 在manifest.json中声明所需权限
2. 测试权限是否正常工作
3. 验证安全限制是否有效

### 发布阶段
1. 审查所有权限的必要性
2. 移除不必要的权限
3. 更新权限说明文档

### 用户安装
1. 用户查看权限列表
2. 用户同意权限申请
3. 插件获得相应权限

## 权限故障排除

### 网络请求失败
- **检查：** 域名是否在白名单中
- **解决：** 添加域名到manifest.json
- **测试：** 使用测试API验证

### 文件访问失败
- **检查：** localFileSystem权限是否申请
- **解决：** 确保权限级别正确
- **测试：** 验证文件读写功能

### webview加载失败
- **检查：** webview权限和域名配置
- **解决：** 更新域名白名单
- **测试：** 使用简单页面测试

## 最佳实践

### 权限管理
1. **最小权限原则：** 只申请必要的权限
2. **定期审查：** 定期检查权限使用情况
3. **用户透明：** 向用户说明权限用途
4. **安全更新：** 及时更新安全配置

### 开发建议
1. **权限测试：** 在不同权限级别下测试
2. **错误处理：** 处理权限不足的情况
3. **用户体验：** 提供清晰的权限说明
4. **文档维护：** 保持权限文档更新

## 相关资源

- [UXP权限文档](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/LocalFileSystem/)
- [网络请求指南](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Global%20Members/Data%20Transfers/fetch/)
- [安全最佳实践](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/security-considerations/)