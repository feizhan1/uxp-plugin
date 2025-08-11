# React实践学习指南

## 🎯 学习目标

通过这个实践指南，你将逐步掌握React的核心概念，并在这个UXP插件项目中应用它们。

## 📋 准备工作

### 1. 环境检查
确保你已经安装了必要的工具：
```bash
# 检查Node.js版本
node --version

# 检查npm版本
npm --version

# 安装项目依赖
npm install
```

### 2. 项目启动
```bash
# 构建项目（开发模式）
npm run build

# 监听文件变化（推荐开发时使用）
npm run watch
```

## 🚀 实践练习

### 练习1: 理解基础组件结构

**目标**: 理解React组件的基本结构和JSX语法

**步骤1**: 查看并分析`Hello.jsx`组件
```jsx
// src/components/Hello.jsx
import React from "react";

export const Hello = (props) => {
    return (
        <sp-body>Hello, {props.message || "world"} test test test</sp-body>
    );
}
```

**任务**: 修改Hello组件，添加更多功能
```jsx
// 修改后的Hello.jsx
import React, { useState } from "react";

export const Hello = (props) => {
    // 添加状态管理
    const [isVisible, setIsVisible] = useState(true);
    const [clickCount, setClickCount] = useState(0);

    // 切换显示状态的函数
    const toggleVisibility = () => {
        setIsVisible(!isVisible);
    };

    // 增加点击计数的函数
    const handleClick = () => {
        setClickCount(clickCount + 1);
    };

    return (
        <div style={{ padding: "10px", border: "1px solid #ccc", margin: "10px" }}>
            <sp-body>Hello, {props.message || "world"}!</sp-body>
            
            {/* 条件渲染 */}
            {isVisible && (
                <sp-body>这是一个可以隐藏的消息</sp-body>
            )}
            
            {/* 交互按钮 */}
            <div style={{ marginTop: "10px" }}>
                <sp-button onClick={toggleVisibility}>
                    {isVisible ? "隐藏消息" : "显示消息"}
                </sp-button>
                
                <sp-button onClick={handleClick} style={{ marginLeft: "10px" }}>
                    点击我 ({clickCount})
                </sp-button>
            </div>
        </div>
    );
}
```

**学习要点**:
- 组件的导入和导出
- JSX语法的使用
- props的接收和使用
- useState Hook的应用
- 事件处理函数
- 条件渲染

### 练习2: 创建自定义组件

**目标**: 学习创建和使用自定义React组件

**任务**: 创建一个待办事项组件

**步骤1**: 创建`TodoItem.jsx`组件
```jsx
// src/components/TodoItem.jsx
import React, { useState } from "react";

export const TodoItem = ({ task, onDelete, onToggle, completed = false }) => {
    return (
        <div style={{ 
            display: "flex", 
            alignItems: "center", 
            padding: "8px",
            backgroundColor: completed ? "#f0f0f0" : "white",
            border: "1px solid #ddd",
            marginBottom: "5px"
        }}>
            {/* 复选框 */}
            <input 
                type="checkbox" 
                checked={completed}
                onChange={() => onToggle()}
                style={{ marginRight: "10px" }}
            />
            
            {/* 任务文本 */}
            <sp-body style={{ 
                flex: 1, 
                textDecoration: completed ? "line-through" : "none",
                color: completed ? "#666" : "#000"
            }}>
                {task}
            </sp-body>
            
            {/* 删除按钮 */}
            <sp-button onClick={() => onDelete()}>
                删除
            </sp-button>
        </div>
    );
};
```

