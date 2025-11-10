import React, { useState, useEffect } from 'react'
import './InputDialog.css'

/**
 * 输入对话框组件
 * 用于输入产品编号等信息
 */
const InputDialog = ({
  open,
  title = '输入信息',
  label = '请输入',
  placeholder = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  defaultValue = ''
}) => {
  const [inputValue, setInputValue] = useState(defaultValue)

  // 当对话框打开时，重置输入值
  useEffect(() => {
    if (open) {
      setInputValue(defaultValue)
    }
  }, [open, defaultValue])

  if (!open) return null

  const handleConfirm = () => {
    if (inputValue.trim()) {
      onConfirm(inputValue.trim())
      setInputValue('')
    }
  }

  const handleCancel = () => {
    setInputValue('')
    onCancel()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div className="input-dialog-overlay" role="dialog" aria-modal="true">
      <div className="input-dialog">
        <div className="input-dialog-title">{title}</div>
        <div className="input-dialog-content">
          {label && <label className="input-label">{label}</label>}
          <input
            type="text"
            className="input-field"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div className="input-dialog-actions">
          <div
            className="action-btn secondary"
            onClick={handleCancel}
          >
            {cancelText}
          </div>
          <div
            className={`action-btn primary ${!inputValue.trim() ? 'disabled' : ''}`}
            onClick={handleConfirm}
          >
            {confirmText}
          </div>
        </div>
      </div>
    </div>
  )
}

export default InputDialog
