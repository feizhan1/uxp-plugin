# React 组件库

这是一个可复用的React组件库，包含常用的UI组件。

## 组件列表

### Button 按钮组件

一个功能丰富的按钮组件，支持多种样式和尺寸。

#### 使用方法

```jsx
import { Button } from './components'

// 基础用法
<Button>默认按钮</Button>

// 不同变体
<Button variant="primary">主要按钮</Button>
<Button variant="secondary">次要按钮</Button>
<Button variant="success">成功按钮</Button>
<Button variant="danger">危险按钮</Button>
<Button variant="warning">警告按钮</Button>

// 不同尺寸
<Button size="small">小按钮</Button>
<Button size="medium">中按钮</Button>
<Button size="large">大按钮</Button>

// 禁用状态
<Button disabled>禁用按钮</Button>
```

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | string | 'primary' | 按钮样式变体 |
| size | string | 'medium' | 按钮尺寸 |
| disabled | boolean | false | 是否禁用 |
| onClick | function | - | 点击事件处理函数 |

### Card 卡片组件

一个灵活的卡片组件，用于展示内容。

#### 使用方法

```jsx
import { Card } from './components'

// 基础用法
<Card>卡片内容</Card>

// 带标题和副标题
<Card title="卡片标题" subtitle="卡片副标题">
  卡片内容
</Card>

// 不同变体
<Card variant="default">默认卡片</Card>
<Card variant="elevated">阴影卡片</Card>
<Card variant="outlined">边框卡片</Card>
<Card variant="primary">主要卡片</Card>
<Card variant="success">成功卡片</Card>
<Card variant="warning">警告卡片</Card>
<Card variant="danger">危险卡片</Card>

// 可点击卡片
<Card onClick={() => console.log('卡片被点击')}>
  点击我
</Card>
```

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | string | - | 卡片标题 |
| subtitle | string | - | 卡片副标题 |
| variant | string | 'default' | 卡片样式变体 |
| onClick | function | - | 点击事件处理函数 |

### Badge 徽章组件

一个用于显示状态、标签或计数的徽章组件。

#### 使用方法

```jsx
import { Badge } from './components'

// 基础用法
<Badge>默认徽章</Badge>

// 不同变体
<Badge variant="primary">主要徽章</Badge>
<Badge variant="secondary">次要徽章</Badge>
<Badge variant="success">成功徽章</Badge>
<Badge variant="warning">警告徽章</Badge>
<Badge variant="danger">危险徽章</Badge>
<Badge variant="info">信息徽章</Badge>
<Badge variant="light">浅色徽章</Badge>
<Badge variant="dark">深色徽章</Badge>

// 不同尺寸
<Badge size="small">小徽章</Badge>
<Badge size="medium">中徽章</Badge>
<Badge size="large">大徽章</Badge>
```

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | string | 'default' | 徽章样式变体 |
| size | string | 'medium' | 徽章尺寸 |

## 导入方式

### 统一导入

```jsx
import { Button, Card, Badge } from './components'
```

### 单独导入

```jsx
import Button from './components/Button'
import Card from './components/Card'
import Badge from './components/Badge'
```

## 样式定制

所有组件都使用CSS模块化设计，可以通过以下方式定制样式：

1. 修改对应的CSS文件
2. 使用className属性添加自定义类名
3. 通过CSS变量覆盖默认样式

## 响应式设计

所有组件都支持响应式设计，在移动设备上会自动调整布局和尺寸。

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+ 

# 图片管理组件

这个文件夹包含了图片管理相关的 React 组件。

## Todo 组件

Todo 组件是一个用于管理和处理图片的弹窗组件，支持两种模式的图片展示：

### 功能特性

1. **双标签页模式**
   - 原图标签：展示原始图片
   - 待处理图片标签：按分组展示需要处理的图片

2. **图片预览**
   - 支持全屏预览
   - 放大镜功能（鼠标悬停查看细节）
   - 键盘快捷键支持（ESC关闭，左右箭头切换）

3. **拖拽排序**
   - 支持在同一分组内重新排序
   - 兼容浏览器和UXP环境

4. **Photoshop集成** （UXP环境专用）
   - 拖拽图片到Photoshop画布
   - **新功能：用画布图片替换现有图片**

### 新增功能：画布替换

在UXP环境（Photoshop插件）中，现在可以用当前Photoshop画布的内容替换预览中的图片：

1. **触发方式**：
   - 在待处理图片标签页中，点击任意图片打开预览
   - 在预览层左上角会显示"🎨 用画布替换"按钮

2. **功能流程**：
   - 导出当前Photoshop画布为PNG图片
   - 上传到服务器
   - 自动替换当前预览的图片
   - 同步更新父组件数据

3. **使用限制**：
   - 仅在UXP环境中可用
   - 需要有活动的Photoshop文档
   - 仅支持待处理图片（不支持原图替换）

4. **状态反馈**：
   - 显示处理进度（导出→读取→上传）
   - 成功后自动更新预览
   - 错误时显示详细错误信息

### 技术实现

画布替换功能的技术要点：

1. **画布导出**：使用Photoshop的`batchPlay` API执行PNG导出
2. **文件读取**：通过UXP文件系统API读取导出的图片数据
3. **上传处理**：将ArrayBuffer转换为Blob，通过FormData上传
4. **状态同步**：更新本地state和父组件数据结构

### 样式说明

- 替换按钮采用蓝色主题，与UXP环境风格一致
- 支持hover效果和禁用状态
- 在非UXP环境中自动隐藏 