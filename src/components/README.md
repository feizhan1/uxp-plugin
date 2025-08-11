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