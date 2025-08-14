import React from 'react'
import './Confirm.css'

/**
 * 自定义确认弹窗
 * - 所有文案与注释为中文
 */
const Confirm = ({
  open,
  title = '确认操作',
  message = '是否确认执行该操作？',
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <div
            className="action-btn secondary"
            onClick={onCancel}
          >
            {cancelText}
          </div>
          <div
            className="action-btn primary"
            onClick={onConfirm}
          >
            {confirmText}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Confirm 