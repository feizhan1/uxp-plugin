# 任务记录

## 2025-10-29

### 🐛 修复索引文件清空后手动同步无法更新的问题

**问题描述**：
当用户手动清空 index.json 文件后，执行手动同步时索引文件内容无法更新。

**根本原因**：
- LocalImageManager 使用了 `this.initialized` 标志，一旦初始化完成，再次调用 `initialize()` 会早期返回
- 导致内存中的 `indexData` 和磁盘上的文件内容不一致
- 手动同步基于内存中的旧数据判断所有产品都已存在，跳过同步流程，不保存任何数据

**解决方案**：
在 `TodoList.jsx` 的 `executeSync` 函数中，调用 `initialize()` 后强制重新加载索引数据：
```javascript
await localImageManager.initialize()
await localImageManager.loadIndexData()  // 强制刷新索引数据
```

**修改文件**：
- `src/panels/TodoList.jsx:1065` - 添加强制刷新索引数据的逻辑

**测试步骤**：
1. 清空 index.json 文件（改为 `[]`）
2. 点击"就绪"按钮执行手动同步
3. 验证索引文件是否正确更新

**状态**：✅ 已完成并构建成功
