import './Card.css'

// Card组件 - 可复用的卡片组件
function Card({ 
  children, 
  title, 
  subtitle,
  variant = 'default',
  className = '',
  onClick,
  ...props 
}) {
  const cardClasses = [
    'custom-card',
    `card-${variant}`,
    onClick ? 'card-clickable' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <div 
      className={cardClasses}
      onClick={onClick}
      {...props}
    >
      {(title || subtitle) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="card-content">
        {children}
      </div>
    </div>
  )
}

export default Card 