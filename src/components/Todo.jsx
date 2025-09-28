import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './Todo.css'
import Confirm from './Confirm'
import Toast from './Toast'
import UploadToS3 from './UploadToS3'
import ProductDetail from './ProductDetail'
import { localImageManager } from '../utils/LocalImageManager.js'
import ProductDataProcessor from '../utils/ProductDataProcessor.js'
import {
  placeImageInPS,
  canPlaceImage,
  exportAndUploadCanvas,
  getOpenDocuments,
  exportDocumentById,
  registerPSEventListeners,
  unregisterPSEventListeners,
  ErrorHandler
} from '../panels/photoshop-api'

// 本地图片组件：仅使用本地图片，不回退到云端
const SmartImage = React.memo(({ imageId, originalUrl, alt, className, refreshTrigger, ...props }) => {
  const [imageSrc, setImageSrc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadLocalImage = async () => {
      try {
        setLoading(true)

        if (!localImageManager.initialized) {
          await localImageManager.initialize()
        }

        // 尝试获取本地图片
        const localUrl = await localImageManager.getLocalImageDisplayUrlByUrl(originalUrl)

        if (mounted) {
          setImageSrc(localUrl) // null if not found
          setLoading(false)
        }
      } catch (error) {
        if (mounted) {
          setImageSrc(null)
          setLoading(false)
        }
      }
    }

    if (originalUrl) {
      loadLocalImage()
    } else {
      setImageSrc(null)
      setLoading(false)
    }

    return () => {
      mounted = false
    }
  }, [originalUrl, refreshTrigger])

  if (loading) {
    return (
      <div
        className={`image-placeholder ${className || ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
          border: '1px dashed #ccc',
          color: '#999',
          fontSize: '12px',
          minHeight: '60px',
          ...props.style
        }}
      >
        ⏳ 加载中...
      </div>
    )
  }

  if (!imageSrc) {
    return (
      <div
        className={`image-placeholder ${className || ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
          border: '1px dashed #ccc',
          color: '#999',
          fontSize: '12px',
          minHeight: '60px',
          ...props.style
        }}
      >
        📁 无本地图片
      </div>
    )
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      {...props}
    />
  )
})

