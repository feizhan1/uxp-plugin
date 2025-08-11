# sp-theme 主题定制指南

本文档介绍如何在 Adobe UXP 插件中使用 `sp-theme` 组件来定制 Adobe Spectrum Web Components 的主题。

## 概述

`sp-theme` 是 Adobe Spectrum Web Components 提供的主题容器组件，它允许你为整个应用或特定区域设置统一的主题样式。

## 核心概念

### 1. 主题属性

`sp-theme` 支持以下主要属性：

- `color`: 颜色模式 (`light`, `dark`)
- `scale`: 尺寸比例 (`medium`, `large`)
- `system`: 系统主题 (`spectrum`, `express`)

### 2. 主题层级

主题可以嵌套使用，子主题会继承父主题的设置，并可以覆盖特定属性。

## 实现方式

### 1. ThemeProvider 组件

我们创建了一个 `ThemeProvider` 组件来管理全局主题状态：

```jsx
import { ThemeProvider } from './components/ThemeProvider.jsx';

// 在应用根部使用
<ThemeProvider>
  <YourApp />
</ThemeProvider>
```

### 2. 主题配置

支持三种预设主题：

```javascript
const THEMES = {
    light: {
        name: "浅色主题",
        color: "light",
        scale: "medium"
    },
    dark: {
        name: "深色主题", 
        color: "dark",
        scale: "medium"
    },
    custom: {
        name: "自定义主题",
        color: "light",
        scale: "large",
        customColors: {
            "--sp-global-color-blue-400": "#0066cc",
            "--sp-global-color-red-400": "#e34850",
            // 更多自定义变量...
        }
    }
};
```

### 3. 主题切换

使用 `useTheme` Hook 来切换主题：

```jsx
import { useTheme } from './components/ThemeProvider.jsx';

const MyComponent = () => {
    const { currentTheme, switchTheme } = useTheme();
    
    return (
        <button onClick={() => switchTheme('dark')}>
            切换到深色主题
        </button>
    );
};
```

## CSS 变量系统

### 1. 全局颜色变量

Spectrum 提供了丰富的 CSS 变量系统：

```css
/* 主要颜色 */
--sp-global-color-blue-400
--sp-global-color-red-400
--sp-global-color-green-400

/* 背景颜色 */
--sp-alias-background-color-default
--sp-alias-background-color-secondary

/* 文本颜色 */
--sp-alias-text-color
--sp-alias-text-color-secondary
```

### 2. 自定义变量

你可以通过 CSS 变量来定制主题：

```css
sp-theme[color="custom"] {
    --sp-global-color-blue-400: #0066cc;
    --sp-alias-background-color-default: #f8f9fa;
}
```

## 最佳实践

### 1. 主题一致性

- 确保所有 Spectrum 组件都在 `sp-theme` 容器内
- 使用统一的主题变量而不是硬编码颜色
- 为不同主题提供适当的对比度

### 2. 响应式主题

支持系统主题偏好：

```css
@media (prefers-color-scheme: dark) {
    sp-theme:not([color]) {
        color: dark;
    }
}
```

### 3. 主题过渡

添加平滑的主题切换动画：

```css
sp-theme * {
    transition: background-color 0.3s ease, 
                color 0.3s ease, 
                border-color 0.3s ease;
}
```

## 组件示例

### 1. 基本使用

```jsx
import { WC } from './WC.jsx';

const MyComponent = () => (
    <WC>
        <sp-button variant="primary">主要按钮</sp-button>
        <sp-textfield placeholder="输入文本" />
    </WC>
);
```

### 2. 主题感知组件

```jsx
const ThemedComponent = () => {
    const { currentTheme } = useTheme();
    
    return (
        <div className={`component theme-${currentTheme}`}>
            <WC>
                <sp-badge variant="positive">
                    当前主题: {currentTheme}
                </sp-badge>
            </WC>
        </div>
    );
};
```

## 调试技巧

### 1. 检查主题状态

在浏览器开发者工具中检查 `sp-theme` 元素的属性：

```html
<sp-theme color="dark" scale="medium">
    <!-- 你的组件 -->
</sp-theme>
```

### 2. CSS 变量检查

使用开发者工具查看计算后的 CSS 变量值：

```javascript
// 在控制台中运行
getComputedStyle(document.documentElement)
    .getPropertyValue('--sp-alias-background-color-default');
```

## 常见问题

### 1. 主题不生效

- 确保组件在 `sp-theme` 容器内
- 检查 CSS 变量是否正确设置
- 验证主题属性值是否有效

### 2. 样式冲突

- 避免使用 `!important` 覆盖主题样式
- 使用主题变量而不是硬编码值
- 确保 CSS 选择器优先级正确

### 3. 性能优化

- 避免频繁切换主题
- 使用 CSS 变量而不是重新渲染组件
- 合理使用主题过渡动画

## 扩展阅读

- [Adobe Spectrum Web Components 文档](https://opensource.adobe.com/spectrum-web-components/)
- [UXP 开发指南](https://developer.adobe.com/photoshop/uxp/)
- [CSS 自定义属性](https://developer.mozilla.org/zh-CN/docs/Web/CSS/--*)