**步骤2**: 创建`TodoList.jsx`组件
```jsx
// src/components/TodoList.jsx
import React, { useState } from "react";
import { TodoItem } from "./TodoItem.jsx";

export const TodoList = () => {
    // 待办事项列表状态
    const [todos, setTodos] = useState([
        { id: 1, task: "学习React基础", completed: false },
        { id: 2, task: "理解组件概念", completed: true },
        { id: 3, task: "掌握状态管理", completed: false }
    ]);
    
    // 新任务输入状态
    const [newTask, setNewTask] = useState("");

    // 添加新任务
    const addTodo = () => {
        if (newTask.trim() !== "") {
            const newTodo = {
                id: Date.now(), // 简单的ID生成
                task: newTask,
                completed: false
            };
            setTodos([...todos, newTodo]);
            setNewTask(""); // 清空输入框
        }
    };

    // 删除任务
    const deleteTodo = (id) => {
        setTodos(todos.filter(todo => todo.id !== id));
    };

    // 切换任务完成状态
    const toggleTodo = (id) => {
        setTodos(todos.map(todo => 
            todo.id === id 
                ? { ...todo, completed: !todo.completed }
                : todo
        ));
    };

    return (
        <div style={{ padding: "20px" }}>
            <h2>📝 我的待办事项</h2>
            
            {/* 添加新任务 */}
            <div style={{ marginBottom: "20px" }}>
                <sp-textfield 
                    value={newTask}
                    placeholder="输入新任务..."
                    onInput={(e) => setNewTask(e.target.value)}
                    style={{ marginRight: "10px", width: "200px" }}
                />
                <sp-button onClick={addTodo}>
                    添加任务
                </sp-button>
            </div>
            
            {/* 任务统计 */}
            <sp-body style={{ marginBottom: "10px" }}>
                总任务: {todos.length} | 
                已完成: {todos.filter(todo => todo.completed).length} | 
                待完成: {todos.filter(todo => !todo.completed).length}
            </sp-body>
            
            {/* 任务列表 */}
            <div>
                {todos.length === 0 ? (
                    <sp-body>暂无任务，添加一个新任务开始吧！</sp-body>
                ) : (
                    todos.map(todo => (
                        <TodoItem
                            key={todo.id}
                            task={todo.task}
                            completed={todo.completed}
                            onDelete={() => deleteTodo(todo.id)}
                            onToggle={() => toggleTodo(todo.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
```

**步骤3**: 将TodoList添加到演示面板中
```jsx
// 修改 src/panels/Demos.jsx
import React from "react";
import { ColorPicker } from "../components/ColorPicker.jsx";
import { TodoList } from "../components/TodoList.jsx";

export const Demos = () => {
    return (
        <>
            <ColorPicker />
            <hr style={{ margin: "20px 0" }} />
            <TodoList />
        </>
    );
}
```

**学习要点**:
- 组件间的数据传递（props）
- 回调函数的使用
- 数组状态的管理
- 条件渲染
- 列表渲染（map函数）
- 组件组合

### 练习3: 深入理解useState和事件处理

**目标**: 掌握更复杂的状态管理和用户交互

**任务**: 创建一个简单的计算器组件

