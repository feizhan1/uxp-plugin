import './Button.css'

// Button组件 - 可复用的按钮组件
function Button({ 
  children, 
  variant = 'primary', 
  size = 'medium', 
  onClick, 
  disabled = false,
  type = 'button',
  className = '',
  ...props 
}) {
  // 根据variant和size生成CSS类名
  const buttonClasses = [
    'custom-button',
    `button-${variant}`,
    `button-${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button 