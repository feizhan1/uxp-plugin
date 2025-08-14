import React, { useState, useMemo, useRef, useEffect } from 'react'
import { post } from '../utils/http'
import './Login.css'

/**
 * 固定布局登录组件
 * - 未登录时显示在屏幕正中，遮罩底层内容
 * - 校验用户名与密码，成功后将返回信息写入 localStorage
 * - 文案与注释均为中文
 */
const Login = ({ onSuccess }) => {
  const [userName, setUserName] = useState('')
  const [passWord, setPassWord] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const userNameRef = useRef(null)
  const passWordRef = useRef(null)

  // UXP 环境检测（保守特征探测）
  const isUXP = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = (navigator?.userAgent || '').toLowerCase()
    return Boolean(window.uxp) || ua.includes('uxp') || ua.includes('adobe')
  }, [])

  const test = (value) => {
    console.log('test', value)
  }

  // 登录处理（本地校验）
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      // 简单前端校验（实际项目应调用后端接口）
      console.log('handleSubmit', userName, passWord)
      if (!userName) {
        throw new Error('请输入用户名')
      }
      if (!passWord) {
        throw new Error('请输入密码')
      }

      const resp = await post('/Account/SimpleSignIn', {
        userName,
        passWord
      }, {
        baseUrl: 'https://sts.sjlpj.cn',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' }
      })
      const { success } = resp || {}
      if (!success) {
        throw new Error(resp.message)
      }

      // 写入 localStorage
      localStorage.setItem('loginInfo', JSON.stringify(resp))

      // 通知父组件
      onSuccess && onSuccess(resp)
    } catch (err) {
      setError(err?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  // 绑定 UXP 自定义元素事件（sp-textfield 的 input 事件）
  useEffect(() => {
    const userEl = userNameRef.current
    const passEl = passWordRef.current
    const handleUserInput = (e) => {
      const newValue = e?.target?.value ?? e?.detail?.value ?? ''
      setUserName(newValue)
      test(newValue)
    }
    const handlePassInput = (e) => {
      const newValue = e?.target?.value ?? e?.detail?.value ?? ''
      setPassWord(newValue)
      test(newValue)
    }
    if (userEl) userEl.addEventListener('input', handleUserInput)
    if (passEl) passEl.addEventListener('input', handlePassInput)
    return () => {
      if (userEl) userEl.removeEventListener('input', handleUserInput)
      if (passEl) passEl.removeEventListener('input', handlePassInput)
    }
  }, [])

  // 将受控值同步到 UXP 自定义元素的 value 属性
  useEffect(() => {
    if (userNameRef.current && userNameRef.current.value !== userName) {
      userNameRef.current.value = userName
    }
  }, [userName])

  useEffect(() => {
    if (passWordRef.current && passWordRef.current.value !== passWord) {
      passWordRef.current.value = passWord
    }
  }, [passWord])

  return (
    <div className="login-overlay">
      <div className="login-dialog">
        <div className="login-title">登录</div>
        {/* 在非 UXP 环境中显示登录按钮 */}
        {!isUXP && <div className='login-form'>
          <div>
            <label>用户名</label>
            <input
                type="text"
                placeholder="请输入用户名"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
            ></input>
          </div>
          <div style={{marginTop: '10px'}}>
            <label>密码</label>
            <input
                type="password"
                placeholder="请输入密码"
                value={passWord}
                onChange={(e) => setPassWord(e.target.value)}
            ></input>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-button" type="submit" disabled={loading} onClick={handleSubmit}>
              {loading ? '登录中...' : '登录'}
          </button>
        </div>}
        {/* 在 UXP 环境中显示登录表单 */}
          {isUXP && <div className='login-form'>
          <div>
            <sp-field-label for="tel-1">用户名</sp-field-label>
            <sp-textfield
                id="tel-1"
                type="text"
                placeholder="请输入用户名"
                value={userName}
                  ref={userNameRef}
            ></sp-textfield>
          </div>
          <div style={{marginTop: '10px'}}>
            <sp-field-label for="password-1">密码</sp-field-label>
            <sp-textfield
                id="password-1"
                type="password"
                placeholder="请输入密码"
                value={passWord}
                  ref={passWordRef}
            ></sp-textfield>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-button" type="submit" disabled={loading} onClick={handleSubmit}>
              {loading ? '登录中...' : '登录'}
          </button>
        </div>}
      </div>
    </div>
  )
}

export default Login 