// 单个待处理图片：使用 React.memo，避免与该单元无关的状态变更导致重渲染
const WaitImageItem = React.memo(
  ({
    item,
    flatIndex,
    isDragging,
    isDragOver,
    isUXP,
    supportsPointer,
    isSyncing,
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
    refreshTrigger,
  }) => {
    const itemClass = `todo-image-item${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}${isSelected ? ' selected' : ''}`
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
        {/* 已隐藏P和T按钮 */}
        <SmartImage
          imageId={item.id}
          originalUrl={item.url}
          alt={`待处理图片 ${flatIndex + 1}`}
          loading="eager"
          decoding="async"
          draggable={false}
          refreshTrigger={refreshTrigger}
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
      prev.isSyncing === next.isSyncing &&
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

// 处理产品数据并下载图片到本地
const processAndDownloadProductData = async (productData, onProgress = null, onError = null) => {
  console.log('🔄 [processAndDownloadProductData] 开始处理产品数据...')

  try {
    // 使用ProductDataProcessor转换API数据
    const standardizedImages = ProductDataProcessor.processProductData(productData)
    console.log(`📊 [processAndDownloadProductData] 转换完成，共 ${standardizedImages.length} 张图片`)

    // 初始化LocalImageManager
    await localImageManager.initialize()

    // 下载图片到本地
    const results = await localImageManager.downloadProductImages(
      standardizedImages,
      onProgress,
      onError
    )

    console.log('✅ [processAndDownloadProductData] 产品数据处理和下载完成:', results)
    return { standardizedImages, downloadResults: results }

  } catch (error) {
    console.error('❌ [processAndDownloadProductData] 处理失败:', error)
    throw error
  }
}

// 构建扁平待处理图片，注入所属分组 key（sku-索引 或 scene）
// 修改后的函数，支持保留PS文档关联信息（修复重复计算问题）
const buildFlatWaitFromData = (data, existingWaitImages = []) => {
  console.log('🔨 [buildFlatWaitFromData] 重建图片数据，保留PS关联信息')
  console.log('📥 输入:', {
    dataKeys: Object.keys(data || {}),
    existingCount: existingWaitImages.length,
    existingWithPsId: existingWaitImages.filter(img => img.psDocumentId).length
  })

  const flat = []
  const now = Date.now()
  let idx = 0

  // 创建URL到psDocumentId的映射，用于保留PS关联信息
  const urlToPsIdMap = new Map()
  const processedUrls = new Set() // 防止重复处理同一URL

  existingWaitImages.forEach(img => {
    if (img.url && img.psDocumentId) {
      urlToPsIdMap.set(img.url, img.psDocumentId)
    }
  })

  console.log('🔗 PS关联映射表大小:', urlToPsIdMap.size)
  console.log('🔗 映射表内容:', Array.from(urlToPsIdMap.entries()).map(([url, psId]) => ({
    url: url.substring(0, 40) + '...',
    psDocumentId: psId
  })))

  const skus = Array.isArray(data?.publishSkus) ? data.publishSkus : []
  skus.forEach((sku, i) => {
    const skuImages = sku?.skuImages || []
    const urls = skuImages.map(x => x?.imageUrl).filter(Boolean)

    urls.forEach((url, urlIdx) => {
      const imageObj = {
        id: `${now}-${idx++}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        groupKey: `sku-${i}`
      }

      // 优化后的PS关联恢复策略：优先使用本地数据，避免重复
      let psAssigned = false

      // 第一优先级：从现有waitImages的URL映射中恢复
      const existingPsId = urlToPsIdMap.get(url)
      if (existingPsId) {
        imageObj.psDocumentId = existingPsId
        psAssigned = true
        console.log('✅ 从本地恢复SKU PS关联:', {
          url: url.substring(0, 30) + '...',
          psDocumentId: existingPsId,
          source: 'local-mapping'
        })
      }

      // 第二优先级：仅在本地没有找到且服务端确实有数据时，从服务端恢复
      const serverImageData = skuImages[urlIdx]
      if (!psAssigned && serverImageData?.psDocumentId) {
        // 额外检查：确保服务端数据不是来自之前的重复保存
        if (!processedUrls.has(url)) {
          imageObj.psDocumentId = serverImageData.psDocumentId
          psAssigned = true
          console.log('📥 从服务端补充SKU PS关联:', {
            url: url.substring(0, 30) + '...',
            psDocumentId: serverImageData.psDocumentId,
            source: 'server-data'
          })
        }
      }

      // 记录已处理的URL，防止重复
      if (psAssigned) {
        processedUrls.add(url)
      }

      flat.push(imageObj)
    })
  })

  const senceImages = data?.senceImages || []
  const sceneUrls = senceImages.map(x => x?.imageUrl).filter(Boolean)
  sceneUrls.forEach((url, urlIdx) => {
    const imageObj = {
      id: `${now}-${idx++}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      groupKey: 'scene'
    }

    // 同样的优化策略应用于场景图
    let psAssigned = false

    // 第一优先级：从现有waitImages的URL映射中恢复
    const existingPsId = urlToPsIdMap.get(url)
    if (existingPsId) {
      imageObj.psDocumentId = existingPsId
      psAssigned = true
      console.log('✅ 从本地恢复场景图PS关联:', {
        url: url.substring(0, 30) + '...',
        psDocumentId: existingPsId,
        source: 'local-mapping'
      })
    }

    // 第二优先级：仅在本地没有找到且服务端确实有数据时，从服务端恢复
    const serverImageData = senceImages[urlIdx]
    if (!psAssigned && serverImageData?.psDocumentId) {
      // 额外检查：确保服务端数据不是来自之前的重复保存
      if (!processedUrls.has(url)) {
        imageObj.psDocumentId = serverImageData.psDocumentId
        psAssigned = true
        console.log('📥 从服务端补充场景图PS关联:', {
          url: url.substring(0, 30) + '...',
          psDocumentId: serverImageData.psDocumentId,
          source: 'server-data'
        })
      }
    }

    // 记录已处理的URL，防止重复
    if (psAssigned) {
      processedUrls.add(url)
    }

    flat.push(imageObj)
  })

  // 最终统计和验证
  const finalPsCount = flat.filter(img => img.psDocumentId).length
  const uniqueUrlsWithPs = new Set(flat.filter(img => img.psDocumentId).map(img => img.url)).size

  console.log('📊 重建结果统计:', {
    totalImages: flat.length,
    withPsId: finalPsCount,
    uniqueUrlsWithPs: uniqueUrlsWithPs,
    processedUniqueUrls: processedUrls.size,
    duplicateCheck: finalPsCount === uniqueUrlsWithPs ? '✅ 无重复' : '❌ 存在重复'
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

  // URL映射管理状态（正向同步去重关键）
  const [urlToPsDocMap, setUrlToPsDocMap] = useState(new Map()) // URL到PS文档ID的映射

  // 简单的防重复点击状态
  const [isSyncing, setIsSyncing] = useState(false) // 是否有同步操作在进行中
  const [isUpdating, setIsUpdating] = useState(false) // 数据更新状态标志

  // 简化的图片刷新机制
  const [autoRefresh, setAutoRefresh] = useState({
    enabled: true, // 是否启用自动刷新
    interval: 5000, // 刷新间隔（毫秒）
    lastRefreshTime: null // 最后刷新时间
  })

  // 手动刷新触发器
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // 组件挂载状态跟踪
  const isMountedRef = useRef(true)

  // 内存管理：跟踪创建的Blob URLs以便清理
  const blobUrlsRef = useRef(new Set())

  // Toast 提示相关状态
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('info')
  const [toastDuration, setToastDuration] = useState(3000)

  // 调试面板显示状态
  const [showDebugPanel, setShowDebugPanel] = useState(false)

  // 搜索功能相关状态
  const [searchMode, setSearchMode] = useState(false) // 是否处于搜索模式
  const [searchQuery, setSearchQuery] = useState('') // 搜索关键字
  const [searchResults, setSearchResults] = useState([]) // 搜索结果

  console.log('Todo data', data)

  // UXP 环境检测（保守特征探测）- 必须在前面定义，因为后面的 useEffect 会用到
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

  // showToast 函数：替换 showPSAlert
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    setToastMessage(message)
    setToastType(type)
    setToastDuration(duration)
    setToastOpen(true)
  }, [])

  // 内存管理工具函数
  const memoryManager = useCallback({
    // 创建并跟踪Blob URL
    createBlobUrl: (buffer, type = 'image/png') => {
      try {
        const blob = new Blob([buffer], { type })
        const url = URL.createObjectURL(blob)
        blobUrlsRef.current.add(url)
        console.log(`[内存管理] 创建Blob URL: ${url.substring(0, 30)}...`)
        return url
      } catch (error) {
        console.error('[内存管理] 创建Blob URL失败:', error)
        throw error
      }
    },

    // 释放特定的Blob URL
    releaseBlobUrl: (url) => {
      if (blobUrlsRef.current.has(url)) {
        try {
          URL.revokeObjectURL(url)
          blobUrlsRef.current.delete(url)
          console.log(`[内存管理] 释放Blob URL: ${url.substring(0, 30)}...`)
        } catch (error) {
          console.error('[内存管理] 释放Blob URL失败:', error)
        }
      }
    },

    // 释放所有跟踪的Blob URLs
    releaseAllBlobUrls: () => {
      const count = blobUrlsRef.current.size
      for (const url of blobUrlsRef.current) {
        try {
          URL.revokeObjectURL(url)
        } catch (error) {
          console.error('[内存管理] 批量释放Blob URL失败:', error)
        }
      }
      blobUrlsRef.current.clear()
      console.log(`[内存管理] 释放了 ${count} 个Blob URLs`)
    },

    // 获取内存使用统计
    getMemoryStats: () => ({
      trackedBlobUrls: blobUrlsRef.current.size,
      urls: Array.from(blobUrlsRef.current).map(url => url.substring(0, 50) + '...')
    })
  }, [])

  // URL映射管理辅助函数
  const findExistingPsDocumentId = useCallback((url) => {
    const existingId = urlToPsDocMap.get(url)
    console.log('🔍 查找现有PS文档映射:', { url: url.substring(0, 30) + '...', existingId })
    return existingId || null
  }, [urlToPsDocMap])

  const recordUrlMapping = useCallback((url, psDocumentId) => {
    console.log('📝 记录URL映射:', {
      url: url.substring(0, 30) + '...',
      psDocumentId,
      mapSize: urlToPsDocMap.size
    })
    setUrlToPsDocMap(prev => {
      const newMap = new Map(prev)
      newMap.set(url, psDocumentId)
      return newMap
    })
  }, [urlToPsDocMap])

  const clearUrlMapping = useCallback((url) => {
    console.log('🗑️ 清除URL映射:', { url: url.substring(0, 30) + '...' })
    setUrlToPsDocMap(prev => {
      const newMap = new Map(prev)
      newMap.delete(url)
      return newMap
    })
  }, [urlToPsDocMap])

  // 图片URL分析和去重函数
  const analyzeImageUrls = useCallback((images) => {
    console.log('🔍 开始分析图片URL重复情况:', { totalImages: images.length })

    const urlToIndices = new Map()  // url -> [index1, index2, ...]
    const uniqueUrls = []

    images.forEach((img, index) => {
      if (!img || !img.url) return

      if (!urlToIndices.has(img.url)) {
        urlToIndices.set(img.url, [])
        uniqueUrls.push({
          url: img.url,
          representativeIndex: index,
          image: img
        })
      }
      urlToIndices.get(img.url).push(index)
    })

    const duplicateUrls = Array.from(urlToIndices.entries())
      .filter(([url, indices]) => indices.length > 1)
      .map(([url, indices]) => ({ url, indices, count: indices.length }))

    const result = {
      urlToIndices,
      uniqueUrls,
      duplicateUrls,
      totalImages: images.length,
      uniqueUrlCount: uniqueUrls.length,
      duplicateCount: duplicateUrls.length
    }

    console.log('📊 URL分析结果:', {
      总图片数: result.totalImages,
      唯一URL数: result.uniqueUrlCount,
      重复URL数: result.duplicateCount,
      重复详情: duplicateUrls.map(d => ({
        url: d.url.substring(0, 30) + '...',
        重复次数: d.count,
        图片索引: d.indices
      }))
    })

    return result
  }, [])

  // 清理数据历史记录（修复跨流程污染）
  const clearDataHistory = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (window.__DATA_HISTORY__) {
        window.__DATA_HISTORY__.length = 0
        console.log('🧹 已清理数据历史记录，避免跨流程污染')
      }
      if (window.__DATA_LOSS_DETECTED__) {
        delete window.__DATA_LOSS_DETECTED__
      }
      if (window.__CURRENT_DATA_STATS__) {
        delete window.__CURRENT_DATA_STATS__
      }
    }
  }, [])

  // 🔧 组件初始化时清理历史记录，避免跨流程数据污染
  useEffect(() => {
    console.log('🚀 [组件初始化] 开始新的处理流程，清理历史数据')
    clearDataHistory()

    // 强制清理旧的LocalImageManager数据（数据结构不兼容）
    const initializeWithCleanup = async () => {
      try {
        console.log('🧨 [组件初始化] 强制清理旧数据，确保数据结构兼容...')
        await localImageManager.initialize({ forceCleanup: true })
        console.log('✅ [组件初始化] LocalImageManager清理和初始化完成')
      } catch (error) {
        console.error('❌ [组件初始化] LocalImageManager初始化失败:', error)
      }
    }

    initializeWithCleanup()
  }, [clearDataHistory])

  // 基于PS事件的轻量级刷新机制
  useEffect(() => {
    if (!isUXP || !autoRefresh.enabled) {
      console.log('🚫 [PS事件刷新] 跳过注册: UXP不可用或自动刷新已禁用')
      return
    }

    console.log('🔄 [PS事件刷新] 注册PS保存事件监听器')

    // 简化的PS事件处理函数
    const handleSimplifiedPSEvent = async (event) => {
      try {
        // 检查组件是否仍然挂载
        if (!isMountedRef.current) {
          console.log('🚫 [PS保存事件] 组件已卸载，跳过处理')
          return
        }

        console.log('🔄 [PS保存事件] 触发图片刷新')

        // 简单通知SmartImage刷新
        setRefreshTrigger(prev => prev + 1)
        setAutoRefresh(prev => ({ ...prev, lastRefreshTime: Date.now() }))

        // 显示用户友好的提示
        showToast('图片已更新，正在刷新显示...', 'info', 2000)

      } catch (error) {
        console.error('❌ [PS事件处理] 处理失败:', error)
        if (isMountedRef.current) {
          showToast(`刷新失败: ${error.message}`, 'error', 3000)
        }
      }
    }

    // 注册事件监听器
    const registered = registerPSEventListeners(handleSimplifiedPSEvent)

    if (registered) {
      console.log('✅ [PS事件刷新] PS事件监听器注册成功')
      showToast('已启用PS保存自动刷新功能', 'success', 2000)
    } else {
      console.error('❌ [PS事件刷新] PS事件监听器注册失败')
    }

    // 清理函数：组件卸载时移除监听器
    return () => {
      console.log('🧹 [PS事件刷新] 移除事件监听器')
      try {
        unregisterPSEventListeners()
        console.log('✅ [清理] PS事件监听器已移除')
      } catch (cleanupError) {
        console.error('❌ [清理] 清理过程中发生错误:', cleanupError)
      }
    }
  }, [isUXP, autoRefresh.enabled, showToast])

  // 组件卸载时的全局清理
  useEffect(() => {
    return () => {
      console.log('🧹 [组件卸载] 执行最终清理')

      // 标记组件已卸载，防止异步操作继续执行
      isMountedRef.current = false

      try {
        // 确保所有内存资源都被释放
        if (blobUrlsRef.current.size > 0) {
          console.log(`[组件卸载] 发现 ${blobUrlsRef.current.size} 个未释放的Blob URL，正在清理...`)
          for (const url of blobUrlsRef.current) {
            try {
              URL.revokeObjectURL(url)
            } catch (error) {
              console.error('释放Blob URL失败:', error)
            }
          }
          blobUrlsRef.current.clear()
          console.log('✅ [组件卸载] 所有Blob URL已释放')
        }

        // 最终的统计报告
        console.log('📊 [组件卸载] 自动刷新已清理完成')

      } catch (finalCleanupError) {
        console.error('❌ [组件卸载] 最终清理失败:', finalCleanupError)
      }
    }
  }, [])


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




  // 数据丢失检测和监控
  const dataLossDetector = useCallback(() => {
    console.group('🔍 [数据丢失检测] 开始检测数据完整性')

    const currentStats = {
      时间戳: new Date().toISOString(),
      总图片数: waitImages.length,
      PS关联数: waitImages.filter(img => img.psDocumentId).length,
      分组统计: {}
    }

    // 按分组统计
    const groups = new Set(waitImages.map(img => img.groupKey).filter(Boolean))
    groups.forEach(groupKey => {
      const groupImages = waitImages.filter(img => img.groupKey === groupKey)
      currentStats.分组统计[groupKey] = {
        总数: groupImages.length,
        PS关联数: groupImages.filter(img => img.psDocumentId).length,
        图片列表: groupImages.map(img => ({
          id: img.id,
          url: img.url.substring(0, 30) + '...',
          hasPS: !!img.psDocumentId,
          psId: img.psDocumentId
        }))
      }
    })

    // 存储历史数据用于对比
    const historyKey = '__DATA_HISTORY__'
    if (typeof window !== 'undefined') {
      if (!window[historyKey]) {
        window[historyKey] = []
      }

      const history = window[historyKey]
      const lastRecord = history[history.length - 1]

      // 检测数据丢失
      let dataLossDetected = false
      let lossDetails = []

      if (lastRecord && !isUpdating) {
        // 比较PS关联数量
        if (currentStats.PS关联数 < lastRecord.PS关联数) {
          dataLossDetected = true
          lossDetails.push(`PS关联数量减少: ${lastRecord.PS关联数} → ${currentStats.PS关联数}`)
        }

        // 比较各分组数据
        Object.keys(lastRecord.分组统计 || {}).forEach(groupKey => {
          const lastGroupStats = lastRecord.分组统计[groupKey]
          const currentGroupStats = currentStats.分组统计[groupKey]

          if (currentGroupStats) {
            if (currentGroupStats.PS关联数 < lastGroupStats.PS关联数) {
              dataLossDetected = true
              lossDetails.push(`${groupKey}分组PS关联减少: ${lastGroupStats.PS关联数} → ${currentGroupStats.PS关联数}`)
            }
          } else if (lastGroupStats.PS关联数 > 0) {
            dataLossDetected = true
            lossDetails.push(`${groupKey}分组完全丢失 (原有${lastGroupStats.PS关联数}个PS关联)`)
          }
        })
      }

      // 记录检测结果
      if (dataLossDetected) {
        console.error('❌ 检测到数据丢失:', lossDetails)
        console.error('📊 对比数据:', {
          上次记录: lastRecord,
          当前数据: currentStats
        })

        // 触发警报
        if (isUXP) {
          showToast(`检测到数据丢失: ${lossDetails.join(', ')}`, 'error', 8000)
        }

        // 记录到全局对象
        window.__DATA_LOSS_DETECTED__ = {
          timestamp: new Date().toISOString(),
          details: lossDetails,
          lastRecord,
          currentStats
        }
      } else {
        console.log('✅ 未检测到数据丢失')
      }

      // 记录当前状态到历史
      history.push(currentStats)

      // 保持历史记录数量限制
      if (history.length > 10) {
        history.splice(0, history.length - 10)
      }

      // 更新全局调试信息
      window.__CURRENT_DATA_STATS__ = currentStats
    }

    console.log('📊 当前数据统计:', currentStats)
    console.groupEnd()

    return currentStats
  }, [waitImages, isUpdating])


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

  // 同步父级数据到本地状态（当data变化时刷新，但避免更新冲突）
  useEffect(() => {
    // 🔧 防护：如果有更新操作正在进行，暂停数据重建
    if (isUpdating) {
      console.log('⏸️ [useEffect] 检测到更新操作进行中，暂停数据重建', { isUpdating })
      return
    }

    console.log('🔄 [useEffect] 父组件数据变化，准备重建本地状态')

    // 原图：从 originalImages 提取
    const originUrls = extractOriginImageUrls(data)
    setOriginImages(toObjectImages(originUrls))

    // 待处理：基于data重建waitImages
    const waitImagesData = buildFlatWaitFromData(data, waitImages)
    setWaitImages(waitImagesData)

    // 验证重建后的数据质量
    const psCountBefore = waitImages.filter(img => img.psDocumentId).length
    const psCountAfter = waitImagesData.filter(img => img.psDocumentId).length

    console.log('🔍 [useEffect] 数据重建质量检查:', {
      重建前PS关联: psCountBefore,
      重建后PS关联: psCountAfter,
      数据质量: psCountAfter >= psCountBefore ? '✅ 正常' : '⚠️ 可能有数据丢失'
    })

    // 预加载图片URL（延迟执行，避免在重建过程中执行）
    const loadTimeout = setTimeout(() => {
      if (isUpdating) {
        console.log('⏸️ [useEffect] 预加载期间检测到更新操作，跳过预加载')
        return
      }

      const allUrls = [
        ...originUrls,
        ...extractOriginImageUrls(data),
        ...(data?.publishSkus || []).flatMap(sku =>
          (sku?.skuImages || []).map(img => img?.imageUrl).filter(Boolean)
        ),
        ...(data?.senceImages || []).map(img => img?.imageUrl).filter(Boolean)
      ].filter(Boolean)

      console.log('📥 [useEffect] 预加载图片URL数量:', allUrls.length)
      preloadImages(allUrls)
    }, 200) // 增加延迟，确保更新操作优先级

    // 清理函数
    return () => {
      clearTimeout(loadTimeout)
    }
  }, [data, preloadImages, isUpdating])

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
  const openPreview = useCallback(async (type, index) => {
    const list = type === 'origin' ? originImages : waitImages
    if (!list || list.length === 0) return

    console.log(`🖼️ 正在准备预览: ${type}, ${list.length}张图片`)

    // 仅获取本地图片URL，不回退到云端URL
    const previewUrls = await Promise.all(
      list.map(async (item) => {
        try {
          const localUrl = await localImageManager.getLocalImageDisplayUrl(item.id)
          if (localUrl) {
            console.log(`🖼️ 预览使用本地图片: ${item.id}`)
            return localUrl
          } else {
            console.log(`❌ 预览未找到本地图片: ${item.id}`)
            return null
          }
        } catch (error) {
          console.warn(`预览图片获取失败 ${item.id}:`, error)
          return null
        }
      })
    )

    setPreviewList(previewUrls)
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


  // 处理拖拽图片到Photoshop画布（恢复直接调用）
  const handleDragToPhotoshop = async (imageUrl, imageIndex) => {
    // 简单的防重复点击检查
    if (isSyncing) {
      console.log('⚠️ 同步操作进行中，跳过重复点击')
      showToast('图片正在同步中，请稍候', 'warning')
      return
    }

    // 前置验证
    if (imageIndex < 0 || imageIndex >= waitImages.length) {
      console.error('❌ 无效的图片索引:', imageIndex)
      showToast('无效的图片索引', 'error')
      return
    }

    const currentImage = waitImages[imageIndex]
    if (!currentImage) {
      console.error('❌ 找不到对应的图片对象:', imageIndex)
      showToast('找不到对应的图片', 'error')
      return
    }

    console.group('🎯 [PS同步] 开始处理图片同步到Photoshop画布')
    console.log('📥 输入参数:', { imageUrl, imageIndex, waitImagesLength: waitImages.length })
    console.log('📋 当前图片信息:', {
      id: currentImage.id,
      url: currentImage.url,
      groupKey: currentImage.groupKey,
      hasExistingPsId: !!currentImage.psDocumentId,
      existingPsId: currentImage.psDocumentId
    })

    // 设置同步状态
    setIsSyncing(true)
    setPSError(null)
    console.log('⏳ 已设置加载状态，开始同步...')

    try {
      await performPSSync(imageUrl, imageIndex)
    } finally {
      setIsSyncing(false)
      console.groupEnd()
    }
  }

  // 更新图片的PS文档关联状态（可复用函数）
  const updateImagePSDocumentId = useCallback(async (imageIndex, documentId) => {
    console.log('🔄 开始更新图片PS文档关联状态:', { imageIndex, documentId })

    // 获取当前图片信息
    const currentImage = waitImages[imageIndex]
    if (!currentImage) {
      console.error('❌ 找不到对应的图片对象:', imageIndex)
      return false
    }

    // 更新本地waitImages状态
    setWaitImages(prevWaitImages => {
      const updatedWaitImages = [...prevWaitImages]
      updatedWaitImages[imageIndex] = { ...prevWaitImages[imageIndex], psDocumentId: documentId }

      console.log('🔄 函数式状态更新:', {
        原始索引: imageIndex,
        更新前ID: prevWaitImages[imageIndex]?.psDocumentId,
        更新后ID: documentId
      })

      return updatedWaitImages
    })

    // 同步父组件数据结构
    console.log('📤 开始同步父组件数据结构...')
    const groupKey = currentImage.groupKey
    if (groupKey) {
      console.log('🏷️  处理分组数据同步, groupKey:', groupKey)

      // 构建完整的publishSkus数据
      const completePublishSkus = []
      const skuIdx = parseSkuIndexFromKey(groupKey)

      // 获取最新的图片数据（包含刚刚更新的psDocumentId）
      const sourceWaitImages = [...waitImages]
      sourceWaitImages[imageIndex] = { ...sourceWaitImages[imageIndex], psDocumentId: documentId }

      // 遍历所有可能的分组，构建完整的SKU数据
      const allGroups = new Set(sourceWaitImages.map(img => img.groupKey).filter(Boolean))
      const skuGroups = Array.from(allGroups).filter(key => key.startsWith('sku-')).sort()

      // 为每个SKU分组构建数据
      skuGroups.forEach((currentGroupKey, index) => {
        const currentSkuIdx = parseSkuIndexFromKey(currentGroupKey)
        if (currentSkuIdx != null) {
          // 从最新的waitImages中获取该分组的所有图片
          const groupUrls = sourceWaitImages.filter(img => img?.groupKey === currentGroupKey).map(img => ({
            url: img.url,
            psDocumentId: img.psDocumentId
          }))

          // 从原始数据中获取分组信息，如果没有则创建默认
          const originalSku = (data.publishSkus || [])[currentSkuIdx] || {
            attrClasses: [{ attrName: "颜色款式", attrValue: `分组${currentSkuIdx + 1}` }],
            skuIndex: currentSkuIdx + 1
          }

          completePublishSkus[currentSkuIdx] = {
            ...originalSku,
            skuImages: groupUrls.map((item, idx) => ({
              index: idx,
              imageUrl: item.url,
              psDocumentId: item.psDocumentId
            }))
          }
        }
      })

      // 填充其他未在waitImages中出现的SKU（保持原始数据）
      ;(data.publishSkus || []).forEach((sku, index) => {
        if (!completePublishSkus[index]) {
          completePublishSkus[index] = sku
        }
      })

      if (skuIdx != null) {
        // 使用完整的数据进行同步
        onReorder && onReorder(data.id ?? data.applyCode, { publishSkus: completePublishSkus })
        console.log('✅ 已同步父组件 publishSkus（完整状态）:', {
          skuIdx,
          文档ID: documentId,
          总SKU数: completePublishSkus.length
        })
      } else {
        // 场景图处理
        const sceneUrls = sourceWaitImages.filter(img => img?.groupKey === 'scene').map(img => ({
          url: img.url,
          psDocumentId: img.psDocumentId
        }))

        const senceImages = sceneUrls.map((item, idx) => ({
          index: idx,
          imageUrl: item.url,
          psDocumentId: item.psDocumentId
        }))

        onReorder && onReorder(data.id ?? data.applyCode, { senceImages })
        console.log('✅ 已同步父组件 senceImages（PS关联）:', { 文档ID: documentId })
      }
    } else {
      console.warn('⚠️  图片没有分组信息，跳过父组件数据同步')
    }

    return true
  }, [waitImages, data, onReorder])

  // 实际的PS同步执行逻辑
  const performPSSync = async (imageUrl, imageIndex) => {
    try {
      // 获取当前图片信息（使用最新状态）
      const currentWaitImages = [...waitImages]
      const currentImage = currentWaitImages[imageIndex]

      if (!currentImage) {
        throw new Error('图片对象在同步过程中丢失')
      }

      console.log('🔍 [单个同步] 开始处理，启用URL去重检查:', {
        imageIndex,
        url: imageUrl.substring(0, 30) + '...',
        currentMappingSize: urlToPsDocMap.size
      })

      // 🔧 关键：检查是否已有相同URL的PS文档映射
      const existingPsId = findExistingPsDocumentId(imageUrl)
      let documentId

      if (existingPsId) {
        console.log('✅ [单个同步] 发现现有PS文档映射，直接关联:', {
          imageIndex,
          existingPsId,
          url: imageUrl.substring(0, 30) + '...'
        })
        documentId = existingPsId

        // 🔧 关键：查找所有相同URL的图片，批量更新它们的PS关联
        console.log('🔄 [单个同步] 开始批量更新所有相同URL的图片...')
        const imagesToUpdate = []

        waitImages.forEach((img, imgIndex) => {
          if (img && img.url === imageUrl) {
            imagesToUpdate.push({
              index: imgIndex,
              image: img
            })
          }
        })

        console.log(`📋 [单个同步] 找到 ${imagesToUpdate.length} 张相同URL的图片需要更新:`, {
          图片索引: imagesToUpdate.map(item => item.index),
          PS文档ID: documentId
        })

        // 批量更新所有相同URL的图片状态
        let updateCount = 0
        for (const { index: imgIndex } of imagesToUpdate) {
          try {
            const updateSuccess = await updateImagePSDocumentId(imgIndex, documentId)
            if (updateSuccess) {
              updateCount++
              console.log(`✅ [单个同步] 图片 ${imgIndex} 状态更新成功`)
            }
          } catch (updateError) {
            console.error(`❌ [单个同步] 更新图片 ${imgIndex} 状态失败:`, updateError)
          }
        }

        console.log(`✅ [单个同步] 批量更新完成，成功更新 ${updateCount}/${imagesToUpdate.length} 张图片`)

      } else {
        // 创建新的PS文档
        console.log('🎯 [单个同步] 未找到现有映射，创建新PS文档:', {
          imageIndex,
          url: imageUrl.substring(0, 30) + '...'
        })

        const imageInfo = {
          type: 'remote',
          url: imageUrl,
          filename: `image_${imageIndex + 1}.jpg`,
          imageId: currentImage.id // 添加图片ID用于反向同步映射
        }
        console.log('📦 构造的图片信息:', imageInfo)

        console.log('🚀 调用 placeImageInPS (直接打开模式)...')
        documentId = await placeImageInPS(imageInfo, { directOpen: true })
        console.log('✅ placeImageInPS 执行完成，返回值:', documentId, '(类型:', typeof documentId, ')')

        // 严格验证 documentId
        if (!documentId || (typeof documentId !== 'number' && typeof documentId !== 'string')) {
          console.error('❌ 无效的文档ID:', documentId)
          throw new Error(`获取到的文档ID无效: ${documentId} (类型: ${typeof documentId})`)
        }

        // 记录URL映射
        recordUrlMapping(imageUrl, documentId)
        console.log('📝 [单个同步] 新映射已记录')

        // 🔧 关键：查找并更新所有相同URL的图片
        console.log('🔄 [单个同步] 开始批量更新所有相同URL的图片...')
        const imagesToUpdate = []

        waitImages.forEach((img, imgIndex) => {
          if (img && img.url === imageUrl) {
            imagesToUpdate.push({
              index: imgIndex,
              image: img
            })
          }
        })

        console.log(`📋 [单个同步] 找到 ${imagesToUpdate.length} 张相同URL的图片需要更新:`, {
          图片索引: imagesToUpdate.map(item => item.index),
          新PS文档ID: documentId
        })

        // 批量更新所有相同URL的图片状态
        let updateCount = 0
        for (const { index: imgIndex } of imagesToUpdate) {
          try {
            const updateSuccess = await updateImagePSDocumentId(imgIndex, documentId)
            if (updateSuccess) {
              updateCount++
              console.log(`✅ [单个同步] 图片 ${imgIndex} 状态更新成功`)
            }
          } catch (updateError) {
            console.error(`❌ [单个同步] 更新图片 ${imgIndex} 状态失败:`, updateError)
          }
        }

        console.log(`✅ [单个同步] 批量更新完成，成功更新 ${updateCount}/${imagesToUpdate.length} 张图片`)
      }

      // 显示成功提示
      const action = existingPsId ? '关联到现有' : '创建新'
      const successMsg = `图片已成功${action}PS文档 (文档ID: ${documentId})`
      console.log('✅ 同步成功:', successMsg)

      if (isUXP) {
        showToast(successMsg, 'success')
      }

      console.groupEnd()

    } catch (error) {
      console.error('❌ [PS同步] 发生错误:', error)
      console.error('🔍 错误详细信息:', {
        message: error.message,
        stack: error.stack,
        imageIndex,
        imageUrl,
        currentImageId: currentImage?.id
      })

      const errorMsg = error.message || '放置图片时发生未知错误'
      setPSError(errorMsg)
      showToast(`同步失败: ${errorMsg}`, 'error')

      console.groupEnd()
    } finally {
      console.log('🏁 清理加载状态...')
      // 注意：isSyncing已在handleDragToPhotoshop的finally中清理
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

  // 批量同步到Photoshop画布（增强URL去重逻辑）
  const handleBatchSyncToPhotoshop = async () => {
    if (selectedImages.size === 0) {
      showToast('请先选择要同步的图片', 'warning')
      return
    }

    console.group('🔄 [批量同步] 开始批量同步到PS画布（URL去重版本）')

    // 获取选中的图片数据
    const selectedIndices = Array.from(selectedImages)
    const selectedImageData = selectedIndices.map(index => ({
      index,
      image: waitImages[index]
    })).filter(item => item.image) // 过滤无效图片

    console.log('📋 批量同步输入数据:', {
      选中图片数: selectedIndices.length,
      有效图片数: selectedImageData.length,
      选中索引: selectedIndices
    })

    // 🔧 关键：使用URL去重分析
    const analysisResult = analyzeImageUrls(selectedImageData.map(item => item.image))
    const { uniqueUrls, urlToIndices, duplicateUrls, totalImages, uniqueUrlCount } = analysisResult

    console.log('📊 批量同步URL分析结果:', {
      总选中图片: totalImages,
      唯一URL数: uniqueUrlCount,
      重复URL数: duplicateUrls.length,
      预计创建PS文档: uniqueUrlCount,
      预计更新图片数: totalImages
    })

    if (duplicateUrls.length > 0) {
      console.log('🔍 发现重复URL，将进行去重处理:',
        duplicateUrls.map(d => ({
          url: d.url.substring(0, 30) + '...',
          重复次数: d.count,
          将关联到同一PS文档: true
        }))
      )
    }

    setIsBatchSyncing(true)
    setPSError(null)

    let successDocuments = 0  // 成功创建的PS文档数
    let successImages = 0     // 成功更新的图片数
    let failDocuments = 0     // 失败的PS文档数

    try {
      showToast(`开始批量同步 ${uniqueUrlCount} 个唯一URL到PS（将更新 ${totalImages} 张图片）...`, 'info')

      // 🔍 检查本地图片可用性并提供用户反馈
      let localImageCount = 0
      console.log('🔍 [批量同步] 开始检查本地图片可用性...')

      for (const { representativeIndex } of uniqueUrls) {
        const item = waitImages[representativeIndex]
        if (item && item.id) {
          // 首先尝试直接ID匹配，然后尝试URL匹配
          const hasLocalById = localImageManager.hasLocalImage(item.id)
          const hasLocalByUrl = await localImageManager.getLocalImageDisplayUrlByUrl(item.url) !== null
          const hasLocal = hasLocalById || hasLocalByUrl

          const imageInfo = localImageManager.getImageInfo(item.id)

          console.log(`📋 图片 ${item.id}:`, {
            hasLocalById,
            hasLocalByUrl,
            hasLocal,
            status: imageInfo?.status || 'not-found',
            url: item.url.substring(0, 40) + '...'
          })

          if (hasLocal) {
            localImageCount++
          }
        } else {
          console.warn(`⚠️ 图片信息无效:`, { representativeIndex, item })
        }
      }

      // 📊 汇总检测结果
      console.log('📊 [批量同步] 本地图片检测汇总:', {
        totalUrls: uniqueUrlCount,
        localAvailable: localImageCount,
        cloudOnly: uniqueUrlCount - localImageCount,
        optimizationRate: ((localImageCount / uniqueUrlCount) * 100).toFixed(1) + '%'
      })

      if (localImageCount > 0) {
        console.log(`📁 本地图片优化: ${localImageCount}/${uniqueUrlCount} 张图片可使用本地缓存`)
        showToast(`启用本地图片优先策略: ${localImageCount}/${uniqueUrlCount} 张图片将从本地加载`, 'success')
      } else {
        console.log(`🌐 所有图片将从云端下载`)
        showToast(`所有图片将从云端下载 (无本地缓存)`, 'info')
      }

      // 🔧 按唯一URL创建PS文档
      for (let i = 0; i < uniqueUrls.length; i++) {
        const { url, representativeIndex } = uniqueUrls[i]
        const representativeItem = waitImages[representativeIndex]

        if (!representativeItem) {
          console.warn(`⚠️ 代表图片不存在，跳过URL: ${url.substring(0, 30)}...`)
          continue
        }

        try {
          console.log(`🚀 [批量同步 ${i + 1}/${uniqueUrls.length}] 处理唯一URL:`, {
            url: url.substring(0, 30) + '...',
            代表索引: representativeIndex,
            关联图片数: urlToIndices.get(url)?.length || 0
          })

          // 检查是否已有映射
          const existingPsId = findExistingPsDocumentId(url)
          let documentId

          if (existingPsId) {
            console.log(`✅ 发现现有PS文档映射，复用文档ID: ${existingPsId}`)
            documentId = existingPsId
          } else {
            // 创建新的PS文档
            const imageInfo = {
              type: 'remote',
              url: url,
              filename: `batch_unique_${i + 1}.jpg`,
              imageId: representativeItem.id // 添加图片ID启用本地图片优先策略
            }

            console.log(`🎯 创建新PS文档... (图片ID: ${representativeItem.id}, 启用本地优先策略，使用直接打开模式)`)
            documentId = await placeImageInPS(imageInfo, { directOpen: true })
            console.log(`✅ PS文档创建成功，文档ID: ${documentId}`)

            // 验证documentId有效性
            if (!documentId || (typeof documentId !== 'number' && typeof documentId !== 'string')) {
              throw new Error(`获取到的文档ID无效: ${documentId} (类型: ${typeof documentId})`)
            }

            // 记录URL映射
            recordUrlMapping(url, documentId)
          }

          successDocuments++

          // 🔧 更新所有相同URL的图片状态
          const indicesForThisUrl = urlToIndices.get(url) || []
          console.log(`🔄 开始批量更新 ${indicesForThisUrl.length} 张相同URL的图片...`)

          for (const imageIndex of indicesForThisUrl) {
            try {
              // 确保索引在选中图片范围内
              if (selectedIndices.includes(imageIndex)) {
                const updateSuccess = await updateImagePSDocumentId(imageIndex, documentId)
                if (updateSuccess) {
                  successImages++
                  console.log(`✅ 图片 ${imageIndex} 状态更新成功`)
                } else {
                  console.warn(`⚠️ 图片 ${imageIndex} 状态更新失败`)
                }
              }
            } catch (updateError) {
              console.error(`❌ 更新图片 ${imageIndex} 状态失败:`, updateError)
            }
          }

          // 更新进度提示
          showToast(`正在处理第 ${i + 1}/${uniqueUrls.length} 个URL（已更新 ${successImages} 张图片）...`, 'info', 1000)

          // 添加延迟避免PS处理过载
          if (i < uniqueUrls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }

        } catch (error) {
          console.error(`❌ [批量同步 ${i + 1}/${uniqueUrls.length}] 处理URL失败:`, error)
          failDocuments++
        }
      }

      // 显示最终结果
      const finalResult = {
        预期创建文档: uniqueUrlCount,
        成功创建文档: successDocuments,
        失败创建文档: failDocuments,
        预期更新图片: totalImages,
        成功更新图片: successImages,
        映射表大小: urlToPsDocMap.size
      }

      console.log('📊 批量同步最终统计:', finalResult)

      const localOptimizationInfo = localImageCount > 0 ? ` (${localImageCount} 张使用本地缓存)` : ' (全部从云端下载)'

      if (failDocuments === 0) {
        showToast(`批量同步完成！创建 ${successDocuments} 个PS文档，更新 ${successImages} 张图片${localOptimizationInfo}`, 'success')
      } else {
        showToast(`批量同步完成：成功 ${successDocuments} 个文档，失败 ${failDocuments} 个，更新 ${successImages} 张图片${localOptimizationInfo}`, 'warning')
      }

      // 同步完成后退出选择模式
      setIsSelectionMode(false)
      setSelectedImages(new Set())

    } catch (error) {
      const errorMsg = error.message || '批量同步时发生未知错误'
      console.error('❌ 批量同步过程发生错误:', error)
      setPSError(errorMsg)
      showToast(`批量同步失败: ${errorMsg}`, 'error')
    } finally {
      setIsBatchSyncing(false)
      console.log('🏁 批量同步流程结束')
      console.groupEnd()
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
      setWaitImages(prevWaitImages => buildFlatWaitFromData(newData, prevWaitImages))
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
      setWaitImages(prevWaitImages => buildFlatWaitFromData(newData, prevWaitImages))
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

  // 搜索相关函数
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      showToast('请输入搜索关键字', 'warning')
      return
    }

    // 这里应该调用API获取搜索结果，暂时模拟
    // TODO: 实现真正的搜索API调用
    console.log('执行搜索:', searchQuery)

    // 模拟搜索结果 - 这里应该替换为真实的API调用
    const mockResults = [
      // 复制当前产品数据作为搜索结果示例
      data
    ].filter(product =>
      product?.productName?.includes(searchQuery) ||
      product?.applyCode?.includes(searchQuery)
    )

    setSearchResults(mockResults)
    setSearchMode(true)
    showToast(`找到 ${mockResults.length} 个相关产品`, 'success')
  }, [searchQuery, data, showToast])

  const handleExitSearch = useCallback(() => {
    setSearchMode(false)
    setSearchQuery('')
    setSearchResults([])
  }, [])

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
              className="todo-image-item no-drag"
              onClick={() => { if (suppressClickRef.current) return; openPreview('origin', index) }}
            >
              {isUXP && (
                <>
                  {/* 可扩展：画布替换按钮如需恢复可在此处开启 */}
                  <button
                    className="ps-drag-btn"
                    title="添加到Photoshop画布"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDragToPhotoshop(item.url, index) }}
                    disabled={isSyncing}
                    draggable={false}
                  >
                    {isSyncing ? '⋯' : 'P'}
                  </button>
                </>
              )}
              <SmartImage
                imageId={item.id}
                originalUrl={item.url}
                alt={`原图 ${index + 1}`}
                loading="lazy"
                decoding="async"
                draggable={false}
                refreshTrigger={refreshTrigger}
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
                    isSyncing={isSyncing}
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
                    refreshTrigger={refreshTrigger}
                  />
                )
              })}
              <div className="todo-image-item no-drag upload-tile" key={`upload-${key}`}>
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
        {/* 右上角关闭按钮和状态指示器 */}
        <div className="header-controls">
          {/* 自动刷新状态指示器 */}
          {isUXP && (
            <div className={`auto-refresh-indicator ${autoRefresh.enabled ? 'enabled' : 'disabled'}`}>
              <span className="refresh-icon">
                {autoRefresh.enabled ? '🔄' : '⏸️'}
              </span>
              <span className="refresh-text">
                {autoRefresh.enabled ? '自动刷新' : '已暂停'}
              </span>
            </div>
          )}

          <button
            className="close-btn"
            onClick={() => {
              // 🔧 关闭时清理历史数据
              clearDataHistory()
              console.log('✅ 组件关闭（X按钮），已清理历史数据')
              onClose()
            }}
          >×</button>
        </div>

        {/* 无数据时显示简单提示 */}
        {data && (
          <>
            {/* 搜索功能区 */}
            {!searchMode && (
              <div className="search-section">
                <div className="search-input-group">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="输入产品名称或编号"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    style={{ fontSize: '11px' }}
                  />
                  <button
                    className="search-btn"
                    onClick={handleSearch}
                    disabled={!searchQuery.trim()}
                    style={{ fontSize: '11px' }}
                  >
                    搜索
                  </button>
                </div>
              </div>
            )}

            {/* 搜索结果模式标题栏 */}
            {searchMode && (
              <div className="search-result-header">
                <div className="search-title" style={{ fontSize: '12px' }}>
                  搜索结果: "{searchQuery}" ({searchResults.length} 个产品)
                </div>
                <button
                  className="exit-search-btn"
                  onClick={handleExitSearch}
                  style={{ fontSize: '11px' }}
                >
                  返回列表
                </button>
              </div>
            )}

            {/* Tab切换 - 只在非搜索模式显示 */}
            {!searchMode && (
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
            )}


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
              {searchMode ? (
                // 搜索结果展示区域
                <div className="search-results">
                  {searchResults.length === 0 ? (
                    <div className="no-images">
                      <p>未找到匹配的产品</p>
                    </div>
                  ) : (
                    searchResults.map((product, index) => (
                      <div key={product.id || product.applyCode || index} className="search-result-item">
                        <div className="product-title" style={{ fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>
                          {product.productName || product.applyCode || `产品 ${index + 1}`}
                        </div>
                        <ProductDetail
                          productData={product}
                          onClose={() => {
                            // 在搜索结果中不需要关闭单个产品详情，这里可以为空或显示提示
                            console.log('搜索结果中的产品详情不支持单独关闭')
                          }}
                          onSubmit={(productId, status) => {
                            // 处理产品提交
                            console.log('产品提交:', productId, status)
                            if (onUpdate) {
                              onUpdate(productId, status)
                            }
                          }}
                          onUpdate={(productId, status) => {
                            // 处理产品更新
                            console.log('产品更新:', productId, status)
                            if (onUpdate) {
                              onUpdate(productId, status)
                            }
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                // 原有的Tab内容
                <>
                  {activeTab === 'origin' && renderImageGrid(originImages, 'origin')}
                  {activeTab === 'wait' && renderWaitImagesGrouped()}
                </>
              )}
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
                    // 🔧 提交成功后清理历史数据，避免影响后续流程
                    clearDataHistory()
                    console.log('✅ 提交审核成功，已清理历史数据')
                  } finally {
                    setIsSubmitting(false)
                  }
                }}
              >
                提交
              </div>
              <div
                className="action-btn secondary"
                onClick={() => {
                  // 🔧 关闭时清理历史数据
                  clearDataHistory()
                  console.log('✅ 组件关闭，已清理历史数据')
                  onClose()
                }}
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
                {previewList[previewIndex] ? (
                  <img
                    className="preview-image"
                    src={previewList[previewIndex]}
                    alt={`预览 ${previewIndex + 1}`}
                  />
                ) : (
                  <div
                    className="preview-image-placeholder"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#f5f5f5',
                      border: '2px dashed #ccc',
                      color: '#999',
                      fontSize: '16px',
                      minHeight: '300px',
                      width: '100%'
                    }}
                  >
                    📁 本地图片未找到
                  </div>
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