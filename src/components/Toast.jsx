import React, { useEffect, useRef } from 'react'
import './Toast.css'

/**
 * 轻提示/弹窗（非阻塞）
 * - 支持自定义时长自动关闭（毫秒）。duration=0 表示不自动关闭
 * - 类型：info/success/warning/error
 */
const Toast = ({
  open,
  message = '',
  type = 'info',
  duration = 3000,
  closable = true,
  onClose,
  position = 'top', // top | bottom
}) => {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        onClose && onClose()
      }, duration)
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open, duration, onClose])

  if (!open) return null

  return (
    <div className={`toast-container ${position}`}>
      <div className={`toast ${type}`} role="status" aria-live="polite">
        <span className="toast-message">{message}</span>
        {closable && (
          <button
            className="toast-close"
            aria-label="关闭"
            onClick={() => onClose && onClose()}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default Toast