```jsx
// src/components/Calculator.jsx
import React, { useState } from "react";

export const Calculator = () => {
    // 显示值状态
    const [display, setDisplay] = useState("0");
    // 前一个值状态
    const [previousValue, setPreviousValue] = useState(null);
    // 操作符状态
    const [operator, setOperator] = useState(null);
    // 等待操作数状态
    const [waitingForOperand, setWaitingForOperand] = useState(false);

    // 输入数字
    const inputNumber = (num) => {
        if (waitingForOperand) {
            setDisplay(String(num));
            setWaitingForOperand(false);
        } else {
            setDisplay(display === "0" ? String(num) : display + num);
        }
    };

    // 输入小数点
    const inputDecimal = () => {
        if (waitingForOperand) {
            setDisplay("0.");
            setWaitingForOperand(false);
        } else if (display.indexOf(".") === -1) {
            setDisplay(display + ".");
        }
    };

    // 清除
    const clear = () => {
        setDisplay("0");
        setPreviousValue(null);
        setOperator(null);
        setWaitingForOperand(false);
    };

    // 执行操作
    const performOperation = (nextOperator) => {
        const inputValue = parseFloat(display);

        if (previousValue === null) {
            setPreviousValue(inputValue);
        } else if (operator) {
            const currentValue = previousValue || 0;
            const newValue = calculate(currentValue, inputValue, operator);

            setDisplay(String(newValue));
            setPreviousValue(newValue);
        }

        setWaitingForOperand(true);
        setOperator(nextOperator);
    };

    // 计算函数
    const calculate = (firstValue, secondValue, operator) => {
        switch (operator) {
            case "+":
                return firstValue + secondValue;
            case "-":
                return firstValue - secondValue;
            case "×":
                return firstValue * secondValue;
            case "÷":
                return firstValue / secondValue;
            case "=":
                return secondValue;
            default:
                return secondValue;
        }
    };

    // 按钮样式
    const buttonStyle = {
        padding: "15px",
        margin: "2px",
        border: "none",
        borderRadius: "4px",
        fontSize: "16px",
        cursor: "pointer",
        minWidth: "50px"
    };

    const numberButtonStyle = {
        ...buttonStyle,
        backgroundColor: "#f0f0f0"
    };

    const operatorButtonStyle = {
        ...buttonStyle,
        backgroundColor: "#007acc",
        color: "white"
    };

    return (
        <div style={{ 
            padding: "20px", 
            border: "2px solid #ddd", 
            borderRadius: "8px",
            maxWidth: "250px",
            margin: "20px auto"
        }}>
            <h3>🧮 简易计算器</h3>
            
            {/* 显示屏 */}
            <div style={{
                backgroundColor: "#000",
                color: "#0f0",
                padding: "10px",
                textAlign: "right",
                fontSize: "24px",
                fontFamily: "monospace",
                marginBottom: "10px",
                borderRadius: "4px",
                minHeight: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end"
            }}>
                {display}
            </div>

            {/* 按钮区域 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px" }}>
                {/* 第一行 */}
                <button style={operatorButtonStyle} onClick={clear}>C</button>
                <button style={operatorButtonStyle} onClick={() => performOperation("÷")}>÷</button>
                <button style={operatorButtonStyle} onClick={() => performOperation("×")}>×</button>
                <button style={operatorButtonStyle} onClick={() => performOperation("-")}>-</button>

                {/* 数字按钮 */}
                <button style={numberButtonStyle} onClick={() => inputNumber(7)}>7</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(8)}>8</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(9)}>9</button>
                <button style={operatorButtonStyle} onClick={() => performOperation("+")} rowSpan={2}>+</button>

                <button style={numberButtonStyle} onClick={() => inputNumber(4)}>4</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(5)}>5</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(6)}>6</button>

                <button style={numberButtonStyle} onClick={() => inputNumber(1)}>1</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(2)}>2</button>
                <button style={numberButtonStyle} onClick={() => inputNumber(3)}>3</button>
                <button style={operatorButtonStyle} onClick={() => performOperation("=")} rowSpan={2}>=</button>

                <button style={numberButtonStyle} onClick={() => inputNumber(0)} colSpan={2}>0</button>
                <button style={numberButtonStyle} onClick={inputDecimal}>.</button>
            </div>
        </div>
    );
};
```

### 练习4: 理解useRef Hook

**目标**: 学习使用useRef直接操作DOM元素

**任务**: 创建一个焦点管理组件

