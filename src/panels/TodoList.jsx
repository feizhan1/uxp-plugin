import { Todo } from '../components'
import { useState, useEffect } from 'react'
import './TodoList.css'
import Login from '../components/Login'
import todolist from '../mock/todolist.json'

const TodoList = () => {
  const [showTodo, setShowTodo] = useState(false)
  const [loginInfo, setLoginInfo] = useState(null)
  const [data, setData] = useState(todolist.dataClass)

  // 读取登录信息
  useEffect(() => {
    const raw = localStorage.getItem('loginInfo')
    console.log('raw', raw)
    if (raw) {
      try {
        const obj = JSON.parse(raw)
        if (obj?.success) setLoginInfo(obj)
      } catch (e) {
        console.warn('解析登录信息失败：localStorage.loginInfo 不是合法的 JSON 字符串', e)
      }
    }
  }, [])

  // 处理更新状态的方法
  const handleUpdate = (id, newStatus) => {
    setData(prevData => 
      prevData.map(item => 
        (item.applyCode === id || item.id === id) ? { ...item, status: newStatus } : item
      )
    )
    console.log('handleUpdate', data)
    setShowTodo(false) // 更新后关闭Todo组件
  }

  // 处理重新排序/删除回调
  const handleReorder = (id, payload) => {
    setData(prev => prev.map(item => (item.applyCode === id || item.id === id) ? { ...item, ...payload } : item))
    setShowTodo(prev => prev && (prev.applyCode === id || prev.id === id) ? { ...prev, ...payload } : prev)
    console.log('处理重新排序/删除回调', data)
  }

  // 关闭Todo组件的方法
  const handleClose = () => {
    setShowTodo(false)
  }

  // 登录成功回调
  const handleLoginSuccess = (info) => {
    setLoginInfo(info)
  }

  // 未登录时，显示登录组件
  if (!loginInfo?.success) {
    return (
      <>
        <div className="todo-list" />
        <Login onSuccess={handleLoginSuccess} />
      </>
    )
  }

  return (
    <div className="todo-list">
      {/* 右上角已登录标识 */}
      <div className="login-badge">已登录</div>
      <div className='list'>
        {data.map((item) => (
          <div className='item' key={item.applyCode || item.id}>
            <div className='left'>
              <div className='id'><div className='label'>流水编号:</div><div className='value'>{item.applyCode}</div></div>
              <div className='name'><div className='label'>产品名称:</div><div className='value'>{item.productName}</div></div>
            </div>
            <div className='right'>
              <button onClick={() => handleUpdate(item.applyCode || item.id, '审核完成')}>审核完成</button>
              <button onClick={() => setShowTodo(item)}>去处理</button>
            </div>
          </div>
        ))}
      </div>
      {showTodo && (
        <Todo 
          data={showTodo} 
          onClose={handleClose}
          onUpdate={handleUpdate}
          onReorder={handleReorder}
        />
      )}
    </div>
  )
}

export default TodoList