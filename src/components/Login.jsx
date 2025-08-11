import React, { useState } from 'react'
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

  // 固定的期望账号与密码
  const EXPECTED = {
    userName: 'gala',
    passWord: '529595ll%'
  }

  // 登录处理（本地校验）
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      // 简单前端校验（实际项目应调用后端接口）
      if (userName.trim() !== EXPECTED.userName || passWord !== EXPECTED.passWord) {
        throw new Error('用户名或密码错误')
      }

      // 构造返回信息（按需求返回结构）
      const resp = {
        success: true,
        data: {
          UserId: 14552,
          UserCode: '9130',
          LoginName: 'Gala',
          Name: '刘长群',
          Email: null,
          OrganizationName: '研发',
          PositionName: '开发工程师',
          Phone: null,
        },
        message: ''
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

  return (
    <div className="login-overlay">
      <div className="login-dialog">
        <div className="login-title">系统登录</div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label">用户名</label>
          <input
            className="login-input"
            type="text"
            placeholder="请输入用户名"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            autoFocus
          />

          <label className="login-label">密码</label>
          <input
            className="login-input"
            type="password"
            placeholder="请输入密码"
            value={passWord}
            onChange={(e) => setPassWord(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login 