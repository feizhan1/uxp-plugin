import React, { useState, useEffect, useCallback, useRef } from "react";
import { Todo } from '../components'
import { Toast } from '../components'
import { Confirm } from '../components'
import Login from '../components/Login'
import ImageDownloader from '../components/ImageDownloader'
import ImageUploader from '../components/ImageUploader'
import LocalFileManager from '../components/LocalFileManager'
import ProductDetail from '../components/ProductDetail'
import StorageSetupDialog from '../components/StorageSetupDialog'
import { autoSyncManager } from '../utils/AutoSyncManager'
import { localImageManager } from '../utils/LocalImageManager'
import { storageLocationManager } from '../utils/StorageLocationManager'
import { get } from '../utils/http'
import { post } from '../utils/http'
import './TodoList.css'

const TodoList = () => {
  const [showTodo, setShowTodo] = useState(false)
  const [showProductDetail, setShowProductDetail] = useState(false)
  const [currentProductData, setCurrentProductData] = useState(null)
  const [loginInfo, setLoginInfo] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [openIngIndex, setOpenIngIndex] = useState(null)
  const [errorDuration] = useState(4000)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [successDuration] = useState(3000)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [showImageDownloader, setShowImageDownloader] = useState(false)
  const [productImages, setProductImages] = useState([])
  const [downloadCompleted, setDownloadCompleted] = useState(false)
  const [isManualSync, setIsManualSync] = useState(false)
  const [showImageUploader, setShowImageUploader] = useState(false)
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [showLocalFileManager, setShowLocalFileManager] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [showStorageSetupDialog, setShowStorageSetupDialog] = useState(false)

  // 搜索功能相关状态
  const [searchMode, setSearchMode] = useState(false) // 是否处于搜索模式
  const [searchQuery, setSearchQuery] = useState('') // 搜索关键字
  const [searchResults, setSearchResults] = useState([]) // 搜索结果
  const searchInputRef = useRef(null) // sp-textfield的ref

  // Toast 提示状态
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('info')

  // 撤回确认对话框状态
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [rejectingProduct, setRejectingProduct] = useState(null)

  // 状态筛选
  const [statusFilter, setStatusFilter] = useState(3) // 默认显示待处理（状态码3）
// loginInfo
//   {
//     "success": true,
//     "data": {
//         "UserId": 14552,
//         "UserCode": "9130",
//         "LoginName": "Gala",
//         "Name": "刘长群",
//         "Email": null,
//         "OrganizationName": "研发",
//         "PositionName": "开发工程师",
//         "Phone": null
//     },
//     "message": ""
// }

  // 读取登录信息
  useEffect(() => {
    const raw = localStorage.getItem('loginInfo')
    console.log('raw', raw)
    if (raw) {
      try {
        const obj = JSON.parse(raw)
        if (obj?.success) setLoginInfo(obj)
      } catch (e) {
        console.warn('解析登录信息失败：localStorage.loginInfo 不是合法的 JSON 字符串', e)
      }
    }
  }, [])

  // 解析产品图片数据的通用函数
  const parseProductImages = (product, dataClass) => {
    const { originalImages, publishSkus, senceImages } = dataClass
    const productImages = []

    // 处理场景图片
    if (Array.isArray(senceImages)) {
      senceImages.forEach((image, imageIndex) => {
        if (image.imageUrl) {
          productImages.push({
            id: `${product.applyCode}_scene_${image.index || imageIndex}`,
            url: image.imageUrl,
            filename: `scene_${image.index || imageIndex}.jpg`,
            applyCode: product.applyCode,
            productId: product.productId,
            productName: product.productName,
            sortOrder: image.index || imageIndex,
            imageType: 'scene',  // 🔧 修复：使用 imageType 字段，并修正拼写为 scene
            sourceIndex: image.index || imageIndex  // 🔧 添加 sourceIndex 字段
          })
        }
      })
    }

    // 处理SKU图片
    if (Array.isArray(publishSkus)) {
      publishSkus.forEach((sku, skuIndex) => {
        if (Array.isArray(sku.skuImages)) {
          sku.skuImages.forEach((image, imageIndex) => {
            if (image.imageUrl) {
              productImages.push({
                id: `${product.applyCode}_sku${sku.skuIndex || skuIndex}_${image.index || imageIndex}`,
                url: image.imageUrl,
                filename: `sku${sku.skuIndex || skuIndex}_${image.index || imageIndex}.jpg`,
                applyCode: product.applyCode,
                productId: product.productId,
                productName: product.productName,
                sortOrder: image.index || imageIndex,
                imageType: 'sku',  // 🔧 修复：使用 imageType 字段
                skuIndex: sku.skuIndex || skuIndex,
                sourceIndex: image.index || imageIndex  // 🔧 添加 sourceIndex 字段
              })
            }
          })
        }
      })
    }

    // 处理原始图片
    if (Array.isArray(originalImages)) {
      originalImages.forEach((image, imageIndex) => {
        if (image.imageUrl || image.url) {
          const imageUrl = image.imageUrl || image.url
          productImages.push({
            id: `${product.applyCode}_original_${image.index || imageIndex}`,
            url: imageUrl,
            filename: `original_${image.index || imageIndex}.jpg`,
            applyCode: product.applyCode,
            productId: product.productId,
            productName: product.productName,
            sortOrder: image.index || imageIndex,
            imageType: 'original',  // 🔧 修复：使用 imageType 字段
            sourceIndex: image.index || imageIndex  // 🔧 添加 sourceIndex 字段
          })
        }
      })
    }

    return productImages
  }

  // 登录成功后获取数据和产品图片
  useEffect(() => {
    if (!loginInfo?.success) return
    let cancelled = false

    // 检查存储位置配置
    async function checkStorageLocation() {
      console.log('🔍 [checkStorageLocation] 检查存储位置配置...')

      // 检查是否已配置存储位置
      if (!storageLocationManager.hasConfigured()) {
        console.log('⚠️ [checkStorageLocation] 未配置存储位置，显示配置对话框')
        setShowStorageSetupDialog(true)
        return false
      }

      // 验证已保存的位置是否有效
      const isValid = await storageLocationManager.validateSavedLocation()
      if (!isValid) {
        console.log('⚠️ [checkStorageLocation] 存储位置失效，显示配置对话框')
        setShowStorageSetupDialog(true)
        return false
      }

      console.log('✅ [checkStorageLocation] 存储位置配置有效')
      return true
    }

    async function fetchListAndImages() {
      console.log('🚀 [fetchListAndImages] 开始获取产品列表...')
      setLoading(true)
      setError(null)
      try {
        // 获取产品列表
        console.log('📡 [fetchListAndImages] 请求产品列表API...')
        const res = await get('/api/publish/get_product_list', {
          params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
        })

        console.log('📡 [fetchListAndImages] API响应:', res)
        const {statusCode, dataClass} = res  || {}

        if(statusCode === 200 && !cancelled) {
          const productList = dataClass?.publishProductInfos || []
          console.log('📦 [fetchListAndImages] 解析到产品列表:', productList)
          console.log('📦 [fetchListAndImages] 产品数量:', productList.length)

          setData(productList)
          console.log('✅ [fetchListAndImages] 产品列表状态已更新')

          // 单独处理图片收集，不影响产品列表显示
          collectProductImages(productList).then(allImages => {
            if (allImages && allImages.length > 0) {
              setProductImages(allImages)
            }
          }).catch(error => {
            console.warn('⚠️ [fetchListAndImages] 图片收集失败，但不影响产品列表显示:', error)
          })
        } else {
          throw new Error(res.message)
        }
      } catch (e) {
        console.error('❌ [fetchListAndImages] 获取产品列表失败：', e)
        if (!cancelled) setError(e?.message || '获取待办工单失败')
      } finally {
        if (!cancelled) {
          setLoading(false)
          console.log('✅ [fetchListAndImages] loading状态已重置为false')
        }
      }
    }

    // 收集产品的图片信息（增量同步）
    async function collectProductImages(productList) {
      if (!productList || productList.length === 0) {
        return
      }

      console.log('🔄 [collectProductImages] 开始增量收集产品图片信息...')

      // 确保LocalImageManager已初始化
      await localImageManager.initialize()

      // 过滤出需要同步的产品（本地索引中不存在的）
      const productsToSync = []
      const existingProducts = []

      for (const product of productList) {
        const existingProduct = localImageManager.findProductByApplyCode(product.applyCode)
        if (existingProduct) {
          existingProducts.push(product.applyCode)
        } else {
          productsToSync.push(product)
        }
      }

      console.log(`📊 [collectProductImages] 同步统计:`, {
        总产品数: productList.length,
        已存在产品: existingProducts.length,
        需同步产品: productsToSync.length,
        已存在的产品编号: existingProducts,
        需同步的产品编号: productsToSync.map(p => p.applyCode)
      })

      if (productsToSync.length === 0) {
        console.log('✅ [collectProductImages] 所有产品都已同步，跳过图片收集')
        return
      }

      const allImages = []

      for (const product of productsToSync) {
        try {
          const params = {
            applyCode: product.applyCode,
            userId: loginInfo.data.UserId,
            userCode: loginInfo.data.UserCode,
          }

          let imageRes
          try {
            console.log(`🌐 [collectProductImages] 请求产品 ${product.applyCode} 图片API...`, params)
            imageRes = await get('/api/publish/get_product_images', {
              params,
            })
            console.log(`✅ [collectProductImages] 产品 ${product.applyCode} API调用成功`)
          } catch (apiError) {
            console.error(`❌ [collectProductImages] 产品 ${product.applyCode} API调用失败:`, apiError)
            throw new Error(`获取产品图片API失败: ${apiError.message || String(apiError)}`)
          }

          console.log(`🆕 [collectProductImages] 新产品 ${product.applyCode} API响应:`, {
            statusCode: imageRes?.statusCode,
            hasDataClass: !!imageRes?.dataClass,
            message: imageRes?.message,
            fullResponse: imageRes
          })

          if (imageRes.statusCode === 200 && imageRes.dataClass) {
            const productImages = parseProductImages(product, imageRes.dataClass)
            allImages.push(...productImages)
            console.log(`🆕 [collectProductImages] 新产品 ${product.applyCode} 解析到 ${productImages.length} 张图片`)

            // 🔥 保存新产品的完整数据到LocalImageManager索引中
            try {
              console.log(`📦 [collectProductImages] 正在保存新产品 ${product.applyCode} 的数据到本地索引...`)
              console.log('API响应的imageRes.dataClass结构:', JSON.stringify(imageRes.dataClass, null, 2))

              // 确保LocalImageManager已初始化
              await localImageManager.initialize()

              // 获取或创建产品记录，传入产品详情数据以保存chineseName等字段
              const productRecord = localImageManager.getOrCreateProduct(product.applyCode, imageRes.dataClass)

              // 更新产品数据 - 使用API返回的完整数据结构
              const { originalImages, publishSkus, senceImages } = imageRes.dataClass
              console.log('解构后的数据类型检查:', {
                originalImages: {
                  type: typeof originalImages,
                  isArray: Array.isArray(originalImages),
                  length: originalImages?.length
                },
                publishSkus: {
                  type: typeof publishSkus,
                  isArray: Array.isArray(publishSkus),
                  length: publishSkus?.length
                },
                senceImages: {
                  type: typeof senceImages,
                  isArray: Array.isArray(senceImages),
                  length: senceImages?.length
                }
              })

              // 更新originalImages
              if (Array.isArray(originalImages)) {
                productRecord.originalImages = originalImages.map((img, index) => ({
                  ...img,
                  status: 'not_downloaded', // 初始状态
                  timestamp: Date.now()
                }))
              } else {
                // 确保originalImages始终是数组
                productRecord.originalImages = []
              }

              // 更新publishSkus
              if (Array.isArray(publishSkus)) {
                console.log(`🔍 [attrClasses跟踪] ${product.applyCode} API响应中的publishSkus数据:`, publishSkus.map(sku => ({
                  hasAttrClasses: Array.isArray(sku.attrClasses),
                  attrClassesLength: sku.attrClasses?.length || 0,
                  attrClassesData: sku.attrClasses,
                  skuImagesCount: sku.skuImages?.length || 0
                })))

                productRecord.publishSkus = publishSkus.map((sku, skuIndex) => {
                  const mappedSku = {
                    ...sku,
                    skuImages: (sku.skuImages || []).map((img, index) => ({
                      ...img,
                      status: 'not_downloaded', // 初始状态
                      timestamp: Date.now()
                    }))
                  }

                  console.log(`🔍 [attrClasses跟踪] SKU[${skuIndex}] 映射后的attrClasses:`, {
                    原始数据: sku.attrClasses,
                    映射后数据: mappedSku.attrClasses,
                    是否保持一致: JSON.stringify(sku.attrClasses) === JSON.stringify(mappedSku.attrClasses)
                  })

                  return mappedSku
                })

                console.log(`🔍 [attrClasses跟踪] ${product.applyCode} 最终保存到productRecord的publishSkus:`,
                  productRecord.publishSkus.map(sku => ({
                    hasAttrClasses: Array.isArray(sku.attrClasses),
                    attrClassesLength: sku.attrClasses?.length || 0,
                    attrClassesData: sku.attrClasses
                  }))
                )
              } else {
                // 确保publishSkus始终是数组
                productRecord.publishSkus = []
              }

              // 更新senceImages
              if (Array.isArray(senceImages)) {
                productRecord.senceImages = senceImages.map((img, index) => ({
                  ...img,
                  imageUrl: img.imageUrl || img.url,  // 统一字段名称为 imageUrl
                  status: 'not_downloaded', // 初始状态
                  timestamp: Date.now()
                }))
                console.log(`🔍 [场景图片字段检查] ${product.applyCode} 保存的场景图片:`, productRecord.senceImages.map(img => ({
                  hasImageUrl: !!img.imageUrl,
                  hasUrl: !!img.url,
                  imageUrl: img.imageUrl,
                  url: img.url
                })))
              } else {
                // 确保senceImages始终是数组
                productRecord.senceImages = []
              }

              // 保存索引数据
              try {
                await localImageManager.saveIndexData()
                console.log(`✅ [collectProductImages] ${product.applyCode} 索引数据保存成功`)
              } catch (saveError) {
                console.error(`❌ [collectProductImages] ${product.applyCode} 索引数据保存失败:`, saveError)
                throw saveError // 重新抛出错误，让外层catch处理
              }

              console.log(`✅ [collectProductImages] 新产品 ${product.applyCode} 数据已保存到本地索引`)
              console.log(`  - 原始图片: ${productRecord.originalImages.length} 张`)
              console.log(`  - SKU: ${productRecord.publishSkus.length} 个`)
              console.log(`  - 场景图片: ${productRecord.senceImages.length} 张`)

              // 🔍 保存后验证attrClasses数据
              const savedProduct = localImageManager.findProductByApplyCode(product.applyCode)
              if (savedProduct) {
                console.log(`🔍 [attrClasses跟踪] ${product.applyCode} 保存后验证 - publishSkus中的attrClasses:`,
                  savedProduct.publishSkus.map((sku, index) => ({
                    skuIndex: index,
                    hasAttrClasses: Array.isArray(sku.attrClasses),
                    attrClassesLength: sku.attrClasses?.length || 0,
                    attrClassesData: sku.attrClasses
                  }))
                )
              } else {
                console.error(`❌ [attrClasses跟踪] ${product.applyCode} 保存后无法找到产品数据`)
              }

              // 🔥 下载新产品的图片文件
              console.log(`🚀 [collectProductImages] 开始下载新产品 ${product.applyCode} 的图片文件...`)
              const imagesToDownload = []

              // 收集原始图片
              if (Array.isArray(originalImages)) {
                originalImages.forEach((img, index) => {
                  if (img.imageUrl) {
                    imagesToDownload.push({
                      id: `${product.applyCode}_original_${index}`,
                      url: img.imageUrl,
                      imageUrl: img.imageUrl,  // 保留 imageUrl 字段给 downloadSingleImage 使用
                      filename: `original_${index}.jpg`,
                      applyCode: product.applyCode,
                      productId: product.productId,
                      imageType: 'original',
                      sourceIndex: index
                    })
                  }
                })
              }

              // 收集SKU图片
              if (Array.isArray(publishSkus)) {
                publishSkus.forEach((sku, skuIndex) => {
                  if (Array.isArray(sku.skuImages)) {
                    sku.skuImages.forEach((img, imgIndex) => {
                      if (img.imageUrl) {
                        imagesToDownload.push({
                          id: `${product.applyCode}_sku${sku.skuIndex || skuIndex}_${imgIndex}`,
                          url: img.imageUrl,
                          imageUrl: img.imageUrl,  // 保留 imageUrl 字段给 downloadSingleImage 使用
                          filename: `sku${sku.skuIndex || skuIndex}_${imgIndex}.jpg`,
                          applyCode: product.applyCode,
                          productId: product.productId,
                          imageType: 'sku',
                          skuIndex: sku.skuIndex || skuIndex,
                          sourceIndex: imgIndex
                        })
                      }
                    })
                  }
                })
              }

              // 收集场景图片
              if (Array.isArray(senceImages)) {
                senceImages.forEach((img, index) => {
                  // 支持 imageUrl 或 url 字段
                  const imageUrl = img.imageUrl || img.url
                  if (imageUrl) {
                    imagesToDownload.push({
                      id: `${product.applyCode}_scene_${index}`,
                      url: imageUrl,
                      imageUrl: imageUrl,  // 保留 imageUrl 字段给 downloadSingleImage 使用
                      filename: `scene_${index}.jpg`,
                      applyCode: product.applyCode,
                      productId: product.productId,
                      imageType: 'scene',
                      sourceIndex: index
                    })
                  }
                })
              }

              // 执行批量下载
              if (imagesToDownload.length > 0) {
                console.log(`📥 [collectProductImages] 准备下载 ${imagesToDownload.length} 张图片...`)
                // 🔍 调试：记录场景图片的下载信息
                const sceneImages = imagesToDownload.filter(img => img.imageType === 'scene')
                console.log(`🔍 [DEBUG-场景图片] 即将下载 ${sceneImages.length} 张场景图片:`, sceneImages.map(img => ({
                  id: img.id,
                  imageType: img.imageType,
                  applyCode: img.applyCode,
                  sourceIndex: img.sourceIndex,
                  urlPreview: img.url?.substring(0, 60) + '...'
                })))
                try {
                  const downloadResult = await localImageManager.downloadProductImages(imagesToDownload)
                  console.log(`✅ [collectProductImages] 新产品 ${product.applyCode} 图片下载完成:`, downloadResult)
                } catch (error) {
                  console.error(`❌ [collectProductImages] 新产品 ${product.applyCode} 图片下载失败:`, error)
                }
              } else {
                console.log(`⚠️ [collectProductImages] 新产品 ${product.applyCode} 没有需要下载的图片`)
              }

            } catch (error) {
              console.error(`❌ [collectProductImages] 保存新产品 ${product.applyCode} 数据失败:`, error)
            }
          }
        } catch (error) {
          console.error(`=== 获取新产品 ${product.applyCode} 图片失败 ===`)
          console.error('错误类型:', typeof error)
          console.error('错误消息:', error?.message || 'undefined')
          console.error('错误名称:', error?.name || 'undefined')
          console.error('错误堆栈:', error?.stack || 'undefined')
          console.error('完整错误对象:', error)
          console.error('错误字符串:', String(error))
          console.error('是否为Error实例:', error instanceof Error)
          console.error('构造函数名称:', error?.constructor?.name || 'undefined')
          console.error('======================================')
        }
      }

      console.log(`✅ [collectProductImages] 增量同步完成，新收集到 ${allImages.length} 张图片`)
      setProductImages(allImages)
    }

    // 异步初始化流程
    async function initialize() {
      // 先检查存储位置
      const storageValid = await checkStorageLocation()
      if (!storageValid) {
        console.log('⚠️ 存储位置未配置或失效，等待用户配置')
        return
      }

      // 存储位置配置有效，继续获取数据
      fetchListAndImages()

      // 启动自动同步管理器
      if (loginInfo?.success) {
        console.log('启动自动同步管理器')
        autoSyncManager.start(executeSync)
      }
    }

    initialize()

    return () => {
      cancelled = true
      // 停止自动同步管理器
      autoSyncManager.stop()
    }
  }, [loginInfo])

  // 点击"去处理"时，从本地索引读取数据后打开ProductDetail
  const handleOpenItem = async (item, index) => {
    if(openIngIndex === index) return
    if (!item) return
    setOpenLoading(true)
    setOpenIngIndex(index)
    setError(null)

    try {
      // 确保LocalImageManager已初始化
      await localImageManager.initialize()

      // 从本地索引读取产品数据
      const localProductData = localImageManager.findProductByApplyCode(item.applyCode)

      if (!localProductData) {
        // 本地没有数据，提示用户等待同步
        setError('请稍后，数据同步中...')
        return
      }

      // 使用本地数据打开产品详情页
      const productData = {
        ...localProductData,
        userId: loginInfo?.data?.UserId,
        userCode: loginInfo?.data?.UserCode,
      }

      setCurrentProductData(productData)
      setShowProductDetail(true)
      console.log('打开产品详情页（使用本地索引数据）:', productData.applyCode)

    } catch (e) {
      console.error('打开产品详情失败：', e)
      setError(e?.message || '打开产品详情失败')
    } finally {
      setOpenLoading(false)
      setOpenIngIndex(null)
    }
  }

  // 点击"撤回"时，显示确认对话框
  const handleRejectProduct = (item, index) => {
    if(openIngIndex === index) return
    if (!item) return

    // 保存产品信息并显示确认对话框
    setRejectingProduct({ item, index })
    setShowRejectConfirm(true)
  }

  // 确认撤回操作，调用撤回API
  const doRejectProduct = async () => {
    if (!rejectingProduct) return

    const { item, index } = rejectingProduct

    // 关闭确认对话框
    setShowRejectConfirm(false)

    setOpenLoading(true)
    setOpenIngIndex(index)
    setError(null)
    try {
      const params = {
        applyCode: item.applyCode,
        userId: loginInfo?.data?.UserId || 0,
        userCode: loginInfo?.data?.UserCode || 'string',
      }

      console.log('撤回产品:', params)

      const res = await post('/api/publish/revoke_product_image', params, {
        headers: { 'Content-Type': 'application/json' }
      })

      const {statusCode, message} = res || {}
      if(statusCode === 200) {
        setSuccessMsg(message || '撤回成功')

        // 直接更新本地产品状态为3（待处理），优化体验
        setData(prevData => {
          return prevData.map(product =>
            product.applyCode === item.applyCode
              ? { ...product, status: 3 }
              : product
          )
        })
      } else {
        // 失败时显示错误提示
        throw new Error(message || '撤回失败')
      }
    } catch (e) {
      console.error('撤回产品失败：', e)
      setError(e?.message || '撤回产品失败')
    } finally {
      setOpenLoading(false)
      setOpenIngIndex(null)
      setRejectingProduct(null)
    }
  }

  // 监听数据变化（用于调试）
  useEffect(() => {
    console.log('TodoList 数据已更新：', data)
  }, [data])

  // 处理更新状态的方法（当 newStatus 为"审核完成"时发起提交）
  const handleUpdate = async (id, newStatus) => {
    console.log('处理状态更新，ID:', id, '新状态:', newStatus)
    if (newStatus === '审核完成') {
      // 先上传修改的图片，再提交审核
      setIsSubmittingReview(true)
      setShowImageUploader(true)
      return
    }

    // 默认分支：仅本地更新
    setData(prevData => {
      const updatedData = prevData.map(item => 
        (item.applyCode === id || item.id === id) ? { ...item, status: newStatus } : item
      )
      console.log('状态更新后的数据:', updatedData)
      return updatedData
    })
    setShowTodo(false) // 更新后关闭Todo组件
  }

  // 处理重新排序/删除回调
  const handleReorder = (id, payload) => {
    console.log('收到重排序/删除回调，ID:', id, 'payload:', payload)
    
    // 更新主数据
    setData(prev => {
      const updatedData = prev.map(item => 
        (item.applyCode === id || item.id === id) ? { ...item, ...payload } : item
      )
      console.log('主数据更新后:', updatedData.find(item => item.applyCode === id || item.id === id))
      return updatedData
    })
    
    // 更新 Todo 对话框中的数据
    setShowTodo(prev => {
      if (prev && (prev.applyCode === id || prev.id === id)) {
        const updatedTodoData = { ...prev, ...payload }
        console.log('Todo 数据更新后:', updatedTodoData)
        return updatedTodoData
      }
      return prev
    })
  }

  // 关闭Todo组件的方法（先弹窗确认）
  const handleClose = () => {
    setShowCloseConfirm(true)
  }

  // 确认关闭执行
  const doClose = () => {
    setShowCloseConfirm(false)
    setShowTodo(false)
    setError(null)
  }

  // 确认退出登录
  const handleLogout = () => {
    try {
      localStorage.removeItem('loginInfo')
    } catch {
      // 忽略本地存储异常
    }
    setShowLogoutConfirm(false)
    setShowTodo(false)
    setData([])
    setError(null)
    setLoginInfo(null)
  }

  // 直接退出登录（无确认框）
  const handleDirectLogout = () => {
    try {
      localStorage.removeItem('loginInfo')
    } catch {
      // 忽略本地存储异常
    }
    setShowTodo(false)
    setData([])
    setError(null)
    setLoginInfo(null)
  }

  // 登录成功回调
  const handleLoginSuccess = (info) => {
    setLoginInfo(info)
  }

  // 存储位置配置完成回调
  const handleStorageSetupComplete = async (folder) => {
    console.log('✅ [handleStorageSetupComplete] 存储位置配置完成:', folder?.nativePath)
    setShowStorageSetupDialog(false)
    setSuccessMsg('存储位置配置成功！正在同步产品数据...')

    // 配置完成后，立即执行同步
    try {
      await executeSync('manual')
    } catch (error) {
      console.error('配置完成后同步失败:', error)
      setError('同步失败: ' + error.message)
    }
  }

  // 存储位置配置取消回调
  const handleStorageSetupCancel = () => {
    console.log('⚠️ [handleStorageSetupCancel] 用户取消了存储位置配置')
    setError('必须选择存储位置才能继续使用插件')
  }

  // 图片下载完成回调
  const handleDownloadComplete = (results) => {
    console.log('图片下载完成:', results)
    setDownloadCompleted(true)
    setShowImageDownloader(false)
    setSuccessMsg(`图片下载完成: 成功${results.success}张, 跳过${results.skipped}张`)
  }

  // 图片下载错误回调
  const handleDownloadError = (error, results) => {
    console.error('图片下载失败:', error, results)
    setError(`图片下载失败: ${error.message}`)
  }

  // 手动重新下载图片
  const handleRetryDownload = () => {
    if (productImages.length > 0) {
      setShowImageDownloader(true)
      setDownloadCompleted(false)
    }
  }

  // 图片上传完成回调（上传完成后提交审核）
  const handleUploadComplete = async (results) => {
    console.log('图片上传完成:', results)
    setShowImageUploader(false)

    try {
      setError(null)

      // 更新showTodo中的图片URL（如果有新的URL）
      let updatedTodoData = { ...showTodo }
      if (results.newUrls && Object.keys(results.newUrls).length > 0) {
        // 这里需要更新图片URL，具体实现取决于数据结构
        console.log('更新图片URL:', results.newUrls)
        // updatedTodoData.images = updatedTodoData.images.map(...)
      }

      const payload = {
        ...updatedTodoData,
        userId: loginInfo.data.UserId,
        userCode: loginInfo.data.UserCode,
      }
      console.log('提交审核 payload', payload)

      const res = await post('/api/publish/submit_product_image', payload, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' }
      })

      const { statusCode, message, errors } = res || {}
      if (statusCode !== 200) {
        if(errors) {
          const errorMessage = Object.values(errors).flat().join('\n')
          throw new Error(errorMessage || message)
        } else {
          throw new Error(message)
        }
      }

      // 审核提交成功后，关闭弹层
      setShowTodo(false)
      setIsSubmittingReview(false)

      // 弹出成功提示
      setSuccessMsg(message || '提交成功')

      // 重新获取数据
      try {
        setLoading(true)
        const listRes = await get('/api/publish/get_product_list', {
          params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
        })
        const { statusCode: listStatusCode, dataClass: listDataClass } = listRes || {}
        if (listStatusCode === 200) {
          setData(listDataClass?.publishProductInfos || [])
        } else {
          throw new Error(listRes.message)
        }
      } catch (refreshErr) {
        console.warn('重新获取产品列表异常：', refreshErr)
      } finally {
        setLoading(false)
      }

    } catch (e) {
      console.error('提交审核失败：', e)
      setError(e?.message || '提交审核失败')
      setIsSubmittingReview(false)
    }
  }

  // 图片上传错误回调
  const handleUploadError = (error, results) => {
    console.error('图片上传失败:', error, results)
    setShowImageUploader(false)
    setIsSubmittingReview(false)
    setError(`图片上传失败: ${error.message}`)
  }

  // 收集产品的图片信息（增量同步）
  const collectProductImages = useCallback(async (productList, onProgress) => {
    if (!productList || productList.length === 0) {
      return []
    }

    console.log('🔄 [collectProductImages] 开始增量收集产品图片信息...')

    // 确保LocalImageManager已初始化
    await localImageManager.initialize()

    // 过滤出需要同步的产品（本地索引中不存在的）
    const productsToSync = []
    const existingProducts = []

    for (const product of productList) {
      const existingProduct = localImageManager.findProductByApplyCode(product.applyCode)
      if (existingProduct) {
        existingProducts.push(product.applyCode)
      } else {
        productsToSync.push(product)
      }
    }

    console.log(`📊 [collectProductImages] 同步统计:`, {
      总产品数: productList.length,
      已存在产品: existingProducts.length,
      需同步产品: productsToSync.length,
      已存在的产品编号: existingProducts,
      需同步的产品编号: productsToSync.map(p => p.applyCode)
    })

    if (productsToSync.length === 0) {
      console.log('✅ [collectProductImages] 所有产品都已同步，跳过图片收集')
      return []
    }

    const allImages = []

    for (let i = 0; i < productsToSync.length; i++) {
      const product = productsToSync[i]

      // 报告进度
      if (onProgress) {
        onProgress(i + 1, productsToSync.length, product.applyCode)
      }

      try {
        const params = {
          applyCode: product.applyCode,
          userId: loginInfo.data.UserId,
          userCode: loginInfo.data.UserCode,
        }

        const imageRes = await get('/api/publish/get_product_images', {
          params,
        })

        if (imageRes.statusCode === 200 && imageRes.dataClass) {
          const productImages = parseProductImages(product, imageRes.dataClass)
          allImages.push(...productImages)

          // 保存新产品的完整数据到LocalImageManager索引中
          try {
            // 传入产品详情数据以保存chineseName等字段
            const productRecord = localImageManager.getOrCreateProduct(product.applyCode, imageRes.dataClass)
            const { originalImages, publishSkus, senceImages } = imageRes.dataClass

            if (Array.isArray(originalImages)) {
              productRecord.originalImages = originalImages.map((img, index) => ({
                ...img,
                status: 'not_downloaded',
                timestamp: Date.now()
              }))
            }

            if (Array.isArray(publishSkus)) {
              productRecord.publishSkus = publishSkus.map(sku => ({
                ...sku,
                skuImages: (sku.skuImages || []).map((img, index) => ({
                  ...img,
                  status: 'not_downloaded',
                  timestamp: Date.now()
                }))
              }))
            }

            if (Array.isArray(senceImages)) {
              productRecord.senceImages = senceImages.map((img, index) => ({
                ...img,
                imageUrl: img.imageUrl || img.url,  // 统一字段名称为 imageUrl
                status: 'not_downloaded',
                timestamp: Date.now()
              }))
            }

            await localImageManager.saveIndexData()
          } catch (error) {
            console.error(`❌ [collectProductImages] 保存新产品 ${product.applyCode} 数据失败:`, error)
          }
        }
      } catch (error) {
        console.error(`❌ [collectProductImages] 获取新产品 ${product.applyCode} 图片失败:`, error)
      }
    }

    console.log(`✅ [collectProductImages] 增量同步完成，新收集到 ${allImages.length} 张图片`)
    return allImages
  }, [loginInfo, parseProductImages])

  // 执行同步（手动或自动）
  const executeSync = useCallback(async (syncType = 'manual') => {
    console.log(`🚀🚀🚀 === executeSync 函数被调用 === 🚀🚀🚀`)
    console.log(`同步类型: ${syncType}`)
    console.log(`登录信息:`, loginInfo?.success ? '已登录' : '未登录')
    console.log(`开始${syncType === 'auto' ? '自动' : '手动'}同步所有图片到本地`)
    setIsSyncing(true)
    setSyncStatus('正在获取产品列表...')
    setError(null)

    try {
      // 重新获取产品列表
      const res = await get('/api/publish/get_product_list', {
        params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
      })

      const {statusCode, dataClass} = res || {}
      if (statusCode !== 200) {
        throw new Error(res.message || '获取产品列表失败')
      }

      const productList = dataClass?.publishProductInfos || []
      console.log(`获取到 ${productList.length} 个产品`)

      if (productList.length === 0) {
        setSyncStatus('没有产品需要同步')
        if (syncType === 'manual') {
          setSuccessMsg('没有产品需要同步')
        }
        return
      }

      // 更新本地产品列表
      setData(productList)

      setSyncStatus('正在收集图片信息...')

      // 🎯 使用增量同步：调用现有的collectProductImages函数，带进度回调
      const allImages = await collectProductImages(productList, (current, total, applyCode) => {
        setSyncStatus(`收集中 ${current}/${total}`)
        console.log(`图片收集进度: ${current}/${total}, 当前产品: ${applyCode}`)
      }) || []

      console.log(`=== 图片收集汇总 ===`)
      console.log(`总共收集到 ${allImages.length} 张图片`)
      console.log(`图片详情:`, allImages.map(img => ({
        id: img.id,
        applyCode: img.applyCode,
        url: img.url.substring(0, 50) + '...',
        filename: img.filename
      })))

      setProductImages(allImages)
      console.log(`已设置productImages状态，长度: ${allImages.length}`)

      if (allImages.length === 0) {
        setSyncStatus('没有图片需要同步')
        if (syncType === 'manual') {
          setSuccessMsg('没有图片需要同步')
        }
        console.log(`没有图片需要同步，退出`)
        return
      }

      // 🔥 后台静默下载，不显示弹窗
      console.log(`=== 开始后台下载 ${allImages.length} 张图片 ===`)
      setSyncStatus(`同步中 0/${allImages.length}`)

      // 进度回调
      const onProgressCallback = (current, total, currentImage) => {
        console.log(`同步进度: ${current}/${total}, 当前图片:`, currentImage?.id)
        setSyncStatus(`同步中 ${current}/${total}`)
      }

      // 错误回调
      const downloadErrors = []
      const onErrorCallback = (error, imageInfo) => {
        downloadErrors.push({ error: error.message, imageInfo })
        console.error('下载图片失败:', imageInfo?.id, error.message)
      }

      // 执行后台批量下载
      const results = await localImageManager.downloadProductImages(
        allImages,
        onProgressCallback,
        onErrorCallback
      )

      console.log('后台下载完成，结果:', results)

      // 如果有失败的图片，自动跳过它们
      if (results.failed > 0 && downloadErrors.length > 0) {
        console.log(`自动跳过 ${downloadErrors.length} 张失败的图片`)
        try {
          const skippedCount = await localImageManager.skipFailedImages(downloadErrors)
          console.log(`✅ 已自动跳过 ${skippedCount} 张失败的图片`)
          results.skipped = (results.skipped || 0) + skippedCount
          results.failed = 0
        } catch (error) {
          console.error('自动跳过失败的图片时出错:', error)
        }
      }

      // 显示同步结果
      const message = `同步完成: 成功${results.success}张, 跳过${results.skipped}张${results.failed > 0 ? `, 失败${results.failed}张` : ''}`
      setSuccessMsg(message)
      console.log('✅ 后台同步完成')

    } catch (error) {
      console.error(`${syncType === 'auto' ? '自动' : '手动'}同步失败:`, error)
      setError(`同步失败: ${error.message}`)
    } finally {
      setIsSyncing(false)
      setSyncStatus('')
    }
  }, [loginInfo, collectProductImages])

  // 手动同步所有图片到本地
  const handleManualSync = async () => {
    if (isSyncing) return
    await executeSync('manual')
  }

  // 获取产品状态样式类名
  const getProductStatus = (item) => {
    const status = item.status
    // 处理数字状态码
    if (status === 3) return 'pending'
    if (status === 4) return 'completed'
    // 处理字符串状态
    switch (status) {
      case '审核完成':
        return 'completed'
      case '处理中':
        return 'processing'
      case '待处理':
        return 'pending'
      default:
        return 'pending'
    }
  }

  // 获取产品状态文本
  const getProductStatusText = (item) => {
    const status = item.status
    // 处理数字状态码
    if (status === 3) return '待处理'
    if (status === 4) return '编辑审核中'
    // 处理字符串状态（兼容旧数据）
    return status || '待处理'
  }

  // 同步专用的下载完成回调
  const handleSyncDownloadComplete = (results) => {
    console.log('同步下载完成:', results)
    setShowImageDownloader(false)
    setDownloadCompleted(true)
    setSyncStatus('')
    setIsManualSync(false)

    const message = `同步完成: 成功${results.success}张, 跳过${results.skipped}张${results.failed > 0 ? `, 失败${results.failed}张` : ''}`
    setSuccessMsg(message)
  }

  // 同步专用的下载错误回调
  const handleSyncDownloadError = (error, results) => {
    console.error('同步下载失败:', error, results)
    setShowImageDownloader(false)
    setSyncStatus('')
    setIsManualSync(false)
    setError(`同步失败: ${error.message}`)
  }

  // ProductDetail 关闭回调
  const handleProductDetailClose = () => {
    setShowProductDetail(false)
    setCurrentProductData(null)
  }

  // ProductDetail 提交回调
  const handleProductDetailSubmit = async (productData) => {
    try {
      console.log('产品详情页提交:', productData.applyCode)

      // 关闭产品详情页
      setShowProductDetail(false)
      setCurrentProductData(null)

      // 重新获取产品列表数据
      console.log('🔄 重新获取产品列表...')
      setLoading(true)
      try {
        const listRes = await get('/api/publish/get_product_list', {
          params: { userId: loginInfo.data.UserId, userCode: loginInfo.data.UserCode },
        })
        const { statusCode: listStatusCode, dataClass: listDataClass } = listRes || {}
        if (listStatusCode === 200) {
          setData(listDataClass?.publishProductInfos || [])
          console.log('✅ 产品列表已刷新')
        } else {
          throw new Error(listRes.message)
        }
      } catch (refreshErr) {
        console.error('重新获取产品列表失败：', refreshErr)
        setError(`刷新列表失败: ${refreshErr.message}`)
      } finally {
        setLoading(false)
      }

      // 显示成功消息
      setSuccessMsg('操作成功')

    } catch (error) {
      console.error('产品提交处理失败:', error)
      setError(`提交处理失败: ${error.message}`)
    }
  }

  // ProductDetail 数据更新回调
  const handleProductDetailUpdate = (updatedData) => {
    console.log('产品数据更新:', updatedData.applyCode)

    // 更新当前产品数据
    setCurrentProductData(updatedData)

    // 同步更新主列表中的产品数据
    setData(prevData => {
      return prevData.map(item =>
        item.applyCode === updatedData.applyCode
          ? { ...item, ...updatedData }
          : item
      )
    })
  }

  // 搜索相关函数
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setError('请输入搜索关键字')
      return
    }

    // 在现有数据中搜索
    const results = data.filter(product =>
      product?.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product?.applyCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    setSearchResults(results)
    setSearchMode(true)
    setSuccessMsg(`找到 ${results.length} 个相关产品`)
  }, [searchQuery, data])

  const handleExitSearch = useCallback(() => {
    setSearchMode(false)
    setSearchQuery('')
    setSearchResults([])
  }, [])

  // 复制产品编号到剪贴板
  const handleCopyProductCode = async (applyCode) => {
    try {
      await navigator.clipboard.writeText(applyCode)
      setToastMessage('产品编号已复制')
      setToastType('success')
    } catch (error) {
      console.error('复制产品编号失败:', error)
      setToastMessage('复制失败: ' + error.message)
      setToastType('error')
    }
  }

  // 未登录时，显示登录组件
  if (!loginInfo?.success) {
    return (
      <>
        <div className="todo-list" />
        <Login onSuccess={handleLoginSuccess} />
      </>
    )
  }

  return (
    <div className="todo-list">
      {/* 顶部操作区域 - 左右布局 */}
      {loginInfo?.success && (
        <div className="header-actions">
          {/* 左侧搜索区域 - 只在非ProductDetail页面显示 */}
          {!showProductDetail && (
            <div className="header-left">
              {!searchMode ? (
                <div className="todolist-search-input-group">
                  <input
                    ref={searchInputRef}
                    className="todolist-search-input"
                    placeholder="输入产品名称或编号"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    className="action-btn secondary"
                    onClick={handleSearch}
                    disabled={!searchQuery.trim()}
                  >
                    搜索
                  </button>
                </div>
              ) : (
                <div className="todolist-search-result-info">
                  <span className="todolist-search-query">"{searchQuery}"</span>
                  <span className="todolist-search-count">({searchResults.length} 个产品)</span>
                  <button
                    className="action-btn secondary"
                    onClick={handleExitSearch}
                  >
                    返回列表
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 右侧操作按钮 */}
          <div className="header-right">
            {/* 只在非搜索模式下显示同步状态按钮和筛选器 */}
            {!searchMode && (
              <>
                <button
                  className={`action-btn ${isSyncing ? 'syncing' : 'secondary'}`}
                  disabled={isSyncing}
                  onClick={handleManualSync}
                  title={isSyncing ? syncStatus : "点击执行同步"}
                >
                  {isSyncing ? (syncStatus || '同步中') : '就绪'}
                </button>
                {/* 状态筛选下拉框 - 只在非产品详情页显示 */}
                {!showProductDetail && (
                  <select
                    className="status-filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(Number(e.target.value))}
                    title="筛选产品状态"
                  >
                    <option value={3}>待处理</option>
                    <option value={4}>编辑审核中</option>
                  </select>
                )}
              </>
            )}
            <button
              className="action-btn secondary"
              onClick={() => setShowLocalFileManager(true)}
              title="本地文件管理"
            >
              文件
            </button>
            {/* 只在非搜索模式下显示已登录徽章 */}
            {!searchMode && (
              <div className="login-badge-container">
                <div
                  className="login-badge"
                  onClick={() => setShowLogoutConfirm(true)}
                >
                  已登录
                </div>
                <button
                  className="logout-btn"
                  onClick={handleDirectLogout}
                  title="退出登录"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 加载中 */}
      {loading && <div className="loading">加载中...</div>}
      {/* 打开中 */}
      {openLoading && <div className="loading">打开中...</div>}
      {/* 错误提示（可自定义时长的弹窗） */}
      <Toast 
        open={!!error}
        type="error"
        message={error || ''}
        duration={errorDuration}
        onClose={() => setError(null)}
        position="top"
      />
      {/* 成功提示（审核提交成功） */}
      <Toast
        open={!!successMsg}
        type="success"
        message={successMsg}
        duration={successDuration}
        onClose={() => setSuccessMsg('')}
        position="top"
      />
      {/* 复制提示 */}
      <Toast
        open={!!toastMessage}
        type={toastType}
        message={toastMessage}
        duration={2000}
        onClose={() => setToastMessage('')}
        position="top"
      />
      {/* 退出登录确认 */}
      <Confirm
        open={showLogoutConfirm}
        title="退出登录"
        message="退出后需要重新登录，确定要退出吗？"
        confirmText="退出"
        cancelText="取消"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
      {/* 关闭 Todo 确认 */}
      <Confirm
        open={showCloseConfirm}
        title="关闭确认"
        message="确定要关闭当前工单？未提交的更改将不会保存。"
        confirmText="关闭"
        cancelText="取消"
        onCancel={() => setShowCloseConfirm(false)}
        onConfirm={doClose}
      />
      {/* 撤回产品确认 */}
      <Confirm
        open={showRejectConfirm}
        title="撤回确认"
        message="确定要撤回该产品吗？撤回后产品状态将变为待处理。"
        confirmText="确认撤回"
        cancelText="取消"
        onCancel={() => {
          setShowRejectConfirm(false)
          setRejectingProduct(null)
        }}
        onConfirm={doRejectProduct}
      />
      {/* 产品列表 */}
      {/* 调试信息 - 开发期临时添加 */}
      {console.log('🎨 [render] 当前状态:', { loading, error: !!error, dataLength: data.length, data })}

      {/* 列表为空时，显示提示 */}
      { !loading && !error && data.length === 0 && (
        <div className='empty'>
          <div className='empty-icon'>📦</div>
          <div className='empty-text'>暂无待处理产品</div>
          <div className='empty-hint'>请先同步产品数据</div>
        </div>
      )}
      {data.length > 0 && <div className='product-list'>
        {/* 只在非搜索模式下显示list-header */}
        {!searchMode && (
          <div className='list-header'>
            <h2 className='list-title'>待处理产品列表 ({data.length})</h2>
            <div className='list-subtitle'>点击"去处理"进入产品详情页面</div>
          </div>
        )}
        {searchMode ? (
          // 搜索结果展示区域 - 显示多个ProductDetail组件
          <div className="todolist-search-results">
            {searchResults.length === 0 ? (
              <div className="no-results">
                <div className="no-results-icon">🔍</div>
                <div className="no-results-text">未找到匹配的产品</div>
                <div className="no-results-hint">请尝试其他关键字</div>
              </div>
            ) : (
              searchResults.map((product, index) => (
                <div key={product.id || product.applyCode || index} className="todolist-search-result-item">
                  <ProductDetail
                    productData={product}
                    onClose={() => {
                      // 在搜索结果中不需要关闭单个产品详情
                      console.log('搜索结果中的产品详情不支持单独关闭')
                    }}
                    onSubmit={handleUpdate}
                    onUpdate={handleUpdate}
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          // 原有的产品卡片列表
          <div className='product-grid'>
            {data.filter(item => item.status === statusFilter).map((item, index) => (
            <div className='product-card' key={item.applyCode || item.id}>
              <div className='card-header'>
                <div className='product-id'>
                  <span className='id-label'>编号</span>
                  <span className='id-value'>{item.applyCode}</span>
                  <div
                    className='copy-product-code-btn'
                    onClick={() => handleCopyProductCode(item.applyCode)}
                  >
                    复制
                  </div>
                </div>
                <div className='product-status'>
                  <span className={`status-badge ${getProductStatus(item)}`}>
                    {getProductStatusText(item)}
                  </span>
                </div>
              </div>
              <div className='card-body'>
                <div
                  className={`product-name ${item.status === 4 ? 'clickable' : ''}`}
                  onClick={item.status === 4 ? () => handleOpenItem(item, index) : undefined}
                  style={item.status === 4 ? { cursor: 'pointer' } : undefined}
                >
                  {item.productName}
                </div>
              </div>
              <div className='card-footer'>
                {item.status === 4 ? (
                  // 状态为4（已处理）时显示撤回按钮
                  <button
                    className={`reject-btn ${openIngIndex === index ? 'loading' : ''}`}
                    onClick={() => handleRejectProduct(item, index)}
                    disabled={openIngIndex === index}
                  >
                    {openIngIndex === index ? '处理中...' : '撤回'}
                  </button>
                ) : (
                  // 状态为3（待处理）或其他状态时显示去处理按钮
                  <button
                    className={`process-btn ${openIngIndex === index ? 'loading' : ''}`}
                    onClick={() => handleOpenItem(item, index)}
                    disabled={openIngIndex === index}
                  >
                    {openIngIndex === index ? '加载中...' : '去处理'}
                  </button>
                )}
              </div>
            </div>
            ))}
          </div>
        )}
      </div>}
      {/* Todo 对话框 */}
      {showTodo && (
        <Todo
          data={showTodo}
          onClose={handleClose}
          onUpdate={handleUpdate}
          onReorder={handleReorder}
        />
      )}
      {/* 图片批量下载对话框 */}
      {showImageDownloader && (
        <ImageDownloader
          productImages={productImages}
          autoStart={true}
          onComplete={isManualSync ? handleSyncDownloadComplete : handleDownloadComplete}
          onError={isManualSync ? handleSyncDownloadError : handleDownloadError}
        />
      )}
      {/* 图片批量上传对话框 */}
      {showImageUploader && (
        <ImageUploader
          autoStart={true}
          onComplete={handleUploadComplete}
          onError={handleUploadError}
          applyCode={showTodo?.applyCode || ''}
          userId={loginInfo?.data?.UserId || ''}
          userCode={loginInfo?.data?.UserCode || ''}
        />
      )}
      {/* 本地文件管理器 */}
      {showLocalFileManager && (
        <LocalFileManager
          onClose={() => setShowLocalFileManager(false)}
        />
      )}
      {/* 产品详情页 */}
      {showProductDetail && currentProductData && (
        <ProductDetail
          productData={currentProductData}
          onClose={handleProductDetailClose}
          onSubmit={handleProductDetailSubmit}
          onUpdate={handleProductDetailUpdate}
        />
      )}
      {/* 存储位置配置对话框 */}
      {showStorageSetupDialog && (
        <StorageSetupDialog
          onComplete={handleStorageSetupComplete}
          onCancel={handleStorageSetupCancel}
          isRetry={storageLocationManager.hasConfigured()}
        />
      )}
    </div>
  )
}

export default TodoList