```jsx
// src/components/FocusManager.jsx
import React, { useRef, useState } from "react";

export const FocusManager = () => {
    // 创建输入框的ref引用
    const nameRef = useRef(null);
    const emailRef = useRef(null);
    const messageRef = useRef(null);
    
    // 表单数据状态
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        message: ""
    });

    // 聚焦到指定输入框
    const focusInput = (inputRef, inputName) => {
        inputRef.current.focus();
        console.log(`聚焦到${inputName}输入框`);
    };

    // 处理输入变化
    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // 清空表单并聚焦到第一个输入框
    const clearForm = () => {
        setFormData({
            name: "",
            email: "",
            message: ""
        });
        focusInput(nameRef, "姓名");
    };

    // 提交表单
    const submitForm = () => {
        if (!formData.name || !formData.email) {
            alert("请填写必填字段！");
            // 聚焦到第一个空字段
            if (!formData.name) {
                focusInput(nameRef, "姓名");
            } else if (!formData.email) {
                focusInput(emailRef, "邮箱");
            }
            return;
        }
        
        console.log("表单提交:", formData);
        alert("表单提交成功！");
        clearForm();
    };

    return (
        <div style={{ padding: "20px", border: "1px solid #ddd", margin: "10px" }}>
            <h3>📝 焦点管理示例</h3>
            
            {/* 快速聚焦按钮 */}
            <div style={{ marginBottom: "15px" }}>
                <sp-body>快速聚焦到：</sp-body>
                <button onClick={() => focusInput(nameRef, "姓名")}>姓名</button>
                <button onClick={() => focusInput(emailRef, "邮箱")}>邮箱</button>
                <button onClick={() => focusInput(messageRef, "留言")}>留言</button>
            </div>

            {/* 表单 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                    <sp-label>姓名 *</sp-label>
                    <sp-textfield
                        ref={nameRef}
                        value={formData.name}
                        placeholder="请输入姓名"
                        onInput={(e) => handleInputChange("name", e.target.value)}
                        style={{ width: "100%" }}
                    />
                </div>

                <div>
                    <sp-label>邮箱 *</sp-label>
                    <sp-textfield
                        ref={emailRef}
                        value={formData.email}
                        placeholder="请输入邮箱"
                        onInput={(e) => handleInputChange("email", e.target.value)}
                        style={{ width: "100%" }}
                    />
                </div>

                <div>
                    <sp-label>留言</sp-label>
                    <textarea
                        ref={messageRef}
                        value={formData.message}
                        placeholder="请输入留言（可选）"
                        onChange={(e) => handleInputChange("message", e.target.value)}
                        style={{ 
                            width: "100%", 
                            height: "80px", 
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc"
                        }}
                    />
                </div>

                {/* 操作按钮 */}
                <div style={{ display: "flex", gap: "10px" }}>
                    <sp-button onClick={submitForm}>提交表单</sp-button>
                    <sp-button onClick={clearForm}>清空表单</sp-button>
                </div>
            </div>

            {/* 表单数据预览 */}
            <div style={{ 
                marginTop: "15px", 
                padding: "10px", 
                backgroundColor: "#f5f5f5",
                borderRadius: "4px"
            }}>
                <sp-body><strong>当前表单数据：</strong></sp-body>
                <pre style={{ margin: "5px 0", fontSize: "12px" }}>
                    {JSON.stringify(formData, null, 2)}
                </pre>
            </div>
        </div>
    );
};
```

### 练习5: 组件通信和数据流

**目标**: 理解父子组件间的数据传递和状态提升

**任务**: 创建一个产品管理系统

