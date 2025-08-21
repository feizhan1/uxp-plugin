import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './Todo.css'
import Confirm from './Confirm'
import Toast from './Toast'
import UploadToS3 from './UploadToS3'
import { placeImageInPS, canPlaceImage, exportAndUploadCanvas } from '../panels/photoshop-api'

// 单个待处理图片：使用 React.memo，避免与该单元无关的状态变更导致重渲染
const WaitImageItem = React.memo(
  ({
    item,
    flatIndex,
    isDragging,
    isDragOver,
    isUXP,
    supportsPointer,
    isPSPlacing,
    isCanvasReplacing,
    replaceProgress,
    refSetter,
    suppressClickRef,
    onOpenPreview,
    onRequestDelete,
    onBeginPointerMaybeDrag,
    onBeginMouseMaybeDrag,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onReplaceWithCanvas,
    onDragToPhotoshop,
    onImageError,
    isSelectionMode,
    isSelected,
    onToggleSelection,
  }) => {
    const itemClass = `image-item${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}${isSelected ? ' selected' : ''}`
    return (
      <div
        key={item.id}
        className={itemClass}
        ref={refSetter}
        draggable={!isUXP && !isSelectionMode}
        onDragStart={!isUXP ? (e) => onDragStart(e, flatIndex) : undefined}
        onDragEnd={!isUXP ? onDragEnd : undefined}
        onDragEnter={!isUXP ? (e) => onDragEnter(e, flatIndex) : undefined}
        onDragOver={!isUXP ? (e) => onDragOver(e, flatIndex) : undefined}
        onDragLeave={!isUXP ? onDragLeave : undefined}
        onDrop={!isUXP ? (e) => onDrop(e, flatIndex) : undefined}
        onPointerDown={isUXP && supportsPointer && !isSelectionMode ? (e) => onBeginPointerMaybeDrag(e, flatIndex) : undefined}
        onMouseDown={isUXP && !supportsPointer && !isSelectionMode ? (e) => onBeginMouseMaybeDrag(e, flatIndex) : undefined}
        onClick={() => { 
          if (suppressClickRef.current) return; 
          if (isSelectionMode) {
            onToggleSelection(flatIndex);
          } else {
            onOpenPreview(flatIndex);
          }
        }}
      >
        {isSelectionMode && (
          <div className="selection-checkbox">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {
                // checkbox change事件由图片容器的点击事件统一处理
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(flatIndex);
              }}
            />
          </div>
        )}
        <button
          className="delete-btn"
          title="删除图片"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDelete(flatIndex) }}
          draggable={false}
        >
          ×
        </button>
        {isUXP && (
          <>
            <button
              className="canvas-replace-btn"
              title={isCanvasReplacing ? `替换中: ${replaceProgress || '处理中...'}` : '用Photoshop画布图片替换当前图片'}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReplaceWithCanvas(flatIndex) }}
              disabled={isCanvasReplacing}
              draggable={false}
            >
              {isCanvasReplacing ? '⋯' : 'T'}
            </button>
            <button
              className="ps-drag-btn"
              title="同步到Photoshop画布"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDragToPhotoshop(item.url, flatIndex) }}
              disabled={isPSPlacing}
              draggable={false}
            >
              {isPSPlacing ? '⋯' : 'P'}
            </button>
          </>
        )}
        <img
          src={item.url}
          alt={`待处理图片 ${flatIndex + 1}`}
          loading="eager"
          decoding="async"
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
  },
  (prev, next) => {
    // 仅在与当前单元相关的字段变化时才更新
    return (
      prev.item?.id === next.item?.id &&
      prev.item?.url === next.item?.url &&
      prev.flatIndex === next.flatIndex &&
      prev.isDragging === next.isDragging &&
      prev.isDragOver === next.isDragOver &&
      prev.isUXP === next.isUXP &&
      prev.supportsPointer === next.supportsPointer &&
      prev.isPSPlacing === next.isPSPlacing &&
      prev.isCanvasReplacing === next.isCanvasReplacing &&
      prev.replaceProgress === next.replaceProgress &&
      prev.isSelectionMode === next.isSelectionMode &&
      prev.isSelected === next.isSelected
    )
  }
)

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
  // 始终生成所有 SKU 分组（即使没有图片）
  skus.forEach((sku, i) => {
    const pairs = (sku?.attrClasses || []).map(a => `${a.attrName}:${a.attrValue}`).filter(Boolean)
    const title = pairs.length > 0 ? pairs.join('、') : `分组${i+1}`
    const indices = []
    waitImages.forEach((img, idx) => { if (img?.groupKey === `sku-${i}`) indices.push(idx) })
    groups.push({ key: `sku-${i}`, title, indices })
  })
  // 场景图分组：始终存在，便于空态上传
  const sceneIndices = []
  waitImages.forEach((img, idx) => { if (img?.groupKey === 'scene') sceneIndices.push(idx) })
  groups.push({ key: 'scene', title: '场景图', indices: sceneIndices })
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

  // Photoshop 拖拽放置相关状态
  const [isPSPlacing, setIsPSPlacing] = useState(false)
  const [psError, setPSError] = useState(null)
  
  // 画布替换图片相关状态
  const [isCanvasReplacing, setIsCanvasReplacing] = useState(false)
  const [replaceProgress, setReplaceProgress] = useState('')
  // 审核提交处理中
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 批量选择相关状态
  const [selectedImages, setSelectedImages] = useState(new Set()) // 选中的图片索引集合
  const [isSelectionMode, setIsSelectionMode] = useState(false) // 是否处于选择模式
  const [isBatchSyncing, setIsBatchSyncing] = useState(false) // 批量同步进行中

  // Toast 提示相关状态
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('info')
  const [toastDuration, setToastDuration] = useState(3000)

  // 放大镜相关（已取消）

  console.log('Todo data', data)

  // showToast 函数：替换 showPSAlert
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    setToastMessage(message)
    setToastType(type)
    setToastDuration(duration)
    setToastOpen(true)
  }, [])

  // UXP 环境检测（保守特征探测）
  const isUXP = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = (navigator?.userAgent || '').toLowerCase()
    return Boolean(window.uxp) || ua.includes('uxp') || ua.includes('adobe')
  }, [])

  // 拖拽调试开关：localStorage.DEBUG_DRAG 为 '1' 或 'true' 时启用；或 window.__DEBUG_DRAG__ 为真
  const DRAG_DEBUG = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const flag = localStorage.getItem('DEBUG_DRAG')
      if (flag && (flag === '1' || flag.toLowerCase() === 'true')) return true
    } catch { void 0 }
    return Boolean(window.__DEBUG_DRAG__)
  }, [])

  const debugEnabled = isUXP ? true : DRAG_DEBUG
  const debugBufferRef = useRef([])
  const pushDebug = (text) => {
    // 仅保存字符串，避免对象在不同环境中展示不一致
    debugBufferRef.current.push(String(text))
    if (debugBufferRef.current.length > 50) debugBufferRef.current.shift()
  }
  // 上传调试开关（与 UploadToS3 保持一致）
  const uploadDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const flag = localStorage.getItem('DEBUG_UPLOAD')
      if (flag && (flag === '1' || flag.toLowerCase() === 'true')) return true
    } catch { /* 忽略 */ }
    return Boolean(window.__DEBUG_UPLOAD__)
  }, [])
  const uploadLog = (...args) => {
    if (!uploadDebugEnabled) return
    try { console.log('[上传调试][Todo]', ...args) } catch { /* 忽略 */ }
  }
  const formatArgForLog = (arg) => {
    const type = typeof arg
    if (arg == null) return String(arg) // null / undefined
    if (type === 'string' || type === 'number' || type === 'boolean') return String(arg)
    if (Array.isArray(arg)) return `[${arg.map(a => (typeof a === 'object' ? '[obj]' : String(a))).join(', ')}]`
    if (type === 'function') return '[fn]'
    if (arg instanceof Event) return `[event type=${arg.type}]`
    // 普通对象：仅一层 key=value 展开，值为基本类型，否则标记为 [obj]
    try {
      const pairs = Object.keys(arg).map(k => {
        const v = arg[k]
        const vt = typeof v
        if (v == null) return `${k}=null`
        if (vt === 'string' || vt === 'number' || vt === 'boolean') return `${k}=${v}`
        return `${k}=[obj]`
      })
      return pairs.length ? pairs.join(' ') : '[obj]'
    } catch {
      return '[obj]'
    }
  }
  const debugDragLog = (...args) => {
    if (!debugEnabled) return
    // 统一格式化为单行字符串；不直接打印对象
    const line = `[拖拽调试] ${args.map(formatArgForLog).join(' ')}`
    try { console.log(line) } catch { /* 在某些环境中 console 可能不可用 */ }
    pushDebug(line)
  }

  // 能力探测：Pointer 事件支持情况
  const supportsPointer = useMemo(() => {
    if (typeof window === 'undefined') return false
    return ('onpointerdown' in window) || typeof window.PointerEvent !== 'undefined'
  }, [])

  // 一次性环境提示（不受 DRAG_DEBUG 开关影响）
  useEffect(() => {
    if (isUXP) {
      try {
        console.info('[拖拽提示] 当前为 UXP 环境: supportsPointer=', supportsPointer, '，日志开关 DEBUG_DRAG=', DRAG_DEBUG)
        if (!DRAG_DEBUG) console.info('[拖拽提示] 如需查看详细日志，请在控制台执行 localStorage.DEBUG_DRAG = "1" 或 window.__DEBUG_DRAG__ = true')
      } catch { /* 忽略 */ }
    }
  }, [isUXP, supportsPointer, DRAG_DEBUG])
  
  // Pointer 拖拽所需引用：每个扁平项的 DOM、以及临时拖拽上下文
  const itemRefs = useRef([])
  const pendingPointerDragRef = useRef(null) // { fromIndex, startX, startY }
  const activePointerDragRef = useRef(null) // { fromIndex, groupKey, groupIndices:number[], rects: Map(index->DOMRect) }
  const pointerCaptureTargetRef = useRef(null)
  const pointerIdRef = useRef(null)
  const latestPointerPosRef = useRef({ x: 0, y: 0 })
  const dragOverIndexRef = useRef(null)

  // Mouse 降级所需引用（当不支持 Pointer 事件时）
  const pendingMouseDragRef = useRef(null) // { fromIndex, startX, startY }
  const activeMouseDragRef = useRef(null) // 复用与 pointer 相同结构

  // 拖拽期间抑制点击（避免误触打开预览）
  const suppressClickRef = useRef(false)

  // 图片预加载函数
  const preloadImages = useCallback((urls) => {
    if (!isUXP || !urls || urls.length === 0) return
    
    // 在UXP环境中，分批预加载图片以避免并发限制
    const batchSize = 3 // UXP环境建议同时最多3个请求
    let currentBatch = 0
    
    const loadBatch = () => {
      const start = currentBatch * batchSize
      const end = Math.min(start + batchSize, urls.length)
      const batchUrls = urls.slice(start, end)
      
      const promises = batchUrls.map(url => {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve(url)
          img.onerror = () => {
            console.log('预加载失败:', url)
            resolve(url) // 即使失败也继续
          }
          img.src = url
        })
      })
      
      Promise.all(promises).then(() => {
        currentBatch++
        if (currentBatch * batchSize < urls.length) {
          // 延迟加载下一批，避免请求过于密集
          setTimeout(loadBatch, 100)
        }
      })
    }
    
    loadBatch()
  }, [isUXP])

  // 同步父级数据到本地状态（当data变化时刷新）
  useEffect(() => {
    // 原图：从 originalImages 提取
    const originUrls = extractOriginImageUrls(data)
    setOriginImages(toObjectImages(originUrls))

    // 待处理：根据数据结构（分色图 + 场景图）构建扁平数组并注入 groupKey
    const waitImagesData = buildFlatWaitFromData(data)
    setWaitImages(waitImagesData)
    
    // 预加载所有图片URL
    const allUrls = [...originUrls, ...waitImagesData.map(img => img.url)].filter(Boolean)
    preloadImages(allUrls)
  }, [data, preloadImages])

  // 分组信息与索引→分组的映射
  const waitGroups = useMemo(() => computeWaitGroups(data, waitImages), [data, waitImages])
  const indexToGroupKey = useMemo(() => {
    const map = new Map()
    waitImages.forEach((img, i) => map.set(i, img?.groupKey || null))
    return map
  }, [waitImages])

  // 抽取：在同一分组内应用重排，并同步父组件
  const applyReorderWithinSameGroup = (fromIndex, toIndex) => {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDraggedGroupKey(null)
      return
    }
    const sourceGroup = indexToGroupKey.get(fromIndex)
    const targetGroup = indexToGroupKey.get(toIndex)
    uploadLog('应用重排：', { fromIndex, toIndex, sourceGroup, targetGroup })
    if (!sourceGroup || sourceGroup !== targetGroup) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDraggedGroupKey(null)
      return
    }

    const next = [...waitImages]
    const [draggedItem] = next.splice(fromIndex, 1)
    const insertIndex = toIndex
    next.splice(insertIndex, 0, draggedItem)

    setWaitImages(next)

    // 同步父组件：仅更新该分组（基于 groupKey 过滤）
    const newUrls = next.filter(img => img?.groupKey === sourceGroup).map(img => img.url)
    const skuIdx = parseSkuIndexFromKey(sourceGroup)
    if (skuIdx != null) {
      const newPublishSkus = (data.publishSkus || []).map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(newUrls) } : sku)
      onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
      uploadLog('已同步父组件 publishSkus（重排）：', { skuIdx, 图片数量: newUrls.length })
    } else {
      onReorder && onReorder(data.id ?? data.applyCode, { senceImages: toIndexedImageObjs(newUrls) })
      uploadLog('已同步父组件 senceImages（重排）：', { 图片数量: newUrls.length })
    }

    setDraggedIndex(null)
    setDragOverIndex(null)
    setDraggedGroupKey(null)
    // 拖拽完成后，短暂抑制一次点击
    suppressClickRef.current = true
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  // 处理图片加载错误
  const handleImageError = useCallback((e) => {
    console.log('图片加载失败:', e.target.src)
    e.target.style.display = 'none'
    const errorDiv = e.target.nextElementSibling
    if (errorDiv && errorDiv.classList.contains('image-error')) {
      errorDiv.style.display = 'flex'
    }
  }, [])

  // 打开图片预览（type 对应到扁平 waitImages 或 originImages）
  const openPreview = useCallback((type, index) => {
    const list = type === 'origin' ? originImages : waitImages
    if (!list || list.length === 0) return
    setPreviewList(list.map(i => i.url))
    setPreviewIndex(index)
    setIsPreviewOpen(true)
  }, [originImages, waitImages])

  // 关闭图片预览
  const closePreview = () => {
    setIsPreviewOpen(false)
  }

  // 上一张 / 下一张
  const showPrev = useCallback((e) => {
    if (e) e.stopPropagation()
    setPreviewIndex((i) => (i - 1 + previewList.length) % previewList.length)
  }, [previewList.length])
  const showNext = useCallback((e) => {
    if (e) e.stopPropagation()
    setPreviewIndex((i) => (i + 1) % previewList.length)
  }, [previewList.length])

  // 预览层键盘快捷键（Esc 关闭，左右切换）
  useEffect(() => {
    if (!isPreviewOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsPreviewOpen(false)
      } else if (e.key === 'ArrowLeft') {
        showPrev()
      } else if (e.key === 'ArrowRight') {
        showNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPreviewOpen, showPrev, showNext])

  // 删除待处理图片（触发确认）
  const requestDeleteWaitImage = (flatIndex) => {
    uploadLog('请求删除图片：', { flatIndex, groupKey: indexToGroupKey.get(flatIndex) })
    setPendingDeleteIndex(flatIndex)
    setConfirmOpen(true)
  }

  const confirmDelete = () => {
    if (pendingDeleteIndex == null) return
    const groupKey = indexToGroupKey.get(pendingDeleteIndex)
    uploadLog('确认删除：', { flatIndex: pendingDeleteIndex, groupKey })

    const next = waitImages.filter((_, i) => i !== pendingDeleteIndex)
    setWaitImages(next)

    // 同步父组件：仅更新所在分组（基于 groupKey 过滤）
    if (groupKey) {
      const newUrls = next.filter(img => img?.groupKey === groupKey).map(img => img.url)
      const skuIdx = parseSkuIndexFromKey(groupKey)
      if (skuIdx != null) {
        const newPublishSkus = (data.publishSkus || []).map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(newUrls) } : sku)
        uploadLog('同步 publishSkus（删除）：', { skuIdx, 图片数量: newUrls.length })
        onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
      } else {
        uploadLog('同步 senceImages（删除）：', { 图片数量: newUrls.length })
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

  // 处理用画布图片替换当前图片
  const handleReplaceWithCanvas = async (currentImageIndex) => {
    // 检查是否可以导出画布
    const { canPlace, reason } = canPlaceImage()
    if (!canPlace) {
      uploadLog('无法导出画布:', reason)
      setPSError(reason)
      showToast(`无法导出画布: ${reason}`, 'error')
      return
    }

    // 设置加载状态
    setIsCanvasReplacing(true)
    setPSError(null)
    uploadLog('开始用画布替换图片:', { currentImageIndex })

    try {
      const result = await exportAndUploadCanvas(
        {
          filename: `canvas-replacement-${Date.now()}.png`,
          onStepChange: (step) => {
            setReplaceProgress(step)
            uploadLog('替换进度:', step)
          }
        },
        data.applyCode,
        data.userId,
        data.userCode
      )
      let uploadUrl = result


      if (uploadUrl) {
        // 获取当前图片所在的分组和位置
        const currentImage = waitImages[currentImageIndex]
        if (!currentImage) {
          throw new Error('找不到要替换的图片')
        }

        const groupKey = currentImage.groupKey
        uploadLog('替换图片成功，更新本地状态:', { groupKey, newUrl: uploadUrl })

        // 更新本地waitImages数组
        const newWaitImages = [...waitImages]
        newWaitImages[currentImageIndex] = { ...currentImage, url: uploadUrl }
        setWaitImages(newWaitImages)

        // 同步父组件数据结构
        const newUrls = newWaitImages.filter(img => img?.groupKey === groupKey).map(img => img.url)
        const skuIdx = parseSkuIndexFromKey(groupKey)
        
        if (skuIdx != null) {
          const newPublishSkus = (data.publishSkus || []).map((sku, i) => 
            i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(newUrls) } : sku
          )
          onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
          uploadLog('已同步父组件 publishSkus（替换）:', { skuIdx, 图片数量: newUrls.length })
        } else {
          onReorder && onReorder(data.id ?? data.applyCode, { senceImages: toIndexedImageObjs(newUrls) })
          uploadLog('已同步父组件 senceImages（替换）:', { 图片数量: newUrls.length })
        }

        // 更新预览列表
        const newPreviewList = [...previewList]
        newPreviewList[previewIndex] = uploadUrl
        setPreviewList(newPreviewList)

        if (isUXP) {
          showToast('画布图片已成功替换原图片', 'success')
        }
      } else {
        throw new Error('上传响应中没有找到图片URL')
      }
      
    } catch (error) {
      const errorMsg = error.message || '替换图片时发生未知错误'
      uploadLog('画布替换失败:', error)
      setPSError(errorMsg)
      showToast(`替换图片失败: ${errorMsg}`, 'error')
    } finally {
      setIsCanvasReplacing(false)
      setReplaceProgress('')
    }
  }

  // 处理拖拽图片到Photoshop画布
  const handleDragToPhotoshop = async (imageUrl, imageIndex) => {
    console.log('handleDragToPhotoshop', imageUrl, imageIndex)
    // 检查是否可以放置图片
    // const { canPlace, reason } = canPlaceImage()
    // if (!canPlace) {
    //   console.log('无法放置图片到Photoshop:', reason)
    //   setPSError(reason)
    //   showPSAlert(`无法放置图片: ${reason}`)
    //   return
    // }

    // 设置加载状态
    setIsPSPlacing(true)
    setPSError(null)
    console.log('开始拖拽图片到Photoshop:', { imageUrl, imageIndex })

    try {
      // 构造图片信息对象
      const imageInfo = {
        type: 'remote',
        url: imageUrl,
        filename: `image_${imageIndex + 1}.jpg`
      }

      await placeImageInPS(imageInfo)
      console.log('图片成功放置到Photoshop')
      
      // 可选：显示成功提示
              if (isUXP) {
          showToast('图片已成功放置到Photoshop画布', 'success')
        }
      
    } catch (error) {
      console.log('handleDragToPhotoshop error', error)
      const errorMsg = error.message || '放置图片时发生未知错误'
      console.log('拖拽到Photoshop失败:', error)
      setPSError(errorMsg)
      showToast(`放置图片失败: ${errorMsg}`, 'error')
    } finally {
      setIsPSPlacing(false)
    }
  }

  // 批量选择相关函数
  const toggleSelectionMode = useCallback(() => {
    console.log(`切换选择模式: ${isSelectionMode} -> ${!isSelectionMode}`)
    setIsSelectionMode(!isSelectionMode)
    if (isSelectionMode) {
      // 退出选择模式时清空选中项
      console.log('退出选择模式，清空选中项')
      setSelectedImages(new Set())
    }
  }, [isSelectionMode])

  const toggleImageSelection = useCallback((flatIndex) => {
    console.log(`尝试切换图片 ${flatIndex} 的选中状态`)
    console.log(`当前selectedImages:`, Array.from(selectedImages))
    console.log(`图片 ${flatIndex} 是否已选中:`, selectedImages.has(flatIndex))
    
    setSelectedImages(prevSelected => {
      const newSelected = new Set(prevSelected)
      if (newSelected.has(flatIndex)) {
        newSelected.delete(flatIndex)
        console.log(`取消选择图片 ${flatIndex}, 新状态:`, Array.from(newSelected))
      } else {
        newSelected.add(flatIndex)
        console.log(`选择图片 ${flatIndex}, 新状态:`, Array.from(newSelected))
      }
      return newSelected
    })
  }, [selectedImages])

  const selectAllImages = useCallback(() => {
    const allIndices = waitImages.map((_, index) => index)
    console.log(`全选图片，共 ${allIndices.length} 张:`, allIndices)
    setSelectedImages(new Set(allIndices))
  }, [waitImages])

  const clearSelection = useCallback(() => {
    console.log('清空所有选择')
    setSelectedImages(new Set())
  }, [])

  // 批量同步到Photoshop画布
  const handleBatchSyncToPhotoshop = async () => {
    if (selectedImages.size === 0) {
      showToast('请先选择要同步的图片', 'warning')
      return
    }

    const selectedIndices = Array.from(selectedImages)
    setIsBatchSyncing(true)
    setPSError(null)

    let successCount = 0
    let failCount = 0
    const totalCount = selectedIndices.length

    try {
      showToast(`开始批量同步 ${totalCount} 张图片到Photoshop...`, 'info')

      for (let i = 0; i < selectedIndices.length; i++) {
        const flatIndex = selectedIndices[i]
        const item = waitImages[flatIndex]
        
        if (!item) continue

        try {
          const imageInfo = {
            type: 'remote',
            url: item.url,
            filename: `batch_image_${flatIndex + 1}.jpg`
          }

          await placeImageInPS(imageInfo)
          successCount++
          
          // 更新进度提示
          showToast(`正在同步第 ${i + 1}/${totalCount} 张图片...`, 'info', 1000)
          
          // 添加延迟避免PS处理过载
          if (i < selectedIndices.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (error) {
          console.error(`同步第 ${flatIndex + 1} 张图片失败:`, error)
          failCount++
        }
      }

      // 显示最终结果
      if (failCount === 0) {
        showToast(`成功同步 ${successCount} 张图片到Photoshop画布`, 'success')
      } else {
        showToast(`同步完成：成功 ${successCount} 张，失败 ${failCount} 张`, 'warning')
      }

      // 同步完成后退出选择模式
      setIsSelectionMode(false)
      setSelectedImages(new Set())

    } catch (error) {
      const errorMsg = error.message || '批量同步时发生未知错误'
      console.error('批量同步失败:', error)
      setPSError(errorMsg)
      showToast(`批量同步失败: ${errorMsg}`, 'error')
    } finally {
      setIsBatchSyncing(false)
    }
  }

  // 处理拖拽开始（使用扁平索引）- 浏览器原生 DnD
  const handleDragStart = (e, flatIndex) => {
    debugDragLog('HTML5 拖拽开始', { index: flatIndex, groupKey: indexToGroupKey.get(flatIndex) })
    setDraggedIndex(flatIndex)
    setDraggedGroupKey(indexToGroupKey.get(flatIndex) || null)
    suppressClickRef.current = true
    if (e?.dataTransfer) {
      try {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(flatIndex))
      } catch {
        // UXP 环境可能不允许访问 dataTransfer，这里忽略即可
        void 0
      }
    }
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    debugDragLog('HTML5 拖拽结束')
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDraggedGroupKey(null)
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  // 处理拖拽进入/悬停（使用扁平索引）- 浏览器原生 DnD
  const handleDragEnter = (e, flatIndex) => {
    e.preventDefault()
    debugDragLog('HTML5 拖拽进入', { targetIndex: flatIndex })
    const targetGroup = indexToGroupKey.get(flatIndex)
    if (draggedIndex !== null && draggedIndex !== flatIndex && draggedGroupKey && targetGroup === draggedGroupKey) {
      setDragOverIndex(flatIndex)
    }
  }
  const handleDragOver = (e, flatIndex) => {
    e.preventDefault()
    const targetGroup = indexToGroupKey.get(flatIndex)
    if (draggedGroupKey && targetGroup !== draggedGroupKey) {
      if (e?.dataTransfer) e.dataTransfer.dropEffect = 'none'
      return
    }
    if (e?.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== flatIndex) {
      if (dragOverIndex !== flatIndex) debugDragLog('HTML5 悬停变更', { targetIndex: flatIndex })
      setDragOverIndex(flatIndex)
    }
  }

  // 处理拖拽离开
  const handleDragLeave = () => { setDragOverIndex(null) }

  // 处理拖拽放置（按扁平顺序重排，保持原有逻辑；并同步父组件结构，仅影响所在分组）- 统一到函数
  const handleDrop = (e, dropFlatIndex) => {
    e.preventDefault()
    debugDragLog('HTML5 放置', { from: draggedIndex, to: dropFlatIndex, targetGroup: indexToGroupKey.get(dropFlatIndex) })
    if (draggedIndex === null || draggedIndex === dropFlatIndex) return
    applyReorderWithinSameGroup(draggedIndex, dropFlatIndex)
  }

  // ===== UXP 降级：Pointer 事件拖拽排序 =====
  const computeNearestIndexAtPosition = (rectsMap, indices, x, y) => {
    // 首先检查是否有图片区域包含拖拽点
    let containingIndex = null
    indices.forEach(i => {
      const r = rectsMap.get(i)
      if (!r) return
      // 检查点是否在矩形区域内
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        containingIndex = i
      }
    })
    
    // 如果有图片区域包含拖拽点，直接返回
    if (containingIndex !== null) {
      return containingIndex
    }
    
    // 如果没有区域包含拖拽点，检查是否在任何区域的合理范围内（扩展20px容差）
    const TOLERANCE = 20
    let bestIndex = null
    let bestDist = Infinity
    
    indices.forEach(i => {
      const r = rectsMap.get(i)
      if (!r) return
      
      // 扩展矩形边界
      const expandedRect = {
        left: r.left - TOLERANCE,
        right: r.right + TOLERANCE,
        top: r.top - TOLERANCE,
        bottom: r.bottom + TOLERANCE
      }
      
      // 检查点是否在扩展区域内
      if (x >= expandedRect.left && x <= expandedRect.right && 
          y >= expandedRect.top && y <= expandedRect.bottom) {
        // 计算到原始矩形边缘的最短距离
        const distToEdge = Math.min(
          Math.abs(x - r.left),   // 到左边距离
          Math.abs(x - r.right),  // 到右边距离
          Math.abs(y - r.top),    // 到上边距离
          Math.abs(y - r.bottom)  // 到下边距离
        )
        
        if (distToEdge < bestDist) {
          bestDist = distToEdge
          bestIndex = i
        }
      }
    })
    
    // 如果仍然没有找到合适的目标，返回null（不触发排序）
    return bestIndex
  }

  const teardownPointerListeners = () => {
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    document.removeEventListener('pointercancel', onPointerCancel, true)
  }

  const beginPointerMaybeDrag = (e, flatIndex) => {
    // 不阻止点击，让点击仍可触发预览
    debugDragLog('Pointer 按下', { index: flatIndex })
    try { e.preventDefault() } catch { /* 某些环境下不可用 */ }
    pendingPointerDragRef.current = {
      fromIndex: flatIndex,
      startX: e.clientX,
      startY: e.clientY,
    }
    // 捕获当前目标，保证持续接收 move/up
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      pointerCaptureTargetRef.current = e.currentTarget
      pointerIdRef.current = e.pointerId
    } catch { /* 忽略 */ }
    document.addEventListener('pointermove', onPointerMove, { capture: true })
    document.addEventListener('pointerup', onPointerUp, { capture: true })
    document.addEventListener('pointercancel', onPointerCancel, { capture: true })
  }

  const ensurePointerDragContext = () => {
    if (!pendingPointerDragRef.current) return false
    if (activePointerDragRef.current) return true

    const { fromIndex } = pendingPointerDragRef.current
    const groupKey = indexToGroupKey.get(fromIndex) || null
    if (!groupKey) return false

    const group = waitGroups.find(g => g.key === groupKey)
    const groupIndices = group ? group.indices.slice() : []
    const rects = new Map()
    groupIndices.forEach(i => {
      const el = itemRefs.current[i]
      if (el) rects.set(i, el.getBoundingClientRect())
    })

    // 标记进入拖拽态
    setDraggedIndex(fromIndex)
    setDraggedGroupKey(groupKey)
    debugDragLog('进入 Pointer 拖拽态', { fromIndex, groupKey, groupSize: groupIndices.length })
    suppressClickRef.current = true

    activePointerDragRef.current = { fromIndex, groupKey, groupIndices, rects }
    return true
  }

  const onPointerMove = (e) => {
    const pending = pendingPointerDragRef.current
    const active = activePointerDragRef.current

    // 若尚未进入拖拽，判断是否超过阈值再初始化拖拽上下文
    if (!active && pending) {
      const dx = Math.abs(e.clientX - pending.startX)
      const dy = Math.abs(e.clientY - pending.startY)
      if (dx < 3 && dy < 3) return
      debugDragLog('Pointer 拖拽启动阈值通过')
      const ok = ensurePointerDragContext()
      if (!ok) return
    }

    const ctx = activePointerDragRef.current
    if (!ctx) return

    // 记录最新坐标，并在同组内寻找最近目标
    latestPointerPosRef.current = { x: e.clientX, y: e.clientY }
    // 为避免 hover/dragging transform 影响，实时刷新目标项矩形
    ctx.groupIndices.forEach(i => {
      const el = itemRefs.current[i]
      if (el) ctx.rects.set(i, el.getBoundingClientRect())
    })
    const bestIndex = computeNearestIndexAtPosition(ctx.rects, ctx.groupIndices, e.clientX, e.clientY)
    if (bestIndex != null) {
      if (bestIndex !== dragOverIndex) debugDragLog('Pointer 目标索引变更', { bestIndex })
      setDragOverIndex(bestIndex)
      dragOverIndexRef.current = bestIndex
    } else {
      // 如果没有找到合适的目标区域，清除拖拽悬停状态
      if (dragOverIndex !== null) debugDragLog('Pointer 离开有效拖拽区域')
      setDragOverIndex(null)
      dragOverIndexRef.current = null
    }
  }

  const onPointerUp = (e) => {
    const active = activePointerDragRef.current
    teardownPointerListeners()
    try {
      if (pointerIdRef.current != null) {
        pointerCaptureTargetRef.current?.releasePointerCapture?.(pointerIdRef.current)
      }
    } catch { /* 忽略 */ }
    pointerCaptureTargetRef.current = null
    pointerIdRef.current = null

    if (active) {
      // 优先使用 ref 中的悬停索引；若没有，则基于最后坐标重新计算
      let dropIndex = dragOverIndexRef.current
      if (dropIndex == null && e) {
        const pos = latestPointerPosRef.current
        dropIndex = computeNearestIndexAtPosition(active.rects, active.groupIndices, pos.x, pos.y)
      }
      
      debugDragLog('Pointer 抬起', { fromIndex: active?.fromIndex, dropIndex, hasValidTarget: dropIndex != null })
      
      // 只有在找到有效目标位置时才执行排序
      if (dropIndex != null) {
        applyReorderWithinSameGroup(active.fromIndex, dropIndex)
      } else {
        // 没有有效目标，只清理拖拽状态
        setDraggedIndex(null)
        setDragOverIndex(null)
        setDraggedGroupKey(null)
      }
    }

    pendingPointerDragRef.current = null
    activePointerDragRef.current = null
    dragOverIndexRef.current = null
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  const onPointerCancel = () => {
    debugDragLog('Pointer 取消')
    teardownPointerListeners()
    try {
      if (pointerIdRef.current != null) {
        pointerCaptureTargetRef.current?.releasePointerCapture?.(pointerIdRef.current)
      }
    } catch { /* 忽略 */ }
    pointerCaptureTargetRef.current = null
    pointerIdRef.current = null
    pendingPointerDragRef.current = null
    activePointerDragRef.current = null
    setDraggedIndex(null)
    setDragOverIndex(null)
    dragOverIndexRef.current = null
    setDraggedGroupKey(null)
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  // ===== 鼠标事件降级（当不支持 Pointer 事件时） =====
  const teardownMouseListeners = () => {
    document.removeEventListener('mousemove', onMouseMove, true)
    document.removeEventListener('mouseup', onMouseUp, true)
  }

  const beginMouseMaybeDrag = (e, flatIndex) => {
    debugDragLog('Mouse 按下', { index: flatIndex })
    pendingMouseDragRef.current = {
      fromIndex: flatIndex,
      startX: e.clientX,
      startY: e.clientY,
    }
    document.addEventListener('mousemove', onMouseMove, { capture: true })
    document.addEventListener('mouseup', onMouseUp, { capture: true })
  }

  const ensureMouseDragContext = () => {
    if (!pendingMouseDragRef.current) return false
    if (activeMouseDragRef.current) return true

    const { fromIndex } = pendingMouseDragRef.current
    const groupKey = indexToGroupKey.get(fromIndex) || null
    if (!groupKey) return false

    const group = waitGroups.find(g => g.key === groupKey)
    const groupIndices = group ? group.indices.slice() : []
    const rects = new Map()
    groupIndices.forEach(i => {
      const el = itemRefs.current[i]
      if (el) rects.set(i, el.getBoundingClientRect())
    })

    setDraggedIndex(fromIndex)
    setDraggedGroupKey(groupKey)
    debugDragLog('进入 Mouse 拖拽态', { fromIndex, groupKey, groupSize: groupIndices.length })
    suppressClickRef.current = true

    activeMouseDragRef.current = { fromIndex, groupKey, groupIndices, rects }
    return true
  }

  const onMouseMove = (e) => {
    const pending = pendingMouseDragRef.current
    const active = activeMouseDragRef.current
    if (!active && pending) {
      const dx = Math.abs(e.clientX - pending.startX)
      const dy = Math.abs(e.clientY - pending.startY)
      if (dx < 3 && dy < 3) return
      debugDragLog('Mouse 拖拽启动阈值通过')
      const ok = ensureMouseDragContext()
      if (!ok) return
    }

    const ctx = activeMouseDragRef.current
    if (!ctx) return

    latestPointerPosRef.current = { x: e.clientX, y: e.clientY }
    // 为避免 hover/dragging transform 影响，实时刷新目标项矩形
    ctx.groupIndices.forEach(i => {
      const el = itemRefs.current[i]
      if (el) ctx.rects.set(i, el.getBoundingClientRect())
    })
    const bestIndex = computeNearestIndexAtPosition(ctx.rects, ctx.groupIndices, e.clientX, e.clientY)
    if (bestIndex != null) {
      if (bestIndex !== dragOverIndex) debugDragLog('Mouse 目标索引变更', { bestIndex })
      setDragOverIndex(bestIndex)
      dragOverIndexRef.current = bestIndex
    } else {
      // 如果没有找到合适的目标区域，清除拖拽悬停状态
      if (dragOverIndex !== null) debugDragLog('Mouse 离开有效拖拽区域')
      setDragOverIndex(null)
      dragOverIndexRef.current = null
    }
  }

  const onMouseUp = (e) => {
    const active = activeMouseDragRef.current
    teardownMouseListeners()
    if (active) {
      // 优先使用 ref 中的悬停索引；若没有，则基于最后坐标重新计算
      let dropIndex = dragOverIndexRef.current
      if (dropIndex == null && e) {
        const pos = latestPointerPosRef.current
        dropIndex = computeNearestIndexAtPosition(active.rects, active.groupIndices, pos.x, pos.y)
      }
      
      debugDragLog('Mouse 抬起', { fromIndex: active?.fromIndex, dropIndex, hasValidTarget: dropIndex != null })
      
      // 只有在找到有效目标位置时才执行排序
      if (dropIndex != null) {
        applyReorderWithinSameGroup(active.fromIndex, dropIndex)
      } else {
        // 没有有效目标，只清理拖拽状态
        setDraggedIndex(null)
        setDragOverIndex(null)
        setDraggedGroupKey(null)
      }
    }
    pendingMouseDragRef.current = null
    activeMouseDragRef.current = null
    dragOverIndexRef.current = null
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  // 组件卸载时，确保移除全局 Pointer 监听
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    return () => {
      teardownPointerListeners()
      teardownMouseListeners()
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  // 分组上传：只追加到当前分组尾部，并同步父组件原始结构
  const handleUploadedToGroup = (groupKey) => (info) => {
    uploadLog('收到上传成功回调：', { groupKey, info })
    if (!info?.url) {
      uploadLog('忽略：无 url 字段')
      return
    }

    const skuIdx = parseSkuIndexFromKey(groupKey)
    uploadLog('解析分组：', { groupKey, skuIdx })

    if (skuIdx != null) {
      // 更新父组件 publishSkus 结构
      const prevSkus = Array.isArray(data?.publishSkus) ? data.publishSkus : []
      const target = prevSkus[skuIdx] || {}
      const prevUrls = (target.skuImages || []).map(x => x?.imageUrl).filter(Boolean)
      const nextUrls = [...prevUrls, info.url]
      const newPublishSkus = prevSkus.map((sku, i) => i === skuIdx ? { ...sku, skuImages: toIndexedImageObjs(nextUrls) } : sku)
      uploadLog('更新 publishSkus：', { skuIdx, prevCount: prevUrls.length, nextCount: nextUrls.length })
      
      // 通知父组件数据更新
      onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: newPublishSkus })
      uploadLog('已通知父组件 publishSkus 更新')

      // 同步本地扁平 waitImages：使用新结构重建并注入 groupKey
      const newData = { ...data, publishSkus: newPublishSkus }
      setWaitImages(buildFlatWaitFromData(newData))
      uploadLog('已同步本地 waitImages（SKU）')
      
      // 如果有 onUpdate 回调，也通知状态变更
      if (onUpdate) {
        uploadLog('通知父组件状态更新（SKU）')
        // 这里可以根据需要传递状态信息，比如"图片已添加"
        // onUpdate(data.id ?? data.applyCode, '图片已添加')
      }
    } else {
      // 场景图分组
      const prevScenes = (data?.senceImages || []).map(x => x?.imageUrl).filter(Boolean)
      const nextUrls = [...prevScenes, info.url]
      const newScenes = toIndexedImageObjs(nextUrls)
      uploadLog('更新 senceImages：', { prevCount: prevScenes.length, nextCount: nextUrls.length })
      
      // 通知父组件数据更新
      onReorder && onReorder(data.id ?? data.applyCode, { senceImages: newScenes })
      uploadLog('已通知父组件 senceImages 更新')

      // 同步本地扁平 waitImages：使用新结构重建并注入 groupKey
      const newData = { ...data, senceImages: newScenes }
      setWaitImages(buildFlatWaitFromData(newData))
      uploadLog('已同步本地 waitImages（场景）')
      
      // 如果有 onUpdate 回调，也通知状态变更
      if (onUpdate) {
        uploadLog('通知父组件状态更新（场景）')
        // 这里可以根据需要传递状态信息，比如"场景图已添加"
        // onUpdate(data.id ?? data.applyCode, '场景图已添加')
      }
    }
    
    uploadLog('上传处理完成，数据已更新')
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

    // 原图：完全移除拖拽排序相关逻辑，仅保留预览与 Photoshop 相关按钮
    if (type === 'origin') {
      return (
        <div className="image-grid">
          {images.map((item, index) => (
            <div
              key={item.id}
              className="image-item no-drag"
              onClick={() => { if (suppressClickRef.current) return; openPreview('origin', index) }}
            >
              {isUXP && (
                <>
                  {/* 可扩展：画布替换按钮如需恢复可在此处开启 */}
                  <button
                    className="ps-drag-btn"
                    title="添加到Photoshop画布"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDragToPhotoshop(item.url, index) }}
                    disabled={isPSPlacing}
                    draggable={false}
                  >
                    {isPSPlacing ? '⋯' : 'P'}
                  </button>
                </>
              )}
              <img
                src={item.url}
                alt={`原图 ${index + 1}`}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              <div className="image-error" style={{display: 'none'}}>
                <span>图片加载失败</span>
              </div>
            </div>
          ))}
        </div>
      )
    }
  }

  // 渲染带分组标题的待处理图片（按归属分组，不改变底层扁平顺序和交互）；每组末尾有独立上传按钮
  const renderWaitImagesGrouped = () => {
    if (!waitGroups || waitGroups.length === 0) {
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
                const isSelected = selectedImages.has(flatIndex)
                if (isSelectionMode) {
                  console.log(`渲染图片 ${flatIndex}: isSelected=${isSelected}, selectedImages=`, Array.from(selectedImages))
                }
                return (
                  <WaitImageItem
                    key={item.id}
                    item={item}
                    flatIndex={flatIndex}
                    isDragging={draggedIndex === flatIndex}
                    isDragOver={dragOverIndex === flatIndex}
                    isUXP={isUXP}
                    supportsPointer={supportsPointer}
                    isPSPlacing={isPSPlacing}
                    isCanvasReplacing={isCanvasReplacing}
                    replaceProgress={replaceProgress}
                    refSetter={(el) => { itemRefs.current[flatIndex] = el }}
                    suppressClickRef={suppressClickRef}
                    onOpenPreview={(idx) => openPreview('wait', idx)}
                    onRequestDelete={requestDeleteWaitImage}
                    onBeginPointerMaybeDrag={beginPointerMaybeDrag}
                    onBeginMouseMaybeDrag={beginMouseMaybeDrag}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onReplaceWithCanvas={handleReplaceWithCanvas}
                    onDragToPhotoshop={handleDragToPhotoshop}
                    onImageError={handleImageError}
                    isSelectionMode={isSelectionMode}
                    isSelected={isSelected}
                    onToggleSelection={toggleImageSelection}
                  />
                )
              })}
              <div className="image-item no-drag upload-tile" key={`upload-${key}`}>
                <UploadToS3
                  applyCode={data.applyCode}
                  userId={data.userId}
                  userCode={data.userCode}
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
    <div className={`todo-modal${isUXP ? ' uxp-mode' : ''}${draggedIndex != null ? ' is-dragging' : ''}`}>
      <div className="todo-content">
        {/* 右上角关闭按钮 */}
        <button className="close-btn" onClick={onClose}>×</button>

        {/* 无数据时显示简单提示 */}
        {data && (
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

            {/* 批量操作控制栏 - 只在待处理图片tab且有图片时显示 */}
            {activeTab === 'wait' && waitImages.length > 0 && isUXP && (
              <div className="batch-toolbar">
                <div
                  className={`action-btn ${isSelectionMode ? 'primary' : 'secondary'} ${isBatchSyncing ? 'disabled' : ''}`}
                  onClick={isBatchSyncing ? undefined : toggleSelectionMode}
                >
                  {isSelectionMode ? '退出选择' : '批量选择'}
                </div>
                
                {isSelectionMode && (
                  <>
                    <div
                      className={`action-btn secondary ${selectedImages.size === waitImages.length ? 'disabled' : ''}`}
                      onClick={selectedImages.size === waitImages.length ? undefined : selectAllImages}
                    >
                      全选
                    </div>
                    <div
                      className={`action-btn secondary ${selectedImages.size === 0 ? 'disabled' : ''}`}
                      onClick={selectedImages.size === 0 ? undefined : clearSelection}
                    >
                      清空
                    </div>
                    <div
                      className={`action-btn primary ${selectedImages.size === 0 || isBatchSyncing ? 'disabled' : ''}`}
                      onClick={selectedImages.size === 0 || isBatchSyncing ? undefined : handleBatchSyncToPhotoshop}
                      title={isBatchSyncing ? '正在批量同步图片到Photoshop...' : `批量同步 ${selectedImages.size} 张图片到Photoshop画布`}
                    >
                      {isBatchSyncing ? '同步中...' : `同步${selectedImages.size}张`}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 图片展示区域 */}
            <div className="todo-images">
              {activeTab === 'origin' && renderImageGrid(originImages, 'origin')}
              {activeTab === 'wait' && renderWaitImagesGrouped()}
            </div>
            
            {/* Photoshop错误提示 */}
            {psError && (
              <div className="ps-error-message">
                <span>⚠️ Photoshop错误: {psError}</span>
                <button onClick={() => setPSError(null)}>×</button>
              </div>
            )}
            
            {activeTab === 'wait' && (<div className="todo-actions">
              <div 
                className={`action-btn primary ${isSubmitting ? 'disabled' : ''}`}
                onClick={async () => {
                  try {
                    if(isSubmitting) return
                    setIsSubmitting(true)
                    await onUpdate(data.id ?? data.applyCode, '审核完成')
                  } finally {
                    setIsSubmitting(false)
                  }
                }}
              >
                提交
              </div>
              <div 
                className="action-btn secondary"
                onClick={onClose}
              >
                取消
              </div>
            </div>)}
          </>
        )}

        {/* 图片预览层 */}
        {isPreviewOpen && (
          <div className="preview-overlay" onClick={closePreview}>
            <button className="preview-close" onClick={(e) => { e.stopPropagation(); closePreview() }}>×</button>
            <div className="preview-stage" onClick={(e) => e.stopPropagation()}>
              {previewList.length > 1 && (
                <>
                  <button className="preview-nav preview-prev" style={{fontSize: '16px', fontWeight: 'bold'}} onClick={showPrev}>‹</button>
                  <button className="preview-nav preview-next" style={{fontSize: '16px', fontWeight: 'bold'}} onClick={showNext}>›</button>
                </>
              )}
              <div className="preview-image-wrap">
                <img
                  className="preview-image"
                  src={previewList[previewIndex]}
                  alt={`预览 ${previewIndex + 1}`}
                />
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

      {/* Toast 提示组件 */}
      <Toast
        open={toastOpen}
        type={toastType}
        message={toastMessage}
        duration={toastDuration}
        onClose={() => setToastOpen(false)}
        position="top"
      />
    </div>
  )
}

export default Todo