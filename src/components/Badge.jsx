import './Badge.css'

// Badge组件 - 可复用的徽章组件
function Badge({ 
  children, 
  variant = 'default',
  size = 'medium',
  className = '',
  ...props 
}) {
  const badgeClasses = [
    'custom-badge',
    `badge-${variant}`,
    `badge-${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <span className={badgeClasses} {...props}>
      {children}
    </span>
  )
}

export default Badge 