```jsx
// src/components/ProductCard.jsx
import React from "react";

export const ProductCard = ({ product, onEdit, onDelete, onToggleStatus }) => {
    const cardStyle = {
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "15px",
        margin: "10px",
        backgroundColor: product.isActive ? "#f9f9f9" : "#ffe6e6",
        opacity: product.isActive ? 1 : 0.7
    };

    return (
        <div style={cardStyle}>
            <h4 style={{ margin: "0 0 10px 0", color: product.isActive ? "#333" : "#666" }}>
                {product.name}
            </h4>
            
            <sp-body>价格: ¥{product.price}</sp-body>
            <sp-body>库存: {product.stock}</sp-body>
            <sp-body>状态: {product.isActive ? "在售" : "下架"}</sp-body>
            
            <div style={{ marginTop: "10px", display: "flex", gap: "5px" }}>
                <sp-button onClick={() => onEdit(product)}>编辑</sp-button>
                <sp-button onClick={() => onToggleStatus(product.id)}>
                    {product.isActive ? "下架" : "上架"}
                </sp-button>
                <sp-button onClick={() => onDelete(product.id)}>删除</sp-button>
            </div>
        </div>
    );
};

// src/components/ProductForm.jsx
import React, { useState, useEffect } from "react";

export const ProductForm = ({ product, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        name: "",
        price: "",
        stock: "",
        isActive: true
    });

    // 当编辑产品时，用产品数据填充表单
    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name,
                price: product.price.toString(),
                stock: product.stock.toString(),
                isActive: product.isActive
            });
        }
    }, [product]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = () => {
        // 验证表单
        if (!formData.name || !formData.price || !formData.stock) {
            alert("请填写所有字段！");
            return;
        }

        // 准备保存的数据
        const productData = {
            ...formData,
            price: parseFloat(formData.price),
            stock: parseInt(formData.stock),
            id: product ? product.id : Date.now() // 编辑时保持原ID，新增时生成新ID
        };

        onSave(productData);
        
        // 清空表单
        setFormData({
            name: "",
            price: "",
            stock: "",
            isActive: true
        });
    };

    return (
        <div style={{ 
            border: "2px solid #007acc", 
            borderRadius: "8px", 
            padding: "15px", 
            margin: "10px",
            backgroundColor: "#f0f8ff"
        }}>
            <h3>{product ? "编辑产品" : "添加新产品"}</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                    <sp-label>产品名称</sp-label>
                    <sp-textfield
                        value={formData.name}
                        placeholder="请输入产品名称"
                        onInput={(e) => handleInputChange("name", e.target.value)}
                        style={{ width: "100%" }}
                    />
                </div>

                <div>
                    <sp-label>价格</sp-label>
                    <sp-textfield
                        value={formData.price}
                        type="number"
                        placeholder="请输入价格"
                        onInput={(e) => handleInputChange("price", e.target.value)}
                        style={{ width: "100%" }}
                    />
                </div>

                <div>
                    <sp-label>库存</sp-label>
                    <sp-textfield
                        value={formData.stock}
                        type="number"
                        placeholder="请输入库存数量"
                        onInput={(e) => handleInputChange("stock", e.target.value)}
                        style={{ width: "100%" }}
                    />
                </div>

                <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => handleInputChange("isActive", e.target.checked)}
                        />
                        <sp-body>产品上架</sp-body>
                    </label>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <sp-button onClick={handleSubmit}>
                        {product ? "保存修改" : "添加产品"}
                    </sp-button>
                    <sp-button onClick={onCancel}>取消</sp-button>
                </div>
            </div>
        </div>
    );
};

// src/components/ProductManager.jsx
import React, { useState } from "react";
import { ProductCard } from "./ProductCard.jsx";
import { ProductForm } from "./ProductForm.jsx";

export const ProductManager = () => {
    // 产品列表状态
    const [products, setProducts] = useState([
        { id: 1, name: "苹果 iPhone", price: 6999, stock: 50, isActive: true },
        { id: 2, name: "三星 Galaxy", price: 5999, stock: 30, isActive: true },
        { id: 3, name: "华为 Mate", price: 4999, stock: 0, isActive: false }
    ]);

    // 编辑状态
    const [editingProduct, setEditingProduct] = useState(null);
    const [showForm, setShowForm] = useState(false);

    // 保存产品（新增或编辑）
    const saveProduct = (productData) => {
        if (editingProduct) {
            // 编辑现有产品
            setProducts(products.map(p => 
                p.id === productData.id ? productData : p
            ));
        } else {
            // 添加新产品
            setProducts([...products, productData]);
        }
        
        // 重置状态
        setEditingProduct(null);
        setShowForm(false);
    };

    // 删除产品
    const deleteProduct = (id) => {
        if (confirm("确定要删除这个产品吗？")) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    // 切换产品状态
    const toggleProductStatus = (id) => {
        setProducts(products.map(p => 
            p.id === id ? { ...p, isActive: !p.isActive } : p
        ));
    };

    // 开始编辑产品
    const startEdit = (product) => {
        setEditingProduct(product);
        setShowForm(true);
    };

    // 取消编辑
    const cancelEdit = () => {
        setEditingProduct(null);
        setShowForm(false);
    };

    // 开始添加新产品
    const startAdd = () => {
        setEditingProduct(null);
        setShowForm(true);
    };

    // 统计信息
    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.isActive).length;
    const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);

    return (
        <div style={{ padding: "20px" }}>
            <h2>🛍️ 产品管理系统</h2>
            
            {/* 统计信息 */}
            <div style={{ 
                backgroundColor: "#e8f4fd", 
                padding: "15px", 
                borderRadius: "8px", 
                marginBottom: "20px" 
            }}>
                <sp-body><strong>统计信息:</strong></sp-body>
                <sp-body>总产品数: {totalProducts}</sp-body>
                <sp-body>在售产品: {activeProducts}</sp-body>
                <sp-body>库存总价值: ¥{totalValue.toLocaleString()}</sp-body>
            </div>

            {/* 操作按钮 */}
            <div style={{ marginBottom: "20px" }}>
                <sp-button onClick={startAdd}>添加新产品</sp-button>
            </div>

            {/* 产品表单 */}
            {showForm && (
                <ProductForm
                    product={editingProduct}
                    onSave={saveProduct}
                    onCancel={cancelEdit}
                />
            )}

            {/* 产品列表 */}
            <div>
                <h3>产品列表</h3>
                {products.length === 0 ? (
                    <sp-body>暂无产品，点击"添加新产品"开始！</sp-body>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }}>
                        {products.map(product => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                onEdit={startEdit}
                                onDelete={deleteProduct}
                                onToggleStatus={toggleProductStatus}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
```

