import React, { useState, useEffect } from "react";
import { Todo } from '../components'
import { Toast } from '../components'
import { Confirm } from '../components'
import Login from '../components/Login'
import { get } from '../utils/http'
import { post } from '../utils/http'
import './TodoList.css'

const TodoList = () => {
  const [showTodo, setShowTodo] = useState(false)
  const [loginInfo, setLoginInfo] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [openIngIndex, setOpenIngIndex] = useState(null)
  const [errorDuration] = useState(4000)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [successDuration] = useState(3000)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
// loginInfo
//   {
//     "success": true,
//     "data": {
//         "UserId": 14552,
//         "UserCode": "9130",
//         "LoginName": "Gala",
//         "Name": "刘长群",
//         "Email": null,
//         "OrganizationName": "研发",
//         "PositionName": "开发工程师",
//         "Phone": null
//     },
//     "message": ""
// }

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

  // 登录成功后获取数据
  useEffect(() => {
    if (!loginInfo?.success) return
    let cancelled = false

    async function fetchList() {
      setLoading(true)
      setError(null)
      try {
        const res = await get('/api/publish/get_product_list', {
          params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
        })
        const {statusCode, dataClass} = res  || {}
        if(statusCode === 200 && !cancelled) {
          setData(dataClass?.publishProductInfos || [])
        } else {
          throw new Error(res.message)
        }
      } catch (e) {
        console.error('获取产品列表失败：', e)
        if (!cancelled) setError(e?.message || '获取待办工单失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchList()
    return () => { cancelled = true }
  }, [loginInfo])

  // 点击“去处理”时，请求详情后再打开
  const handleOpenItem = async (item, index) => {
    if(openIngIndex === index) return
    if (!item) return
    setOpenLoading(true)
    setOpenIngIndex(index)
    setError(null)
    try {
      const params = {
        applyCode: item.applyCode,
        userId: loginInfo?.data?.UserId,
        userCode: loginInfo?.data?.UserCode,
      }
      const res = await get('/api/publish/get_product_images', {
        params,
      })
      const {statusCode, dataClass} = res  || {}
      if(statusCode === 200) {
        setShowTodo({
          ...item,
          ...(dataClass || {}),
          ...params
        })
      } else {
        throw new Error(res.message)
      }
    } catch (e) {
      console.error('获取产品图片失败：', e)
      setError(e?.message || '获取待办工单图片失败')
    } finally {
      setOpenLoading(false)
      setOpenIngIndex(null)
    }
  }

  // 监听数据变化（用于调试）
  useEffect(() => {
    console.log('TodoList 数据已更新：', data)
  }, [data])

  // 处理更新状态的方法（当 newStatus 为“审核完成”时发起提交）
  const handleUpdate = async (id, newStatus) => {
    console.log('处理状态更新，ID:', id, '新状态:', newStatus)
    if (newStatus === '审核完成') {
      try {
        setError(null)
        const payload = {
          ...showTodo,
          userId: loginInfo.data.UserId,
          userCode: loginInfo.data.UserCode,
        }
        console.log('handleUpdate payload', payload)
        const res = await post('/api/publish/submit_product_image', payload, { headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' } })
        const { statusCode, message, errors } = res || {}
        if (statusCode !== 200) {
          if(errors) {
            const errorMessage = Object.values(errors).flat().join('\n')
            throw new Error(errorMessage || message)
          } else {
            throw new Error(message)
          }
        }
        // 审核提交成功后，关闭弹层
        setShowTodo(false)
        // 弹出成功提示
        setSuccessMsg(message || '提交成功')
        // 重新获取数据
        try {
          setLoading(true)
          const listRes = await get('/api/publish/get_product_list', {
            params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
          })
          const { statusCode: listStatusCode, dataClass: listDataClass } = listRes || {}
          if (listStatusCode === 200) {
            setData(listDataClass?.publishProductInfos || [])
          } else {
            throw new Error(listRes.message)
          }
        } catch (refreshErr) {
          console.warn('重新获取产品列表异常：', refreshErr)
        } finally {
          setLoading(false)
        }
        
        return
      } catch (e) {
        console.error('提交审核失败：', e)
        setError(e?.message || '提交审核失败')
        return
      }
    }

    // 默认分支：仅本地更新
    setData(prevData => {
      const updatedData = prevData.map(item => 
        (item.applyCode === id || item.id === id) ? { ...item, status: newStatus } : item
      )
      console.log('状态更新后的数据:', updatedData)
      return updatedData
    })
    setShowTodo(false) // 更新后关闭Todo组件
  }

  // 处理重新排序/删除回调
  const handleReorder = (id, payload) => {
    console.log('收到重排序/删除回调，ID:', id, 'payload:', payload)
    
    // 更新主数据
    setData(prev => {
      const updatedData = prev.map(item => 
        (item.applyCode === id || item.id === id) ? { ...item, ...payload } : item
      )
      console.log('主数据更新后:', updatedData.find(item => item.applyCode === id || item.id === id))
      return updatedData
    })
    
    // 更新 Todo 对话框中的数据
    setShowTodo(prev => {
      if (prev && (prev.applyCode === id || prev.id === id)) {
        const updatedTodoData = { ...prev, ...payload }
        console.log('Todo 数据更新后:', updatedTodoData)
        return updatedTodoData
      }
      return prev
    })
  }

  // 关闭Todo组件的方法（先弹窗确认）
  const handleClose = () => {
    setShowCloseConfirm(true)
  }

  // 确认关闭执行
  const doClose = () => {
    setShowCloseConfirm(false)
    setShowTodo(false)
    setError(null)
  }

  // 确认退出登录
  const handleLogout = () => {
    try {
      localStorage.removeItem('loginInfo')
    } catch {
      // 忽略本地存储异常
    }
    setShowLogoutConfirm(false)
    setShowTodo(false)
    setData([])
    setError(null)
    setLoginInfo(null)
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
      {loginInfo?.success && (
        <div
          className="login-badge"
          onClick={() => setShowLogoutConfirm(true)}
        >
          已登录
        </div>
      )}
      {/* 加载中 */}
      {loading && <div className="loading">加载中...</div>}
      {/* 打开中 */}
      {openLoading && <div className="loading">打开中...</div>}
      {/* 错误提示（可自定义时长的弹窗） */}
      <Toast 
        open={!!error}
        type="error"
        message={error || ''}
        duration={errorDuration}
        onClose={() => setError(null)}
        position="top"
      />
      {/* 成功提示（审核提交成功） */}
      <Toast
        open={!!successMsg}
        type="success"
        message={successMsg}
        duration={successDuration}
        onClose={() => setSuccessMsg('')}
        position="top"
      />
      {/* 退出登录确认 */}
      <Confirm
        open={showLogoutConfirm}
        title="退出登录"
        message="退出后需要重新登录，确定要退出吗？"
        confirmText="退出"
        cancelText="取消"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
      {/* 关闭 Todo 确认 */}
      <Confirm
        open={showCloseConfirm}
        title="关闭确认"
        message="确定要关闭当前工单？未提交的更改将不会保存。"
        confirmText="关闭"
        cancelText="取消"
        onCancel={() => setShowCloseConfirm(false)}
        onConfirm={doClose}
      />
      {/* 列表 */}
      {/* 列表为空时，显示提示 */}
      { !loading && !error && data.length === 0 && (
        <div className='empty'>
          暂无待办工单
        </div>
      )}
      {data.length > 0 && <div className='list'>
        {data.map((item, index) => (
          <div className='item' key={item.applyCode || item.id}>
            <div className='left'>
              <div className='id'><div className='label'>流水编号:</div><div className='value'>{item.applyCode}</div></div>
              <div style={{ marginTop: '10px' }} className='name'><div className='label'>产品名称:</div><div className='value'>{item.productName}</div></div>
            </div>
            <div className='right'>
              <div className={`action-btn primary ${openIngIndex === index ? 'disabled' : ''}`} onClick={() => handleOpenItem(item, index)}>去处理</div>
            </div>
          </div>
        ))}
      </div>}
      {/* Todo 对话框 */}
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