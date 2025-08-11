import React, { useState, useEffect, useRef, useMemo } from 'react'
import './Todo.css'
import Confirm from './Confirm'
import UploadToS3 from './UploadToS3'

const toObjectImages = (arr) => {
  const now = Date.now()
  return (Array.isArray(arr) ? arr : []).map((url, idx) => ({
    id: `${now}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    url,
  }))
}

// 从新数据结构中提取原图 URL
const extractOriginImageUrls = (data) => {
  return (data?.originalImages || [])
    .map(img => img?.imageUrl)
    .filter(Boolean)
}

// 构建扁平待处理图片，注入所属分组 key（sku-索引 或 scene）
const buildFlatWaitFromData = (data) => {
  const flat = []
  const now = Date.now()
  let idx = 0
  const skus = Array.isArray(data?.publishSkus) ? data.publishSkus : []
  skus.forEach((sku, i) => {
    const urls = (sku?.skuImages || []).map(x => x?.imageUrl).filter(Boolean)
    urls.forEach((url) => {
      flat.push({ id: `${now}-${idx++}-${Math.random().toString(36).slice(2, 8)}`, url, groupKey: `sku-${i}` })
    })
  })
  const sceneUrls = (data?.senceImages || []).map(x => x?.imageUrl).filter(Boolean)
  sceneUrls.forEach((url) => {
    flat.push({ id: `${now}-${idx++}-${Math.random().toString(36).slice(2, 8)}`, url, groupKey: 'scene' })
  })
  return flat
}

// 基于扁平数组与数据结构顺序，计算分组（保持 SKU 顺序 → 场景图）
const computeWaitGroups = (data, waitImages) => {
  const groups = []
  const skus = Array.isArray(data?.publishSkus) ? data.publishSkus : []
  skus.forEach((sku, i) => {
    const pairs = (sku?.attrClasses || []).map(a => `${a.attrName}:${a.attrValue}`).filter(Boolean)
    const title = pairs.length > 0 ? pairs.join('、') : `分组${i+1}`
    const indices = []
    waitImages.forEach((img, idx) => { if (img?.groupKey === `sku-${i}`) indices.push(idx) })
    if (indices.length > 0) groups.push({ key: `sku-${i}`, title, indices })
  })
  const sceneIndices = []
  waitImages.forEach((img, idx) => { if (img?.groupKey === 'scene') sceneIndices.push(idx) })
  if (sceneIndices.length > 0) groups.push({ key: 'scene', title: '场景图', indices: sceneIndices })
  return groups
}

// 工具：解析 sku 组索引
const parseSkuIndexFromKey = (key) => {
  if (typeof key !== 'string') return null
  const m = key.match(/^sku-(\d+)$/)
  return m ? Number(m[1]) : null
}

// 工具：由 url 列表构造 skuImages/senceImages 原始结构
const toIndexedImageObjs = (urls) => urls.map((u, i) => ({ imageUrl: u, index: i + 1 }))

const Todo = ({ data, onClose, onUpdate, onReorder }) => {
  const [activeTab, setActiveTab] = useState('wait') // 'origin' 或 'wait'
  const [draggedIndex, setDraggedIndex] = useState(null) // 当前拖拽的图片索引
  const [dragOverIndex, setDragOverIndex] = useState(null) // 拖拽悬停的图片索引
  const [draggedGroupKey, setDraggedGroupKey] = useState(null) // 当前拖拽图片所属分组 key
  const [originImages, setOriginImages] = useState([]) // 本地原图对象数组 [{id,url}]
  const [waitImages, setWaitImages] = useState([]) // 本地待处理对象数组 [{id,url,groupKey}]

  // 预览相关状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewList, setPreviewList] = useState([])

  // 删除确认弹窗状态（仍针对扁平 waitImages）
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null)

  // 放大镜相关
  const previewImgRef = useRef(null)
  const previewWrapRef = useRef(null)
  const [lensVisible, setLensVisible] = useState(false)
  const [lensStyle, setLensStyle] = useState({})
  const LENS_SIZE = 160
  const LENS_ZOOM = 2

  // 同步父级数据到本地状态（当data变化时刷新）
  useEffect(() => {
    // 原图：从 originalImages 提取
    const originUrls = extractOriginImageUrls(data)
    setOriginImages(toObjectImages(originUrls))

    // 待处理：根据数据结构（分色图 + 场景图）构建扁平数组并注入 groupKey
    setWaitImages(buildFlatWaitFromData(data))
  }, [data])

  // 分组信息与索引→分组的映射
  const waitGroups = useMemo(() => computeWaitGroups(data, waitImages), [data, waitImages])
  const indexToGroupKey = useMemo(() => {
    const map = new Map()
    waitImages.forEach((img, i) => map.set(i, img?.groupKey || null))
    return map
  }, [waitImages])

  // 放大镜移动事件（根据鼠标位置计算镜片背景）
  const handleLensMove = (e) => {
    const img = previewImgRef.current
    const wrap = previewWrapRef.current
    if (!img || !wrap) return

    const rect = img.getBoundingClientRect()
    const wrapRect = wrap.getBoundingClientRect()

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setLensVisible(false)
      return
    }

    const half = LENS_SIZE / 2
    const cx = Math.max(half, Math.min(x, rect.width - half))
    const cy = Math.max(half, Math.min(y, rect.height - half))

    const left = wrapRect.left + cx - half - wrapRect.left
    const top = wrapRect.top + cy - half - wrapRect.top

    const bgX = cx * LENS_ZOOM - half
    const bgY = cy * LENS_ZOOM - half

    const bgSizeX = rect.width * LENS_ZOOM
    const bgSizeY = rect.height * LENS_ZOOM

    setLensStyle({
      left: `${left}px`,
      top: `${top}px`,
      width: `${LENS_SIZE}px`,
      height: `${LENS_SIZE}px`,
      backgroundImage: `url(${previewList[previewIndex]})`,
      backgroundPosition: `-${bgX}px -${bgY}px`,
      backgroundSize: `${bgSizeX}px ${bgSizeY}px`,
    })
    setLensVisible(true)
  }

  // 处理图片加载错误
  const handleImageError = (e) => {
    e.target.style.display = 'none'
    e.target.nextSibling.style.display = 'flex'
  }

  // 打开图片预览（type 对应到扁平 waitImages 或 originImages）
  const openPreview = (type, index) => {
    const list = type === 'origin' ? originImages : waitImages
    if (!list || list.length === 0) return
    setPreviewList(list.map(i => i.url))
    setPreviewIndex(index)
    setIsPreviewOpen(true)
  }

  // 关闭图片预览
  const closePreview = () => {
    setIsPreviewOpen(false)
    setLensVisible(false)
  }

  // 上一张 / 下一张
  const showPrev = (e) => {
    if (e) e.stopPropagation()
    setPreviewIndex((i) => (i - 1 + previewList.length) % previewList.length)
  }
  const showNext = (e) => {
    if (e) e.stopPropagation()
    setPreviewIndex((i) => (i + 1) % previewList.length)
  }

  // 预览层键盘快捷键（Esc 关闭，左右切换）
  useEffect(() => {
    if (!isPreviewOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsPreviewOpen(false)
        setLensVisible(false)
      } else if (e.key === 'ArrowLeft') {
        showPrev()
      } else if (e.key === 'ArrowRight') {
        showNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPreviewOpen, previewList.length])

  // 删除待处理图片（触发确认）
  const requestDeleteWaitImage = (flatIndex) => {
    setPendingDeleteIndex(flatIndex)
    setConfirmOpen(true)
  }

  const confirmDelete = () => {
    if (pendingDeleteIndex == null) return
    const groupKey = indexToGroupKey.get(pendingDeleteIndex)

    const next = waitImages.filter((_, i) => i !== pendingDeleteIndex)
    setWaitImages(next)

    // 同步父组件：仅更新所在分组（基于 groupKey 过滤）
    if (groupKey) {
      const newUrls = next.filter(img => img?.groupKey === groupKey).map(img => img.url)
      const skuIdx = parseSkuIndexFromKey(groupKey)
      if (skuIdx != null) {
        const newPublishSkus = (data.publishSkus || []).map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(newUrls) } : sku)
        onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
      } else {
        onReorder && onReorder(data.id ?? data.applyCode, { senceImages: toIndexedImageObjs(newUrls) })
      }
    }

    setPendingDeleteIndex(null)
    setConfirmOpen(false)
  }

  const cancelDelete = () => {
    setPendingDeleteIndex(null)
    setConfirmOpen(false)
  }

  // 处理拖拽开始（使用扁平索引）
  const handleDragStart = (e, flatIndex) => {
    setDraggedIndex(flatIndex)
    setDraggedGroupKey(indexToGroupKey.get(flatIndex) || null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(flatIndex))
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDraggedGroupKey(null)
  }

  // 处理拖拽进入/悬停（使用扁平索引）
  const handleDragEnter = (e, flatIndex) => {
    e.preventDefault()
    const targetGroup = indexToGroupKey.get(flatIndex)
    if (draggedIndex !== null && draggedIndex !== flatIndex && draggedGroupKey && targetGroup === draggedGroupKey) {
      setDragOverIndex(flatIndex)
    }
  }
  const handleDragOver = (e, flatIndex) => {
    e.preventDefault()
    const targetGroup = indexToGroupKey.get(flatIndex)
    if (draggedGroupKey && targetGroup !== draggedGroupKey) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== flatIndex) setDragOverIndex(flatIndex)
  }

  // 处理拖拽离开
  const handleDragLeave = () => { setDragOverIndex(null) }

  // 处理拖拽放置（按扁平顺序重排，保持原有逻辑；并同步父组件结构，仅影响所在分组）
  const handleDrop = (e, dropFlatIndex) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropFlatIndex) return
    const targetGroup = indexToGroupKey.get(dropFlatIndex)
    if (draggedGroupKey && targetGroup !== draggedGroupKey) return

    const next = [...waitImages]
    const [draggedItem] = next.splice(draggedIndex, 1)
    // 规则：
    // - 从前往后拖动：插入到目标之后（insertIndex = dropFlatIndex）
    // - 从后往前拖动：插入到目标位置（insertIndex = dropFlatIndex）
    // 统一简化为 insertIndex = dropFlatIndex
    const insertIndex = dropFlatIndex
    next.splice(insertIndex, 0, draggedItem)

    setWaitImages(next)

    // 同步父组件：仅更新该分组（基于 groupKey 过滤）
    if (draggedGroupKey) {
      const newUrls = next.filter(img => img?.groupKey === draggedGroupKey).map(img => img.url)
      const skuIdx = parseSkuIndexFromKey(draggedGroupKey)
      if (skuIdx != null) {
        const newPublishSkus = (data.publishSkus || []).map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(newUrls) } : sku)
        onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
      } else {
        onReorder && onReorder(data.id ?? data.applyCode, { senceImages: toIndexedImageObjs(newUrls) })
      }
    }

    setDraggedIndex(null)
    setDragOverIndex(null)
    setDraggedGroupKey(null)
  }

  // 分组上传：只追加到当前分组尾部，并同步父组件原始结构
  const handleUploadedToGroup = (groupKey) => (info) => {
    if (!info?.url) return

    const skuIdx = parseSkuIndexFromKey(groupKey)

    if (skuIdx != null) {
      // 更新父组件 publishSkus 结构
      const prevSkus = Array.isArray(data?.publishSkus) ? data.publishSkus : []
      const target = prevSkus[skuIdx] || {}
      const prevUrls = (target.skuImages || []).map(x => x?.imageUrl).filter(Boolean)
      const nextUrls = [...prevUrls, info.url]
      const newPublishSkus = prevSkus.map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(nextUrls) } : sku)
      onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })

      // 同步本地扁平 waitImages：使用新结构重建并注入 groupKey
      const newData = { ...data, publishSkus: newPublishSkus }
      setWaitImages(buildFlatWaitFromData(newData))
    } else {
      // 场景图分组
      const prevScenes = (data?.senceImages || []).map(x => x?.imageUrl).filter(Boolean)
      const nextUrls = [...prevScenes, info.url]
      const newScenes = toIndexedImageObjs(nextUrls)
      onReorder && onReorder(data.id ?? data.applyCode, { senceImages: newScenes })

      // 同步本地扁平 waitImages：使用新结构重建并注入 groupKey
      const newData = { ...data, senceImages: newScenes }
      setWaitImages(buildFlatWaitFromData(newData))
    }
  }

  // 渲染原图网格（保持不变）
  const renderImageGrid = (images, type) => {
    if (!images || images.length === 0) {
      return (
        <div className="no-images">
          <p>暂无{type === 'origin' ? '原图' : '待处理图片'}</p>
        </div>
      )
    }

    const canDrag = type !== 'origin'

    return (
      <div className="image-grid">
        {images.map((item, index) => {
          const itemClass = `image-item${canDrag && draggedIndex === index ? ' dragging' : ''}${canDrag && dragOverIndex === index ? ' drag-over' : ''}${!canDrag ? ' no-drag' : ''}`
          return (
            <div 
              key={item.id}
              className={itemClass}
              draggable={canDrag}
              onDragStart={canDrag ? (e) => handleDragStart(e, index) : undefined}
              onDragEnd={canDrag ? handleDragEnd : undefined}
              onDragEnter={canDrag ? (e) => handleDragEnter(e, index) : undefined}
              onDragOver={canDrag ? (e) => handleDragOver(e, index) : undefined}
              onDragLeave={canDrag ? handleDragLeave : undefined}
              onDrop={canDrag ? (e) => handleDrop(e, index) : undefined}
              onClick={() => openPreview(type, index)}
            >
              {type === 'wait' && (
                <button
                  className="delete-btn"
                  title="删除图片"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestDeleteWaitImage(index) }}
                  draggable={false}
                >
                  ×
                </button>
              )}
              <img 
                src={item.url} 
                alt={`${type === 'origin' ? '原图' : '待处理图片'} ${index + 1}`} 
                loading="lazy"
                onError={handleImageError}
                draggable={false}
              />
              <div className="image-error" style={{display: 'none'}}>
                <span>图片加载失败</span>
              </div>
              {canDrag && (
                <div className="drag-hint">
                  <span>拖拽排序</span>
                </div>
              )}
            </div>
          )
        })}
        {type === 'wait' && (
          <div className="image-item no-drag upload-tile" key="upload-tile">
            <UploadToS3
              onUploaded={handleUploadedToGroup('scene')}
              buttonText="选择图片"
              uploadingText="上传中..."
            />
          </div>
        )}
      </div>
    )
  }

  // 渲染带分组标题的待处理图片（按归属分组，不改变底层扁平顺序和交互）；每组末尾有独立上传按钮
  const renderWaitImagesGrouped = () => {
    if (!waitImages || waitImages.length === 0) {
      return (
        <div className="no-images">
          <p>暂无待处理图片</p>
        </div>
      )
    }

    return (
      <div className="image-grid">
        {waitGroups.map((group) => {
          const { key, title, indices } = group
          return (
            <React.Fragment key={`group-${key}`}>
              <div className="group-header"><span>{title}</span></div>
              {indices.map((flatIndex) => {
                const item = waitImages[flatIndex]
                const itemClass = `image-item${draggedIndex === flatIndex ? ' dragging' : ''}${dragOverIndex === flatIndex ? ' drag-over' : ''}`
                return (
                  <div 
                    key={item.id}
                    className={itemClass}
                    draggable
                    onDragStart={(e) => handleDragStart(e, flatIndex)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleDragEnter(e, flatIndex)}
                    onDragOver={(e) => handleDragOver(e, flatIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, flatIndex)}
                    onClick={() => openPreview('wait', flatIndex)}
                  >
                    <button
                      className="delete-btn"
                      title="删除图片"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestDeleteWaitImage(flatIndex) }}
                      draggable={false}
                    >
                      ×
                    </button>
                    <img 
                      src={item.url} 
                      alt={`待处理图片 ${flatIndex + 1}`} 
                      loading="lazy"
                      onError={handleImageError}
                      draggable={false}
                    />
                    <div className="image-error" style={{display: 'none'}}>
                      <span>图片加载失败</span>
                    </div>
                    <div className="drag-hint">
                      <span>拖拽排序</span>
                    </div>
                  </div>
                )
              })}
              <div className="image-item no-drag upload-tile" key={`upload-${key}`}>
                <UploadToS3
                  onUploaded={handleUploadedToGroup(key)}
                  buttonText="选择图片"
                  uploadingText="上传中..."
                />
              </div>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div className="todo-modal">
      <div className="todo-content">
        {/* 右上角关闭按钮 */}
        <button className="close-btn" onClick={onClose}>×</button>

        {/* 无数据时显示简单提示 */}
        {!data ? (
          <>
            <h3>待处理项目</h3>
            <p>请选择一个项目进行处理</p>
            <button onClick={onClose}>关闭</button>
          </>
        ) : (
          <>
            {/* Tab切换 */}
            <div className="todo-tabs">
              <div 
                className={`tab-btn ${activeTab === 'origin' ? 'active' : ''}`}
                onClick={() => setActiveTab('origin')}
              >
                原图 ({originImages.length})
              </div>
              <div 
                className={`tab-btn ${activeTab === 'wait' ? 'active' : ''}`}
                onClick={() => setActiveTab('wait')}
              >
                待处理图片 ({waitImages.length})
              </div>
            </div>

            {/* 图片展示区域 */}
            <div className="todo-images">
              {activeTab === 'origin' && renderImageGrid(originImages, 'origin')}
              {activeTab === 'wait' && renderWaitImagesGrouped()}
            </div>
            
            <div className="todo-actions">
              <button 
                className="action-btn primary"
                onClick={() => onUpdate && onUpdate(data.id ?? data.applyCode, '审核完成')}
              >
                审核完成
              </button>
              <button 
                className="action-btn secondary"
                onClick={onClose}
              >
                取消
              </button>
            </div>
          </>
        )}

        {/* 图片预览层 */}
        {isPreviewOpen && (
          <div className="preview-overlay" onClick={closePreview}>
            <button className="preview-close" onClick={(e) => { e.stopPropagation(); closePreview() }}>×</button>
            <div className="preview-stage" onClick={(e) => e.stopPropagation()}>
              {previewList.length > 1 && (
                <>
                  <button className="preview-nav preview-prev" onClick={showPrev}>‹</button>
                  <button className="preview-nav preview-next" onClick={showNext}>›</button>
                </>
              )}
              <div
                className="preview-image-wrap"
                ref={previewWrapRef}
                onMouseEnter={() => setLensVisible(true)}
                onMouseLeave={() => setLensVisible(false)}
                onMouseMove={handleLensMove}
              >
                <img
                  ref={previewImgRef}
                  className="preview-image"
                  src={previewList[previewIndex]}
                  alt={`预览 ${previewIndex + 1}`}
                />
                {lensVisible && (
                  <div
                    className="magnifier-lens"
                    style={lensStyle}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 自定义删除确认弹窗 */}
      <Confirm
        open={confirmOpen}
        title="删除图片"
        message="确认删除这张图片吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  )
}

export default Todo