## 🎯 整合练习

将所有练习组件添加到你的演示面板中：

```jsx
// 修改 src/panels/MoreDemos.jsx
import React from "react";
import { Hello } from "../components/Hello.jsx";
import { TodoList } from "../components/TodoList.jsx";
import { Calculator } from "../components/Calculator.jsx";
import { FocusManager } from "../components/FocusManager.jsx";
import { ProductManager } from "../components/ProductManager.jsx";

export const MoreDemos = () => {
    return (
        <div style={{ padding: "10px" }}>
            <h1>🎯 React学习练习</h1>
            
            {/* 分隔各个练习 */}
            <div style={{ marginBottom: "30px" }}>
                <Hello message="React学习者" />
            </div>
            
            <hr style={{ margin: "20px 0" }} />
            
            <TodoList />
            
            <hr style={{ margin: "20px 0" }} />
            
            <Calculator />
            
            <hr style={{ margin: "20px 0" }} />
            
            <FocusManager />
            
            <hr style={{ margin: "20px 0" }} />
            
            <ProductManager />
        </div>
    );
};
```

## 📚 学习检查点

完成每个练习后，请确保你理解了：

### 练习1检查点:
- [ ] 组件的基本结构
- [ ] JSX语法规则
- [ ] props的使用方法
- [ ] useState Hook的基本用法
- [ ] 事件处理函数的编写

### 练习2检查点:
- [ ] 组件的创建和导出
- [ ] 组件间的数据传递
- [ ] 数组状态的管理
- [ ] 条件渲染和列表渲染
- [ ] 回调函数的使用

### 练习3检查点:
- [ ] 复杂状态管理
- [ ] 多个状态的协调
- [ ] 事件处理的高级用法
- [ ] 组件的样式管理

### 练习4检查点:
- [ ] useRef Hook的使用
- [ ] DOM元素的直接操作
- [ ] 表单验证和焦点管理
- [ ] useEffect Hook的基本用法

### 练习5检查点:
- [ ] 组件拆分和组合
- [ ] 状态提升的概念
- [ ] 父子组件通信
- [ ] 复杂数据流管理

## 🚀 下一步建议

1. **尝试修改练习**: 在现有练习基础上添加新功能
2. **创建自己的组件**: 结合学到的知识创建完全原创的组件
3. **学习React生态**: 探索React Router、Redux等工具
4. **性能优化**: 学习React.memo、useMemo等优化技术
5. **测试**: 为你的组件编写单元测试

记住，学习React最重要的是多动手实践！🎯 