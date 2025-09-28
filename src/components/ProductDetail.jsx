import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import { ConcurrentUploadManager } from '../utils/ConcurrentUploadManager.js';
import { placeImageInPS, registerPSEventListeners, unregisterPSEventListeners } from '../panels/photoshop-api.js';
import { post } from '../utils/http.js';
import './ProductDetail.css';

/**
 * 本地图片组件 - 仅显示本地文件系统中的图片
 * 使用React.memo优化性能
 */
const LocalImage = React.memo(({ imageUrl, alt, className, hasLocal, needsRefresh, onRefreshComplete, onDoubleClick, onClick, onMouseDown, onContextMenu, isOpening, isSyncing, isRecentlyUpdated, isCompleted, imageStatus }) => {
  const [displaySrc, setDisplaySrc] = useState(null);
  const [loading, setLoading] = useState(hasLocal);

  useEffect(() => {
    let isMounted = true;

    const loadLocalImage = async () => {
      if (!hasLocal || !imageUrl) {
        setDisplaySrc(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const localDisplayUrl = await localImageManager.getLocalImageDisplayUrlByUrl(imageUrl);

        if (isMounted) {
          if (localDisplayUrl) {
            console.log(`✅ [LocalImage] 加载本地图片: ${imageUrl.substring(0, 50)}...`);
            setDisplaySrc(localDisplayUrl);
          } else {
            console.log(`❌ [LocalImage] 本地图片不存在: ${imageUrl.substring(0, 50)}...`);
            setDisplaySrc(null);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.warn('❌ [LocalImage] 加载本地图片失败:', error);
          setDisplaySrc(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadLocalImage();

    return () => {
      isMounted = false;
    };
  }, [imageUrl, hasLocal, needsRefresh]);

  // 当刷新完成时通知父组件
  useEffect(() => {
    if (needsRefresh && displaySrc && onRefreshComplete) {
      console.log(`✅ [LocalImage] 图片刷新完成: ${imageUrl.substring(0, 30)}...`);
      onRefreshComplete();
    }
  }, [needsRefresh, displaySrc, onRefreshComplete, imageUrl]);

  if (!hasLocal) {
    return (
      <div className="local-image-placeholder">
        <div className="placeholder-text">本地图片不可用</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="local-image-loading">
        <div className="loading-text">加载中...</div>
      </div>
    );
  }

  if (!displaySrc) {
    return (
      <div className="local-image-error">
        <div className="error-text">图片加载失败</div>
      </div>
    );
  }

  return (
    <div
      className={`local-image-container ${isOpening ? 'opening' : ''} ${hasLocal ? 'clickable' : ''} ${isSyncing ? 'syncing' : ''} ${isRecentlyUpdated ? 'recently-updated' : ''} ${isCompleted ? 'completed' : ''}`}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      <img
        src={displaySrc}
        alt={alt}
        className={className}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {isOpening && (
        <div className="opening-overlay">
          <div className="opening-spinner">⏳</div>
          <div className="opening-text">正在PS中打开...</div>
        </div>
      )}
      {isSyncing && !isOpening && (
        <div className="syncing-overlay">
          <div className="syncing-spinner">🔄</div>
          <div className="syncing-text">同步中...</div>
        </div>
      )}
      {isRecentlyUpdated && !isOpening && !isSyncing && !isCompleted && (
        <div className="updated-indicator">
          <div className="updated-icon">✅</div>
          <div className="updated-text">已更新</div>
        </div>
      )}
      {hasLocal && !isOpening && !isSyncing && !isRecentlyUpdated && !isCompleted && imageStatus === 'pending_edit' && (
        <div className="double-click-hint pending-edit">
          🔗 待编辑 - 右键在PS中打开
        </div>
      )}
      {hasLocal && !isOpening && !isSyncing && !isRecentlyUpdated && !isCompleted && imageStatus === 'editing' && (
        <div className="double-click-hint editing">
          ✏️ 编辑中 - 右键在PS中打开
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只有关键props变化时才重渲染
  return prevProps.imageUrl === nextProps.imageUrl &&
         prevProps.hasLocal === nextProps.hasLocal &&
         prevProps.alt === nextProps.alt &&
         prevProps.className === nextProps.className &&
         prevProps.isOpening === nextProps.isOpening &&
         prevProps.isSyncing === nextProps.isSyncing &&
         prevProps.isRecentlyUpdated === nextProps.isRecentlyUpdated &&
         prevProps.isCompleted === nextProps.isCompleted &&
         prevProps.imageStatus === nextProps.imageStatus;
});

/**
 * 产品详情页组件
 * 用于管理单个产品的图片编辑、排序、增删等操作
 */
const ProductDetail = ({
  productData,      // 产品完整数据
  onClose,          // 关闭回调
  onSubmit,         // 提交审核回调
  onUpdate          // 数据更新回调
}) => {
  // 状态管理
  const [currentProduct, setCurrentProduct] = useState(productData || {});
  const [imageGroups, setImageGroups] = useState({
    original: [],
    skus: [],
    scenes: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingImage, setDeletingImage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // 批量上传进度 {current: 0, total: 0}
  const [uploadStats, setUploadStats] = useState(null); // 上传统计信息
  const [uploadErrors, setUploadErrors] = useState([]); // 上传错误列表
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);
  const [openingImageId, setOpeningImageId] = useState(null);
  const [syncingImages, setSyncingImages] = useState(new Set()); // 正在同步的图片ID集合
  const [recentlyUpdatedImages, setRecentlyUpdatedImages] = useState(new Set()); // 最近更新的图片ID集合
  const [completedImages, setCompletedImages] = useState(new Set()); // 已完成的图片ID集合
  const [editingImages, setEditingImages] = useState(new Set()); // 编辑中的图片ID集合
  const [refreshingImages, setRefreshingImages] = useState(new Set()); // 需要刷新的图片ID集合
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false); // 显示工作流程指引
  const [imageLayout, setImageLayout] = useState('small'); // 图片布局尺寸：small(100px), medium(140px), large(180px)
  const [skipDeleteConfirmation, setSkipDeleteConfirmation] = useState(false); // 全局控制是否跳过删除确认
  const [dontAskAgain, setDontAskAgain] = useState(false); // 当前对话框中"不再询问"复选框状态

  // 图片预览模式状态管理
  const [previewMode, setPreviewMode] = useState({
    isOpen: false,
    currentImageId: null,
    currentImageIndex: 0,
    imageList: []
  });

  // 拖拽状态管理
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedImageId: null,
    draggedImageType: null, // 'original', 'sku', 'scene'
    draggedSkuIndex: null,  // SKU拖拽时的索引
    hoveredDropTarget: null // 当前悬停的放置目标
  });
  const contentRef = useRef(null);
  const dragEnterTimeoutRef = useRef(null);

  // 智能鼠标点击检测不再需要定时器和计数器

  // 虚拟化配置 - 当图片数量超过阈值时启用
  const VIRTUALIZATION_THRESHOLD = 30;
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  // 优化的图片数据计算 - 使用useMemo缓存计算结果
  const optimizedImageGroups = useMemo(() => {
    if (!imageGroups.original && !imageGroups.skus && !imageGroups.scenes) {
      return { original: [], skus: [], scenes: [] };
    }

    return {
      original: (imageGroups.original || []).map((img, index) => ({
        ...img,
        isDragged: dragState.draggedImageId === img.id,
        isHovered: dragState.hoveredDropTarget?.type === 'original' &&
                   dragState.hoveredDropTarget?.index === index
      })),

      skus: (imageGroups.skus || []).map(sku => ({
        ...sku,
        images: sku.images.map((img, imgIndex) => ({
          ...img,
          isDragged: dragState.draggedImageId === img.id,
          isHovered: dragState.hoveredDropTarget?.type === 'sku' &&
                     dragState.hoveredDropTarget?.skuIndex === sku.skuIndex &&
                     dragState.hoveredDropTarget?.index === imgIndex
        }))
      })),

      scenes: (imageGroups.scenes || []).map((img, index) => ({
        ...img,
        isDragged: dragState.draggedImageId === img.id,
        isHovered: dragState.hoveredDropTarget?.type === 'scene' &&
                   dragState.hoveredDropTarget?.index === index
      }))
    };
  }, [imageGroups, dragState.draggedImageId, dragState.hoveredDropTarget]);

  // 虚拟化图片数据 - 只渲染可见范围内的图片
  const virtualizedImageGroups = useMemo(() => {
    const totalImages = (optimizedImageGroups.original?.length || 0) +
                       (optimizedImageGroups.skus?.reduce((sum, sku) => sum + (sku.images?.length || 0), 0) || 0) +
                       (optimizedImageGroups.scenes?.length || 0);

    // 如果图片总数少于阈值，不启用虚拟化
    if (totalImages < VIRTUALIZATION_THRESHOLD) {
      return optimizedImageGroups;
    }

    // 启用虚拟化 - 只渲染可见范围的图片
    return {
      original: (optimizedImageGroups.original || []).slice(visibleRange.start, visibleRange.end),
      skus: (optimizedImageGroups.skus || []).map(sku => ({
        ...sku,
        images: sku.images.slice(0, Math.min(sku.images.length, 20)) // 每个SKU最多显示20张图片
      })),
      scenes: (optimizedImageGroups.scenes || []).slice(visibleRange.start, visibleRange.end)
    };
  }, [optimizedImageGroups, visibleRange, VIRTUALIZATION_THRESHOLD]);

  // 统一图片列表 - 用于预览模式导航
  const getAllImages = useMemo(() => {
    const allImages = [];

    // 添加原始图片
    if (imageGroups.original) {
      imageGroups.original.forEach((img, index) => {
        allImages.push({
          ...img,
          category: 'original',
          categoryName: '原始图片',
          categoryIndex: index,
          displayName: `原始图片 ${index + 1}`
        });
      });
    }

    // 添加SKU图片
    if (imageGroups.skus) {
      imageGroups.skus.forEach((sku, skuIndex) => {
        if (sku.images) {
          sku.images.forEach((img, imgIndex) => {
            allImages.push({
              ...img,
              category: 'sku',
              categoryName: sku.skuTitle || `颜色款式 ${skuIndex + 1}`,
              categoryIndex: imgIndex,
              displayName: `${sku.skuTitle} 图片 ${imgIndex + 1}`
            });
          });
        }
      });
    }

    // 添加场景图片
    if (imageGroups.scenes) {
      imageGroups.scenes.forEach((img, index) => {
        allImages.push({
          ...img,
          category: 'scene',
          categoryName: '场景图片',
          categoryIndex: index,
          displayName: `场景图片 ${index + 1}`
        });
      });
    }

    return allImages;
  }, [imageGroups]);

  // 初始化图片数据
  useEffect(() => {
    initializeImageData();
  }, [productData]);

  // 组件初始化时读取用户删除确认设置
  useEffect(() => {
    loadDeleteSettings();
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (dragEnterTimeoutRef.current) {
        clearTimeout(dragEnterTimeoutRef.current);
      }
    };
  }, []);

  // PS事件监听器注册和清理
  useEffect(() => {
    if (!currentProduct.applyCode) {
      return;
    }

    console.log(`📡 [PS事件监听] 为产品 ${currentProduct.applyCode} 注册PS事件监听器`);

    const handlePSFileSaved = async (syncResult) => {
      try {
        // 处理PS用户保存确认事件
        if (syncResult.type === 'ps_user_save_confirmed') {
          console.log(`💾 [PS事件监听] 用户确认保存事件:`, syncResult);

          // 检查是否是当前产品的图片
          const isCurrentProductImage = await checkIfCurrentProductImage(syncResult.imageId);
          if (!isCurrentProductImage) {
            console.log(`ℹ️ [PS事件监听] 非当前产品图片，跳过: ${syncResult.imageId}`);
            return;
          }

          console.log(`✅ [PS事件监听] 检测到当前产品图片用户保存确认: ${syncResult.imageId}`);

          // 如果后端已自动标记为完成，直接更新UI状态
          if (syncResult.autoCompleted) {
            console.log(`🎯 [PS事件监听] 图片已自动完成，更新UI状态: ${syncResult.imageId}`);

            // 直接标记为已完成
            setCompletedImages(prev => new Set([...prev, syncResult.imageId]));

            // 移除编辑中状态
            setEditingImages(prev => {
              const next = new Set(prev);
              next.delete(syncResult.imageId);
              return next;
            });

            // 刷新图片显示
            await handleImageFileUpdated(syncResult.imageId);

            // 标记为最近更新（完成状态）
            setRecentlyUpdatedImages(prev => new Set([...prev, syncResult.imageId]));

            // 3秒后清除"最近更新"状态
            setTimeout(() => {
              setRecentlyUpdatedImages(prev => {
                const next = new Set(prev);
                next.delete(syncResult.imageId);
                return next;
              });
            }, 3000);

            console.log(`🎉 [PS事件监听] 图片保存确认完成: ${syncResult.imageId}`);
          } else {
            // 如果没有自动标记为完成，进行常规的文件修改检查
            console.log(`🔄 [PS事件监听] 检查文件修改状态: ${syncResult.imageId}`);

            const wasModified = await localImageManager.checkFileModification(syncResult.imageId);
            if (wasModified) {
              await handleImageFileUpdated(syncResult.imageId);
              setRecentlyUpdatedImages(prev => new Set([...prev, syncResult.imageId]));

              setTimeout(() => {
                setRecentlyUpdatedImages(prev => {
                  const next = new Set(prev);
                  next.delete(syncResult.imageId);
                  return next;
                });
              }, 3000);
            }
          }

          // 移除同步状态（如果有）
          setSyncingImages(prev => {
            const next = new Set(prev);
            next.delete(syncResult.imageId);
            return next;
          });
        }

        // 处理PS文档关闭完成事件
        else if (syncResult.type === 'ps_document_closed_completed') {
          console.log(`🎯 [PS事件监听] 接收到PS文档关闭完成通知:`, syncResult);

          // 检查是否是当前产品的图片
          const isCurrentProductImage = await checkIfCurrentProductImage(syncResult.imageId);
          if (!isCurrentProductImage) {
            console.log(`ℹ️ [PS事件监听] 非当前产品图片，跳过: ${syncResult.imageId}`);
            return;
          }

          console.log(`✅ [PS事件监听] 检测到当前产品图片已完成: ${syncResult.imageId}`);

          // 标记为已完成
          setCompletedImages(prev => new Set([...prev, syncResult.imageId]));

          // 标记单个图片需要刷新（局部刷新，避免整页重新加载）
          setRefreshingImages(prev => new Set([...prev, syncResult.imageId]));

          console.log(`🎉 [PS事件监听] 图片已标记为完成状态: ${syncResult.imageId}`);
        }

        // 处理PS文档关闭无修改事件
        else if (syncResult.type === 'ps_document_closed_no_change') {
          console.log(`🔄 [PS事件监听] PS文档关闭但图片未修改，重置为待编辑状态: ${syncResult.imageId}`);

          // 检查是否是当前产品的图片
          const isCurrentProductImage = await checkIfCurrentProductImage(syncResult.imageId);
          if (!isCurrentProductImage) {
            console.log(`ℹ️ [PS事件监听] 非当前产品图片，跳过: ${syncResult.imageId}`);
            return;
          }

          // 移除编辑中状态
          setEditingImages(prev => {
            const next = new Set(prev);
            next.delete(syncResult.imageId);
            return next;
          });

          // 更新图片组状态为待编辑
          updateImageStatusInState(syncResult.imageId, 'pending_edit');

          console.log(`✅ [PS事件监听] 图片状态已重置为待编辑: ${syncResult.imageId}`);
        }

      } catch (error) {
        console.error(`❌ [PS事件监听] 处理PS事件失败:`, error);
        // 确保清除同步状态
        setSyncingImages(prev => {
          const next = new Set(prev);
          next.delete(syncResult.imageId);
          return next;
        });
      }
    };

    // 注册PS事件监听器
    const registered = registerPSEventListeners(handlePSFileSaved);

    if (registered) {
      console.log(`✅ [PS事件监听] 成功注册PS事件监听器`);
    } else {
      console.warn(`⚠️ [PS事件监听] PS事件监听器注册失败`);
    }

    // 清理函数
    return () => {
      console.log(`🧹 [PS事件监听] 为产品 ${currentProduct.applyCode} 清理PS事件监听器`);
      // 注意：这里不调用unregisterPSEventListeners，因为可能有多个组件在使用
      // PS事件监听器是全局的，应该在适当的时候统一清理
    };
  }, [currentProduct.applyCode]);

  // 监听图片分组数据变化，恢复滚动位置
  useEffect(() => {
    if (savedScrollPosition > 0 && contentRef.current && !loading) {
      console.log('🔄 [useEffect] 检测到数据更新，准备恢复滚动位置:', savedScrollPosition);

      // 使用多种方式确保滚动位置被正确恢复
      const restoreScroll = () => {
        if (contentRef.current) {
          contentRef.current.scrollTop = savedScrollPosition;
          console.log('✅ [restoreScroll] 滚动位置已恢复:', savedScrollPosition, '实际位置:', contentRef.current.scrollTop);
        }
      };

      // 立即尝试恢复
      restoreScroll();

      // 使用多个时间点尝试恢复，确保在不同的渲染阶段都能成功
      setTimeout(restoreScroll, 50);
      setTimeout(restoreScroll, 150);
      setTimeout(restoreScroll, 300);

      // 清除保存的滚动位置
      setSavedScrollPosition(0);
    }
  }, [imageGroups, savedScrollPosition, loading]);

  /**
   * 读取删除确认设置
   */
  const loadDeleteSettings = async () => {
    try {
      // 检查UXP环境
      if (typeof require === 'undefined') {
        console.log('⚠️ [loadDeleteSettings] 非UXP环境，使用localStorage');
        const saved = localStorage.getItem('deleteConfirmationSettings');
        if (saved) {
          const settings = JSON.parse(saved);
          setSkipDeleteConfirmation(settings.skipConfirmation || false);
        }
        return;
      }

      const storage = require('uxp').storage;
      const localFileSystem = storage.localFileSystem;
      const dataFolder = await localFileSystem.getDataFolder();

      try {
        const settingsFile = await dataFolder.getEntry('deleteSettings.json');
        const content = await settingsFile.read();
        const settings = JSON.parse(content);
        setSkipDeleteConfirmation(settings.skipConfirmation || false);
        console.log('✅ [loadDeleteSettings] 删除设置已加载:', settings);
      } catch (error) {
        // 文件不存在，使用默认值
        console.log('ℹ️ [loadDeleteSettings] 设置文件不存在，使用默认值');
        setSkipDeleteConfirmation(false);
      }
    } catch (error) {
      console.warn('⚠️ [loadDeleteSettings] 读取设置失败:', error);
      setSkipDeleteConfirmation(false);
    }
  };

  /**
   * 保存删除确认设置
   */
  const saveDeleteSettings = async (skipConfirmation) => {
    try {
      const settings = { skipConfirmation };

      // 检查UXP环境
      if (typeof require === 'undefined') {
        console.log('⚠️ [saveDeleteSettings] 非UXP环境，使用localStorage');
        localStorage.setItem('deleteConfirmationSettings', JSON.stringify(settings));
        return;
      }

      const storage = require('uxp').storage;
      const formats = storage.formats;
      const localFileSystem = storage.localFileSystem;
      const dataFolder = await localFileSystem.getDataFolder();

      const settingsFile = await dataFolder.createFile('deleteSettings.json', { overwrite: true });
      await settingsFile.write(JSON.stringify(settings), { format: formats.utf8 });
      console.log('✅ [saveDeleteSettings] 设置已保存:', settings);
    } catch (error) {
      console.error('❌ [saveDeleteSettings] 保存设置失败:', error);
    }
  };

  /**
   * 初始化图片数据分组
   */
  const initializeImageData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!currentProduct.applyCode) {
        throw new Error('缺少产品申请码');
      }

      // 确保本地图片管理器已初始化
      await localImageManager.initialize();

      // 自动迁移旧状态到三状态系统
      try {
        const migrationResult = await localImageManager.migrateProductToThreeStateSystem(currentProduct.applyCode);
        if (migrationResult.migrated > 0) {
          console.log(`🎉 [自动迁移] 已将 ${migrationResult.migrated} 张图片迁移到三状态系统`);
        }
      } catch (migrationError) {
        console.warn('⚠️ [自动迁移] 状态迁移失败:', migrationError);
      }

      // 从LocalImageManager读取最新的产品数据
      const latestProductData = localImageManager.findProductByApplyCode(currentProduct.applyCode);

      // 如果LocalImageManager中有最新数据，使用最新数据；否则使用原始数据
      const productDataToUse = latestProductData || currentProduct;

      console.log('ProductDetail 使用数据源:', {
        applyCode: currentProduct.applyCode,
        useLatestData: !!latestProductData,
        originalImagesCount: latestProductData?.originalImages?.length || currentProduct.originalImages?.length || 0,
        skusCount: latestProductData?.publishSkus?.length || currentProduct.publishSkus?.length || 0,
        sceneImagesCount: latestProductData?.senceImages?.length || currentProduct.senceImages?.length || 0
      });

      // 处理图片分组 - 使用useMemo优化已在组件级别实现
      const groups = processImageGroups(productDataToUse);
      setImageGroups(groups);

      console.log('ProductDetail 初始化完成:', {
        applyCode: currentProduct.applyCode,
        originalCount: groups.original.length,
        skuCount: groups.skus.length,
        sceneCount: groups.scenes.length
      });

    } catch (error) {
      console.error('ProductDetail 初始化失败:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理图片分组逻辑
   */
  const processImageGroups = (productData) => {
    const { originalImages = [], publishSkus = [], senceImages = [] } = productData;

    return {
      // 原始图片
      original: originalImages.map((img, index) => {
        const localInfo = getLocalImageInfo(img.imageUrl);
        return {
          ...img,
          id: img.imageUrl || `${productData.applyCode}_original_${index}`,
          type: 'original',
          index: index,
          localStatus: localInfo.status,
          hasLocal: localInfo.status !== 'not_downloaded' && localInfo.status !== 'unknown',
          isCompleted: localInfo.status === 'completed'
        };
      }),

      // SKU图片分组
      skus: publishSkus.map((sku, skuIndex) => ({
        ...sku,
        skuTitle: getSkuTitle(sku.attrClasses),
        images: (sku.skuImages || []).map((img, imgIndex) => {
          const localInfo = getLocalImageInfo(img.imageUrl);
          return {
            ...img,
            id: img.imageUrl || `${productData.applyCode}_sku${sku.skuIndex || skuIndex}_${imgIndex}`,
            type: 'sku',
            skuIndex: sku.skuIndex || skuIndex,
            index: img.index || imgIndex,
            localStatus: localInfo.status,
            hasLocal: localInfo.status !== 'not_downloaded' && localInfo.status !== 'unknown',
            isCompleted: localInfo.status === 'completed'
          };
        })
      })),

      // 场景图片
      scenes: senceImages.map((img, index) => {
        const localInfo = getLocalImageInfo(img.imageUrl);
        return {
          ...img,
          id: img.imageUrl || `${productData.applyCode}_scene_${index}`,
          type: 'scene',
          index: img.index || index,
          localStatus: localInfo.status,
          hasLocal: localInfo.status !== 'not_downloaded' && localInfo.status !== 'unknown',
          isCompleted: localInfo.status === 'completed'
        };
      })
    };
  };

  /**
   * 获取SKU标题
   */
  const getSkuTitle = (attrClasses = []) => {
    if (!Array.isArray(attrClasses) || attrClasses.length === 0) {
      return '未命名款式';
    }

    return attrClasses
      .map(attr => `${attr.attrName}: ${attr.attrValue}`)
      .join(', ');
  };

  /**
   * 获取本地图片状态和显示URL
   */
  const getLocalImageInfo = (imageUrl) => {
    if (!imageUrl) return { status: 'unknown', displayUrl: null };

    try {
      // 直接从索引获取图片信息
      const imageInfo = localImageManager.getImageInfo(imageUrl);
      if (!imageInfo) return { status: 'not_downloaded', displayUrl: null };

      const status = imageInfo.status || 'unknown';
      return { status, displayUrl: null }; // displayUrl将在渲染时异步获取
    } catch (error) {
      console.warn('获取图片状态失败:', error);
      return { status: 'unknown', displayUrl: null };
    }
  };

  /**
   * 获取当前标签页的图片列表
   */
  const getCurrentTabImages = () => {
    switch (activeTab) {
      case 'original':
        return imageGroups.original;
      case 'sku':
        return imageGroups.skus.flatMap(sku => sku.images);
      case 'scene':
        return imageGroups.scenes;
      default:
        return [];
    }
  };

  /**
   * 处理图片刷新完成事件
   */
  const handleImageRefreshComplete = useCallback((imageId) => {
    console.log(`🔄 [图片刷新] 完成刷新，移除刷新标识: ${imageId}`);
    setRefreshingImages(prev => {
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
  }, []);

  /**
   * 获取所有待编辑状态的图片（仅统计SKU和场景图片，相同图片去重）
   */
  const getAllPendingEditImages = useCallback(() => {
    const pendingImages = [];
    const seenUrls = new Set(); // 用于去重的URL集合

    // 从SKU图片收集待编辑状态的图片
    if (imageGroups.skus) {
      imageGroups.skus.forEach((sku, skuIndex) => {
        if (sku.images) {
          sku.images.forEach((img, imgIndex) => {
            if (img.localStatus === 'pending_edit' && img.hasLocal && !seenUrls.has(img.imageUrl)) {
              seenUrls.add(img.imageUrl);
              pendingImages.push({
                ...img,
                category: 'sku',
                categoryName: sku.skuTitle || `颜色款式 ${skuIndex + 1}`,
                displayName: `${sku.skuTitle} 图片 ${imgIndex + 1}`,
                skuIndex: sku.skuIndex || skuIndex
              });
            }
          });
        }
      });
    }

    // 从场景图片收集待编辑状态的图片
    if (imageGroups.scenes) {
      imageGroups.scenes.forEach((img, index) => {
        if (img.localStatus === 'pending_edit' && img.hasLocal && !seenUrls.has(img.imageUrl)) {
          seenUrls.add(img.imageUrl);
          pendingImages.push({
            ...img,
            category: 'scene',
            categoryName: '场景图片',
            displayName: `场景图片 ${index + 1}`
          });
        }
      });
    }

    console.log(`🔍 [getAllPendingEditImages] 找到 ${pendingImages.length} 张待编辑图片（仅SKU和场景图片，已去重）`);
    return pendingImages;
  }, [imageGroups]);

  /**
   * 获取批量同步按钮的文本
   */
  const getSyncButtonText = useCallback(() => {
    if (isSyncing) return '正在同步...';

    const pendingCount = getAllPendingEditImages().length;
    if (pendingCount === 0) return '批量同步到PS';

    return `批量同步到PS (${pendingCount}张待编辑)`;
  }, [isSyncing, getAllPendingEditImages]);

  /**
   * 获取批量同步按钮的禁用状态
   */
  const getSyncButtonDisabled = useCallback(() => {
    return isSyncing || getAllPendingEditImages().length === 0;
  }, [isSyncing, getAllPendingEditImages]);

  /**
   * 批量同步待编辑图片到PS
   */
  const handleBatchSyncToPS = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      // 获取所有待编辑状态的图片
      const pendingImages = getAllPendingEditImages();

      if (pendingImages.length === 0) {
        setError('当前产品没有待编辑状态的本地图片');
        return;
      }

      console.log(`🚀 [批量同步] 开始批量同步 ${pendingImages.length} 张待编辑图片到 Photoshop`);

      // 批量处理配置
      const BATCH_SIZE = 3; // 避免同时打开太多PS文档
      const results = { success: 0, failed: 0, errors: [] };

      // 分批处理图片
      for (let i = 0; i < pendingImages.length; i += BATCH_SIZE) {
        const batch = pendingImages.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(pendingImages.length / BATCH_SIZE);

        console.log(`📦 [批量同步] 处理第 ${batchNumber}/${totalBatches} 批，包含 ${batch.length} 张图片`);

        // 并发处理当前批次
        const batchPromises = batch.map(async (image) => {
          try {
            console.log(`🖼️ [批量同步] 正在打开图片: ${image.displayName} (${image.id})`);

            // 使用现有的单个图片打开逻辑
            const psImageInfo = {
              imageId: image.id,
              url: image.imageUrl,
              type: 'smart'
            };

            const documentId = await placeImageInPS(psImageInfo, { directOpen: true });

            console.log(`✅ [批量同步] 成功打开: ${image.displayName} (文档ID: ${documentId})`);
            results.success++;

            return { success: true, imageId: image.id, documentId, displayName: image.displayName };
          } catch (error) {
            console.error(`❌ [批量同步] 打开失败: ${image.displayName}`, error);
            results.failed++;
            results.errors.push({
              imageId: image.id,
              displayName: image.displayName,
              error: error.message
            });

            return { success: false, imageId: image.id, displayName: image.displayName, error: error.message };
          }
        });

        // 等待当前批次完成
        await Promise.allSettled(batchPromises);

        // 批次间短暂延迟，避免PS过载
        if (i + BATCH_SIZE < pendingImages.length) {
          console.log(`⏳ [批量同步] 批次间延迟，给PS缓冲时间...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 刷新图片数据显示最新状态
      console.log(`🔄 [批量同步] 刷新图片数据以显示最新状态...`);
      await initializeImageData();

      // 显示结果
      if (results.success > 0 && results.failed === 0) {
        console.log(`🎉 [批量同步] 完全成功: 已成功打开 ${results.success} 张图片到PS中`);
      } else if (results.success > 0 && results.failed > 0) {
        const errorDetails = results.errors.map(err => `${err.displayName}: ${err.error}`).join('\n');
        console.warn(`⚠️ [批量同步] 部分成功: ${results.success}张成功, ${results.failed}张失败\n失败详情:\n${errorDetails}`);
        setError(`部分同步成功: ${results.success}张成功, ${results.failed}张失败`);
      } else {
        const errorDetails = results.errors.map(err => `${err.displayName}: ${err.error}`).join('\n');
        console.error(`💥 [批量同步] 完全失败:\n${errorDetails}`);
        setError('批量同步失败，请检查PS是否正常运行');
      }

    } catch (error) {
      console.error('❌ [批量同步] 批量同步过程发生异常:', error);
      setError(`批量同步失败: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * 提交审核 - 完整的批量图片上传流程
   */
  const handleSubmitReview = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      setUploadProgress(null);
      setUploadStats(null);
      setUploadErrors([]);

      console.log('🚀 开始提交审核:', currentProduct.applyCode);

      // 1. 获取当前产品需要上传的图片（SKU+场景）
      await localImageManager.initialize();
      const modifiedImages = localImageManager.getModifiedImages(currentProduct.applyCode);

      if (modifiedImages.length === 0) {
        console.log('✅ 没有需要上传的图片，直接提交审核');

        // 没有图片需要上传，直接调用提交API
        await submitForReview();
        return;
      }

      // 2. 按图片类型分组统计
      const imageStats = modifiedImages.reduce((stats, img) => {
        stats[img.imageType] = (stats[img.imageType] || 0) + 1;
        return stats;
      }, {});

      console.log('📊 需要上传的图片统计:', imageStats);
      console.log(`📤 开始上传 ${modifiedImages.length} 张图片...`);

      // 3. 创建并发上传管理器
      const uploadManager = new ConcurrentUploadManager({
        concurrency: 3, // 并发数
        retryTimes: 3,   // 重试次数
        retryDelay: 1000 // 初始重试延迟
      });

      // 4. 设置上传队列
      uploadManager.setQueue(modifiedImages, {
        applyCode: currentProduct.applyCode,
        userId: currentProduct.userId || 0,
        userCode: currentProduct.userCode || null
      });

      // 5. 开始上传并处理进度和结果
      const results = await uploadManager.startUpload(
        // 进度回调
        (progress) => {
          setUploadProgress({
            total: progress.total,
            completed: progress.completed,
            success: progress.success,
            failed: progress.failed,
            running: progress.running,
            currentTask: progress.currentTask
          });
          console.log(`📈 上传进度: ${progress.completed}/${progress.total} (成功:${progress.success}, 失败:${progress.failed})`);
        },

        // 单个成功回调
        (task, result) => {
          console.log(`✅ 图片上传成功: ${task.imageId} -> ${result.url}`);

          // 同时更新UI状态和currentProduct数据源
          updateImageGroupsLocally(groups => {
            const updateImage = (images) => {
              console.log(`🔍 [UI更新] 开始查找图片进行URL更新:`, {
                imageType: task.imageType,
                imageIndex: task.imageIndex,
                skuIndex: task.skuIndex,
                originalImageId: task.originalImageId,
                newUrl: result.url,
                imagesCount: images?.length || 0
              });

              if (!images || images.length === 0) {
                console.warn(`⚠️ [UI更新] 图片数组为空`);
                return;
              }

              // 方法1: 使用imageIndex进行精确匹配
              if (typeof task.imageIndex === 'number' && task.imageIndex >= 0 && task.imageIndex < images.length) {
                const targetImg = images[task.imageIndex];
                console.log(`🎯 [UI更新] 按索引[${task.imageIndex}]匹配图片:`, {
                  currentUrl: targetImg.imageUrl,
                  originalImageId: task.originalImageId,
                  indexMatch: true
                });

                targetImg.imageUrl = result.url;
                targetImg.localStatus = 'synced';
                console.log(`✅ [UI更新] 按索引匹配成功: [${task.imageIndex}] -> ${result.url}`);
                return;
              }

              // 方法2: 多重匹配条件查找
              let foundImage = null;
              let foundIndex = -1;

              for (let i = 0; i < images.length; i++) {
                const img = images[i];
                console.log(`🔍 [UI更新] 检查图片[${i}]:`, {
                  imageUrl: img.imageUrl,
                  id: img.id,
                  index: img.index,
                  localPath: img.localPath
                });

                // 匹配条件1: originalImageId匹配
                if (img.imageUrl === task.originalImageId || img.id === task.originalImageId) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [UI更新] originalImageId匹配成功 [${i}]`);
                  break;
                }

                // 匹配条件2: localPath匹配
                if (img.localPath === task.localPath) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [UI更新] localPath匹配成功 [${i}]`);
                  break;
                }

                // 匹配条件3: 图片索引匹配
                if (typeof task.imageIndex === 'number' && (img.index === task.imageIndex || i === task.imageIndex)) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [UI更新] 图片索引匹配成功 [${i}]`);
                  break;
                }
              }

              if (foundImage) {
                foundImage.imageUrl = result.url;
                foundImage.localStatus = 'synced';
                console.log(`✅ [UI更新] 图片URL更新成功 [${foundIndex}]: ${task.originalImageId} -> ${result.url}`);
              } else {
                console.error(`❌ [UI更新] 未找到匹配的图片:`, {
                  originalImageId: task.originalImageId,
                  localPath: task.localPath,
                  imageIndex: task.imageIndex,
                  availableImages: images.map((img, idx) => ({
                    index: idx,
                    imageUrl: img.imageUrl,
                    id: img.id,
                    localPath: img.localPath
                  }))
                });
              }
            };

            if (task.imageType === 'original') {
              updateImage(groups.original);
            } else if (task.imageType === 'sku') {
              const sku = groups.skus.find(s => s.skuIndex === task.skuIndex);
              if (sku) updateImage(sku.images);
            } else if (task.imageType === 'scene') {
              updateImage(groups.scenes);
            }
          });

          // 同步更新currentProduct中的imageUrl
          setCurrentProduct(prevProduct => {
            const updatedProduct = { ...prevProduct };

            const updateProductImage = (images) => {
              if (!images) {
                console.warn(`⚠️ [currentProduct更新] 图片数组为空`);
                return;
              }

              console.log(`🔍 [currentProduct更新] 开始查找图片进行URL更新:`, {
                imageType: task.imageType,
                imageIndex: task.imageIndex,
                skuIndex: task.skuIndex,
                originalImageId: task.originalImageId,
                newUrl: result.url,
                imagesCount: images.length
              });

              // 方法1: 使用imageIndex进行精确匹配
              if (typeof task.imageIndex === 'number' && task.imageIndex >= 0 && task.imageIndex < images.length) {
                const targetImg = images[task.imageIndex];
                console.log(`🎯 [currentProduct更新] 按索引[${task.imageIndex}]匹配图片:`, {
                  currentUrl: targetImg.imageUrl,
                  originalImageId: task.originalImageId,
                  indexMatch: true
                });

                targetImg.imageUrl = result.url;
                console.log(`✅ [currentProduct更新] 按索引匹配成功: [${task.imageIndex}] -> ${result.url}`);
                return;
              }

              // 方法2: 多重匹配条件查找
              let foundImage = null;
              let foundIndex = -1;

              for (let i = 0; i < images.length; i++) {
                const img = images[i];
                console.log(`🔍 [currentProduct更新] 检查图片[${i}]:`, {
                  imageUrl: img.imageUrl,
                  id: img.id,
                  index: img.index,
                  localPath: img.localPath
                });

                // 匹配条件1: originalImageId匹配
                if (img.imageUrl === task.originalImageId || img.id === task.originalImageId) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [currentProduct更新] originalImageId匹配成功 [${i}]`);
                  break;
                }

                // 匹配条件2: localPath匹配
                if (img.localPath === task.localPath) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [currentProduct更新] localPath匹配成功 [${i}]`);
                  break;
                }

                // 匹配条件3: 图片索引匹配
                if (typeof task.imageIndex === 'number' && (img.index === task.imageIndex || i === task.imageIndex)) {
                  foundImage = img;
                  foundIndex = i;
                  console.log(`✅ [currentProduct更新] 图片索引匹配成功 [${i}]`);
                  break;
                }
              }

              if (foundImage) {
                foundImage.imageUrl = result.url;
                console.log(`✅ [currentProduct更新] 图片URL更新成功 [${foundIndex}]: ${task.originalImageId} -> ${result.url}`);
              } else {
                console.error(`❌ [currentProduct更新] 未找到匹配的图片:`, {
                  originalImageId: task.originalImageId,
                  localPath: task.localPath,
                  imageIndex: task.imageIndex,
                  availableImages: images.map((img, idx) => ({
                    index: idx,
                    imageUrl: img.imageUrl,
                    id: img.id,
                    localPath: img.localPath
                  }))
                });
              }
            };

            if (task.imageType === 'original') {
              updateProductImage(updatedProduct.originalImages);
            } else if (task.imageType === 'sku') {
              const sku = updatedProduct.publishSkus?.find(s => s.skuIndex === task.skuIndex);
              if (sku) updateProductImage(sku.skuImages);
            } else if (task.imageType === 'scene') {
              updateProductImage(updatedProduct.senceImages);
            }

            return updatedProduct;
          });
        },

        // 单个错误回调
        (task, error) => {
          console.error(`❌ 图片上传失败: ${task.imageId} - ${error.message}`);

          setUploadErrors(prev => [...prev, {
            imageId: task.imageId,
            imageType: task.imageType,
            error: error.message,
            attempts: task.attempts
          }]);
        },

        // 全部完成回调
        async (finalResults, duration) => {
          setUploadStats({
            ...finalResults,
            duration,
            imageStats
          });

          console.log('🏁 图片上传完成:', finalResults);

          // 检查上传结果
          if (finalResults.failed > 0) {
            const failedCount = finalResults.failed;
            const totalCount = finalResults.total;

            setError(`上传过程中有 ${failedCount}/${totalCount} 张图片失败。请检查错误信息或重试。`);

            // 询问用户是否继续提交审核
            const shouldContinue = window.confirm(
              `有 ${failedCount} 张图片上传失败。\n\n是否继续提交审核？\n点击"确定"继续提交，点击"取消"停止流程。`
            );

            if (!shouldContinue) {
              console.log('🛑 用户选择停止提交流程');
              setUploadProgress(null); // 用户取消时立即清理进度条
              return;
            }
          }

          // 6. 验证上传结果
          console.log('🔍 开始验证图片上传结果...');
          console.log('📊 上传统计:', {
            total: finalResults.total,
            success: finalResults.success,
            failed: finalResults.failed
          });

          // 从上传管理器获取成功上传的图片ID列表
          const successfulImageIds = Object.keys(finalResults.newUrls || {});
          console.log('🆔 成功上传的图片ID:', successfulImageIds);

          const validationResults = await localImageManager.validateUploadResults(
            currentProduct.applyCode,
            successfulImageIds
          );

          if (!validationResults.success) {
            const errorMsg = `图片URL更新验证失败: ${validationResults.errors.join(', ')}`;
            console.error('❌ 验证失败:', errorMsg);
            setError(errorMsg);

            const shouldContinue = window.confirm(
              `发现 ${validationResults.errors.length} 个URL更新问题。\n\n是否仍然继续提交审核？\n点击"确定"继续提交，点击"取消"停止流程。`
            );

            if (!shouldContinue) {
              console.log('🛑 用户选择停止提交流程（验证失败）');
              setUploadProgress(null); // 用户取消时立即清理进度条
              return;
            }
          } else {
            console.log(`✅ 验证成功: ${validationResults.totalUpdated} 张图片URL已正确更新`);
          }

          // 7. 所有图片处理完成后，提交审核
          await submitForReview();
        }
      );

    } catch (error) {
      console.error('❌ 提交审核失败:', error);
      setError(`提交失败: ${error.message}`);
    } finally {
      setIsSubmitting(false);
      // 上传完成后延迟清理进度条，让用户看到完成状态
      setTimeout(() => {
        setUploadProgress(null);
      }, 2000); // 2秒后清理进度条
    }
  };

  /**
   * 调用审核API
   */
  const submitForReview = async () => {
    try {
      console.log('📋 提交产品审核...');

      // 构建完整的API请求体
      const payload = {
        userId: currentProduct.userId || 0,
        userCode: currentProduct.userCode || null,
        applyCode: currentProduct.applyCode,

        // 原始图片 - 只包含imageUrl
        originalImages: (currentProduct.originalImages || []).map(img => ({
          imageUrl: img.imageUrl
        })),

        // SKU图片 - 包含完整的SKU结构
        publishSkus: (currentProduct.publishSkus || []).map(sku => ({
          attrClasses: sku.attrClasses || [],
          skuImages: (sku.skuImages || []).map(img => ({
            imageUrl: img.imageUrl,
            index: img.index || 0
          })),
          skuIndex: sku.skuIndex || 0
        })),

        // 场景图片 - 包含imageUrl和index
        senceImages: (currentProduct.senceImages || []).map(img => ({
          imageUrl: img.imageUrl,
          index: img.index || 0
        }))
      };

      console.log('📤 提交审核 payload:', payload);
      console.log('📊 数据统计:', {
        originalImages: payload.originalImages.length,
        publishSkus: payload.publishSkus.length,
        senceImages: payload.senceImages.length,
        totalSkuImages: payload.publishSkus.reduce((sum, sku) => sum + sku.skuImages.length, 0)
      });

      // TODO: 调用审核API (暂时注释用于本地调试)
      console.log('🚧 [调试模式] 审核API调用已注释，仅输出日志');
      console.log('🔗 API端点: POST /api/publish/submit_product_image');
      console.log('📦 请求头:', {
        'Content-Type': 'application/json',
        'Accept': 'text/plain'
      });
      console.log('📋 请求体详情:', JSON.stringify(payload, null, 2));

      /*
      const response = await post('/api/publish/submit_product_image', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/plain'
        }
      });

      const { statusCode, message, errors } = response || {};

      // 检查响应状态
      if (statusCode !== 200) {
        if (errors && Object.keys(errors).length > 0) {
          const errorMessage = Object.values(errors).flat().join('\n');
          throw new Error(errorMessage || message);
        } else {
          throw new Error(message || '审核提交失败');
        }
      }

      console.log('✅ 产品审核提交成功:', message);

      // API成功后的清理和导航逻辑
      await handleSubmitSuccess(message);
      */

      // 模拟API成功响应进行调试
      console.log('✅ [调试模式] 模拟审核提交成功');
      const mockMessage = '产品审核提交成功 - 调试模式';
      await handleSubmitSuccess(mockMessage);

    } catch (error) {
      console.error('❌ 审核API调用失败:', error);
      throw new Error(`审核提交失败: ${error.message}`);
    }
  };

  /**
   * 处理提交成功后的清理和导航
   *
   * 🚧 本地测试模式 - 清理功能已暂时禁用
   * 为了便于本地调试和验证，暂时注释掉数据清理和页面导航功能
   */
  const handleSubmitSuccess = async (successMessage) => {
    try {
      console.log('🎉 提交成功:', successMessage || '审核提交完成');
      console.log('🚧 [本地测试模式] 清理功能已禁用，保留产品数据和本地图片');

      // TODO: 本地测试完成后取消下面的注释

      /*
      console.log('🧹 开始清理产品数据...');

      // 1. 从本地索引移除产品数据（包含本地图片文件删除）
      const removed = await localImageManager.removeProduct(currentProduct.applyCode);
      if (removed) {
        console.log('✅ 产品数据已从本地索引移除');
      }

      // 2. 关闭产品详情页 - 延迟执行确保用户看到成功状态
      setTimeout(() => {
        if (onClose) {
          console.log('📱 关闭产品详情页');
          onClose();
        }
      }, 1500);

      // 3. 触发父组件更新 - 通知移除产品
      if (onUpdate) {
        console.log('🔄 通知父组件更新产品列表');
        onUpdate(currentProduct.applyCode, 'submitted');
      }
      */

    } catch (error) {
      console.error('⚠️ 清理过程出现错误:', error);
      // 即使清理失败，也不阻止页面关闭
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 1500);
    }
  };

  /**
   * 关闭详情页
   */
  const handleClose = () => {
    onClose?.();
  };

  /**
   * 确认删除图片
   */
  const handleConfirmDelete = async (image) => {
    // 如果用户选择跳过确认，直接执行删除
    if (skipDeleteConfirmation) {
      console.log('ℹ️ [handleConfirmDelete] 跳过删除确认，直接执行删除');
      await executeDelete(image);
    } else {
      // 显示确认对话框
      setDeletingImage(image);
      setDontAskAgain(false); // 重置复选框状态
    }
  };

  /**
   * 取消删除
   */
  const handleCancelDelete = () => {
    setDeletingImage(null);
  };

  /**
   * 添加图片功能
   */
  const handleAddImage = async (imageType, skuIndex = null) => {
    try {
      setError(null);

      // 检查UXP环境
      if (typeof require === 'undefined') {
        throw new Error('此功能需要在UXP环境中运行');
      }

      const fs = require('uxp').storage.localFileSystem;

      // 显示文件选择对话框 - 限制PNG/JPG格式
      const files = await fs.getFileForOpening({
        allowMultiple: true,
        types: ['png', 'jpg', 'jpeg']
      });

      if (!files || files.length === 0) {
        console.log('用户取消了文件选择');
        return;
      }

      console.log(`📁 [handleAddImage] 选择的文件: ${files.length}个, 类型: ${imageType}`);

      // 初始化进度状态
      if (files.length > 1) {
        setUploadProgress({ completed: 0, total: files.length, success: 0, failed: 0, running: 0 });
      }

      // 保存滚动位置
      let savedScrollPosition = 0;
      if (contentRef.current) {
        savedScrollPosition = contentRef.current.scrollTop;
        console.log('💾 [handleAddImage] 保存滚动位置:', savedScrollPosition);
      } else {
        console.warn('⚠️ [handleAddImage] contentRef.current为null，无法保存滚动位置');
      }

      // 调用LocalImageManager批量添加图片（传递进度回调）
      const results = await localImageManager.addLocalImages(
        currentProduct.applyCode,
        files,
        imageType,
        skuIndex,
        files.length > 1 ? (current) => {
          setUploadProgress({ completed: current, total: files.length, success: current, failed: 0, running: 0 });
        } : null
      );

      console.log(`✅ [handleAddImage] 批量添加完成:`, results);

      // 显示添加结果
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;

      if (failedCount > 0) {
        const failedResults = results.filter(r => !r.success);
        const formatErrors = failedResults.filter(r => r.error === '不支持的图片格式，仅支持PNG和JPG格式');
        const otherErrors = failedResults.filter(r => r.error !== '不支持的图片格式，仅支持PNG和JPG格式');

        let errorMessage = '';
        if (formatErrors.length > 0) {
          const formatErrorFiles = formatErrors.map(r => r.fileName).join(', ');
          errorMessage += `格式不支持的文件: ${formatErrorFiles}（仅支持PNG和JPG格式）`;
        }
        if (otherErrors.length > 0) {
          const otherErrorFiles = otherErrors.map(r => r.fileName).join(', ');
          if (errorMessage) errorMessage += '；';
          errorMessage += `其他错误文件: ${otherErrorFiles}`;
        }

        setError(`${failedCount}个文件添加失败：${errorMessage}`);
        console.warn(`⚠️ [handleAddImage] ${failedCount}个文件添加失败`);

        // 如果有成功的文件，也给出成功提示
        if (successCount > 0) {
          console.log(`✅ [handleAddImage] 成功添加了 ${successCount} 个图片`);
        }
      }

      console.log(`✅ [handleAddImage] 成功添加 ${successCount}/${files.length} 个图片`);

      // 清理进度状态
      setUploadProgress(null);

      // 如果有成功添加的图片，更新本地状态
      const successfulImages = results.filter(r => r.success);
      if (successfulImages.length > 0) {
        console.log(`🚀 [handleAddImage] 使用优化方式添加 ${successfulImages.length} 张图片到状态`);
        // 将LocalImageManager的结果转换为状态需要的格式
        const stateImages = successfulImages.map(result => ({
          imageUrl: result.imageUrl,
          localPath: result.localPath,
          fileName: result.fileName,
          status: result.status,
          hasLocal: true
        }));
        addImagesToState(imageType, skuIndex, stateImages);
      }

      console.log(`🎉 [handleAddImage] 图片添加完成（优化版本）`);

    } catch (error) {
      console.error('❌ [handleAddImage] 添加图片失败:', error);
      setError(`添加图片失败: ${error.message}`);
    }
  };

  /**
   * 拖拽开始事件处理
   */
  const handleDragStart = (e, imageId, imageType, skuIndex = null) => {
    try {
      // 存储拖拽数据到简单字符串格式 - UXP兼容
      const dragData = JSON.stringify({
        imageId,
        imageType,
        skuIndex
      });

      e.dataTransfer.setData('text/plain', dragData);
      e.dataTransfer.effectAllowed = 'move';

      // 更新拖拽状态
      setDragState({
        isDragging: true,
        draggedImageId: imageId,
        draggedImageType: imageType,
        draggedSkuIndex: skuIndex,
        hoveredDropTarget: null
      });

      console.log(`🎯 [handleDragStart] 开始拖拽图片: ${imageId}, 类型: ${imageType}, SKU: ${skuIndex}`);
    } catch (error) {
      console.error('❌ [handleDragStart] 拖拽开始失败:', error);
    }
  };

  /**
   * 拖拽结束事件处理 - 确保状态重置
   */
  const handleDragEnd = useCallback((e) => {
    try {
      console.log('🏁 [handleDragEnd] 拖拽结束，重置拖拽状态');

      // 无论拖拽是否成功，都重置状态
      setDragState({
        isDragging: false,
        draggedImageId: null,
        draggedImageType: null,
        draggedSkuIndex: null,
        hoveredDropTarget: null
      });

      // 清理防抖定时器
      if (dragEnterTimeoutRef.current) {
        clearTimeout(dragEnterTimeoutRef.current);
        dragEnterTimeoutRef.current = null;
      }

    } catch (error) {
      console.error('❌ [handleDragEnd] 拖拽结束处理失败:', error);
    }
  }, []);

  /**
   * 拖拽经过目标事件处理
   */
  const handleDragOver = (e) => {
    e.preventDefault(); // 允许放置
    e.dataTransfer.dropEffect = 'move';
  };

  /**
   * 拖拽进入目标事件处理 - 添加防抖优化
   */
  const handleDragEnter = useCallback((e, targetIndex, targetType, targetSkuIndex = null) => {
    if (!dragState.isDragging) return;

    // 检查是否为跨类型插入操作（从原始图片拖拽到SKU/场景图片）
    const isCrossTypeInsertion = (
      dragState.draggedImageType === 'original' &&
      (targetType === 'sku' || targetType === 'scene')
    );

    // 允许同类型内部排序或跨类型插入
    if (!isCrossTypeInsertion &&
        (dragState.draggedImageType !== targetType || dragState.draggedSkuIndex !== targetSkuIndex)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    // 设置拖拽效果：跨类型为复制，同类型为移动
    e.dataTransfer.dropEffect = isCrossTypeInsertion ? 'copy' : 'move';

    // 清除之前的定时器
    if (dragEnterTimeoutRef.current) {
      clearTimeout(dragEnterTimeoutRef.current);
    }

    // 在异步操作前提取事件数据，避免合成事件警告
    const currentTarget = e.currentTarget;
    const clientX = e.clientX;

    // 防抖处理，减少频繁的状态更新
    dragEnterTimeoutRef.current = setTimeout(() => {
      // 使用UXP兼容的位置计算方式
      const elementWidth = currentTarget.offsetWidth || 200;
      const rect = { left: currentTarget.offsetLeft, width: elementWidth };
      const midPoint = rect.left + rect.width / 2;
      const insertPosition = clientX < midPoint ? 'before' : 'after';

      setDragState(prev => {
        // 只有真正改变时才更新状态，避免无效重渲染
        if (prev.hoveredDropTarget?.index !== targetIndex ||
            prev.hoveredDropTarget?.type !== targetType ||
            prev.hoveredDropTarget?.skuIndex !== targetSkuIndex ||
            prev.hoveredDropTarget?.position !== insertPosition) {
          return {
            ...prev,
            hoveredDropTarget: {
              index: targetIndex,
              type: targetType,
              skuIndex: targetSkuIndex,
              position: insertPosition,
              isCrossTypeInsertion: isCrossTypeInsertion
            }
          };
        }
        return prev; // 无变化时返回原状态
      });
    }, 50); // UXP环境下使用50ms防抖间隔
  }, [dragState.isDragging, dragState.draggedImageType, dragState.draggedSkuIndex]);

  /**
   * 拖拽离开目标事件处理 - 添加防抖优化
   */
  const handleDragLeave = useCallback((e) => {
    // 清除防抖定时器
    if (dragEnterTimeoutRef.current) {
      clearTimeout(dragEnterTimeoutRef.current);
      dragEnterTimeoutRef.current = null;
    }

    // 在访问前提取事件数据，避免合成事件警告
    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget;

    // 只有当真正离开目标元素时才清除hover状态
    if (!currentTarget.contains(relatedTarget)) {
      setDragState(prev => {
        if (prev.hoveredDropTarget) {
          return { ...prev, hoveredDropTarget: null };
        }
        return prev; // 无变化时返回原状态
      });
    }
  }, []);

  /**
   * 放置事件处理 - 插入式排序
   */
  const handleDrop = async (e, targetIndex, targetType, targetSkuIndex = null) => {
    e.preventDefault();

    try {
      if (!dragState.isDragging) return;

      const dragDataStr = e.dataTransfer.getData('text/plain');
      if (!dragDataStr) {
        console.warn('⚠️ [handleDrop] 无法获取拖拽数据');
        return;
      }

      const dragData = JSON.parse(dragDataStr);

      // 检查是否为跨类型插入操作
      const isCrossTypeInsertion = (
        dragData.imageType === 'original' &&
        (targetType === 'sku' || targetType === 'scene')
      );

      // 允许同类型内部排序或跨类型插入
      if (!isCrossTypeInsertion &&
          (dragData.imageType !== targetType || dragData.skuIndex !== targetSkuIndex)) {
        console.warn('⚠️ [handleDrop] 不支持此类型的拖拽操作');
        return;
      }

      // 在访问前提取事件数据，避免合成事件警告
      const currentTargetRect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX;

      // 计算插入位置（跨类型插入固定为before，同类型可before或after）
      const insertPosition = isCrossTypeInsertion ? 'before' :
        (clientX < (currentTargetRect.left + currentTargetRect.width / 2) ? 'before' : 'after');

      console.log(`📍 [handleDrop] ${isCrossTypeInsertion ? '跨类型插入' : '同类型排序'}: ${dragData.imageId} 到位置 ${targetIndex} (${insertPosition})`);

      if (isCrossTypeInsertion) {
        // 执行跨类型图片引用插入
        await insertImageReference(dragData, targetIndex, targetType, targetSkuIndex);
      } else {
        // 执行同类型重排序
        await reorderImages(dragData, targetIndex, targetType, targetSkuIndex, insertPosition);
      }

    } catch (error) {
      console.error('❌ [handleDrop] 拖拽放置失败:', error);
      setError(`拖拽排序失败: ${error.message}`);
    } finally {
      // 重置拖拽状态
      setDragState({
        isDragging: false,
        draggedImageId: null,
        draggedImageType: null,
        draggedSkuIndex: null,
        hoveredDropTarget: null
      });
    }
  };

  /**
   * 跨类型图片引用插入核心逻辑 - 性能优化版本
   */
  const insertImageReference = async (dragData, targetIndex, targetType, targetSkuIndex) => {
    try {
      setError(null);
      console.log(`🚀 [insertImageReference] 开始优化跨类型插入:`, {
        from: dragData.imageType,
        to: targetType,
        imageId: dragData.imageId,
        targetIndex: targetIndex,
        targetSkuIndex: targetSkuIndex
      });

      // 先在本地状态中执行插入，提供即时视觉反馈
      insertImageInState(dragData, targetIndex, targetType, targetSkuIndex);

      // 异步同步到LocalImageManager（不阻塞UI）
      try {
        const result = await localImageManager.insertImageReferenceAt(
          currentProduct.applyCode,
          dragData.imageId,
          dragData.imageType,
          targetType,
          targetIndex,
          dragData.skuIndex,
          targetSkuIndex
        );

        if (result.success) {
          console.log(`✅ [insertImageReference] 数据同步成功`);
        } else {
          console.warn('⚠️ [insertImageReference] 数据同步失败，但UI已更新');
          // 如果数据同步失败但不是重复图片错误，显示警告
          if (result.error !== '目标位置已存在相同的图片') {
            setError(`插入图片警告: ${result.error || '数据同步失败'}`);
          }
        }
      } catch (syncError) {
        console.error('❌ [insertImageReference] 数据同步失败:', syncError);
        // 数据同步失败时，可以选择回滚UI状态或显示警告
        setError(`插入图片警告: 数据同步失败，但UI已更新`);
      }

      console.log(`🎉 [insertImageReference] 跨类型插入完成（优化版本）`);

    } catch (error) {
      console.error('❌ [insertImageReference] 跨类型插入失败:', error);
      setError(`插入图片失败: ${error.message}`);
    }
  };

  /**
   * 本地状态更新工具函数 - 避免全量数据刷新
   */
  const updateImageGroupsLocally = useCallback((updateFn) => {
    setImageGroups(prev => {
      const newGroups = { ...prev };
      updateFn(newGroups);
      return newGroups;
    });
  }, []);

  /**
   * 在状态中执行图片排序 - 避免全量刷新
   */
  const reorderImagesInState = useCallback((dragData, targetIndex, targetType, targetSkuIndex, insertPosition) => {
    updateImageGroupsLocally(groups => {
      let targetArray;

      // 获取目标数组引用
      if (targetType === 'original') {
        targetArray = groups.original;
      } else if (targetType === 'sku') {
        const targetSkuGroup = groups.skus.find(sku => sku.skuIndex === targetSkuIndex);
        if (targetSkuGroup) {
          targetArray = targetSkuGroup.images;
        }
      } else if (targetType === 'scene') {
        targetArray = groups.scenes;
      }

      if (!targetArray) {
        console.error('❌ [reorderImagesInState] 找不到目标数组:', { targetType, targetSkuIndex });
        return;
      }

      // 查找源图片索引
      const sourceIndex = targetArray.findIndex(img =>
        img.imageUrl === dragData.imageId || img.id === dragData.imageId
      );

      if (sourceIndex === -1) {
        console.error('❌ [reorderImagesInState] 找不到源图片:', dragData.imageId);
        return;
      }

      // 计算最终插入位置
      let finalIndex = insertPosition === 'before' ? targetIndex : targetIndex + 1;

      // 如果源位置在目标位置之前，需要调整插入位置
      if (sourceIndex < finalIndex) {
        finalIndex--;
      }

      // 如果位置相同，不需要移动
      if (sourceIndex === finalIndex) {
        console.log('ℹ️ [reorderImagesInState] 位置未变化，无需排序');
        return;
      }

      console.log(`🔄 [reorderImagesInState] 执行本地排序: ${sourceIndex} -> ${finalIndex}`);

      // 执行数组重排序
      const [draggedItem] = targetArray.splice(sourceIndex, 1);
      targetArray.splice(finalIndex, 0, draggedItem);

      // 重新计算索引
      targetArray.forEach((img, index) => {
        img.index = index;
      });
    });
  }, [updateImageGroupsLocally]);

  /**
   * 在状态中执行跨类型插入 - 避免全量刷新
   */
  const insertImageInState = useCallback((dragData, targetIndex, targetType, targetSkuIndex) => {
    updateImageGroupsLocally(groups => {
      // 查找源图片
      let sourceImage = null;

      if (dragData.imageType === 'original') {
        sourceImage = groups.original.find(img => img.imageUrl === dragData.imageId);
      } else if (dragData.imageType === 'sku') {
        const sourceSkuGroup = groups.skus.find(sku => sku.skuIndex === dragData.skuIndex);
        sourceImage = sourceSkuGroup?.images.find(img => img.imageUrl === dragData.imageId);
      } else if (dragData.imageType === 'scene') {
        sourceImage = groups.scenes.find(img => img.imageUrl === dragData.imageId);
      }

      if (!sourceImage) {
        console.error('❌ [insertImageInState] 找不到源图片:', dragData.imageId);
        return;
      }

      // 获取目标数组
      let targetArray;

      if (targetType === 'original') {
        targetArray = groups.original;
      } else if (targetType === 'sku') {
        const targetSkuGroup = groups.skus.find(sku => sku.skuIndex === targetSkuIndex);
        if (targetSkuGroup) {
          targetArray = targetSkuGroup.images;
        }
      } else if (targetType === 'scene') {
        targetArray = groups.scenes;
      }

      if (!targetArray) {
        console.error('❌ [insertImageInState] 找不到目标数组:', { targetType, targetSkuIndex });
        return;
      }

      // 检查是否已存在相同图片
      const existingImage = targetArray.find(img => img.imageUrl === dragData.imageId);
      if (existingImage) {
        console.log('ℹ️ [insertImageInState] 目标位置已存在相同图片，跳过插入');
        return;
      }

      console.log(`🔄 [insertImageInState] 执行本地跨类型插入: ${dragData.imageType} -> ${targetType}, 位置: ${targetIndex}`);

      // 创建新的图片引用对象
      const newImageRef = {
        ...sourceImage, // 复制所有属性
        id: sourceImage.imageUrl, // 保持相同的ID以复用本地文件
        type: targetType, // 设置新的类型
        skuIndex: targetType === 'sku' ? targetSkuIndex : undefined,
        // 重置状态相关字段
        status: sourceImage.hasLocal ? 'pending_edit' : 'not_downloaded',
        index: targetIndex, // 设置插入位置
        modifiedPath: undefined,
        modifiedTimestamp: undefined,
        // 保持文件相关字段
        localPath: sourceImage.localPath,
        hasLocal: sourceImage.hasLocal,
        localStatus: sourceImage.hasLocal ? 'pending_edit' : 'not_downloaded',
        isCompleted: false // 插入的图片从待编辑状态开始
      };

      // 在目标位置插入新图片引用
      targetArray.splice(targetIndex, 0, newImageRef);

      // 重新计算目标数组的索引
      targetArray.forEach((img, index) => {
        img.index = index;
      });
    });
  }, [updateImageGroupsLocally]);

  /**
   * 在状态中添加新图片 - 避免全量刷新
   */
  const addImagesToState = useCallback((imageType, skuIndex, newImages) => {
    updateImageGroupsLocally(groups => {
      let targetArray;

      // 获取目标数组
      if (imageType === 'original') {
        targetArray = groups.original;
      } else if (imageType === 'sku') {
        const targetSkuGroup = groups.skus.find(sku => sku.skuIndex === skuIndex);
        if (targetSkuGroup) {
          targetArray = targetSkuGroup.images;
        }
      } else if (imageType === 'scene') {
        targetArray = groups.scenes;
      }

      if (!targetArray) {
        console.error('❌ [addImagesToState] 找不到目标数组:', { imageType, skuIndex });
        return;
      }

      console.log(`🔄 [addImagesToState] 在状态中添加 ${newImages.length} 张图片到 ${imageType}`);

      // 处理每个新图片
      newImages.forEach((imageData, i) => {
        const newIndex = targetArray.length + i;

        // 创建新图片对象
        const newImageItem = {
          ...imageData,
          id: imageData.imageUrl || `${currentProduct.applyCode}_${imageType}_${newIndex}`,
          type: imageType,
          index: newIndex,
          skuIndex: imageType === 'sku' ? skuIndex : undefined,
          // 设置状态
          localStatus: 'pending_edit',
          hasLocal: true,
          isCompleted: false,
          status: 'pending_edit'
        };

        targetArray.push(newImageItem);
      });

      // 重新计算所有索引
      targetArray.forEach((img, index) => {
        img.index = index;
      });
    });
  }, [updateImageGroupsLocally, currentProduct.applyCode]);

  /**
   * 从状态中移除图片 - 避免全量刷新
   */
  const removeImageFromState = useCallback((imageToDelete) => {
    updateImageGroupsLocally(groups => {
      let targetArray;

      // 获取目标数组
      if (imageToDelete.type === 'original') {
        targetArray = groups.original;
      } else if (imageToDelete.type === 'sku') {
        const targetSkuGroup = groups.skus.find(sku => sku.skuIndex === imageToDelete.skuIndex);
        if (targetSkuGroup) {
          targetArray = targetSkuGroup.images;
        }
      } else if (imageToDelete.type === 'scene') {
        targetArray = groups.scenes;
      }

      if (!targetArray) {
        console.error(`❌ [removeImageFromState] 找不到目标数组: ${imageToDelete.type}, skuIndex: ${imageToDelete.skuIndex}`);
        return;
      }

      // 通过索引删除图片
      if (imageToDelete.index >= 0 && imageToDelete.index < targetArray.length) {
        targetArray.splice(imageToDelete.index, 1);

        // 重新计算索引
        targetArray.forEach((img, index) => {
          img.index = index;
        });

        console.log(`✅ [removeImageFromState] 图片已从状态中移除: ${imageToDelete.imageUrl}`);
      } else {
        console.error(`❌ [removeImageFromState] 无效的图片索引: ${imageToDelete.index}, 数组长度: ${targetArray.length}`);
      }
    });
  }, [updateImageGroupsLocally]);

  /**
   * 更新单个图片状态 - 避免全量刷新
   */
  const updateImageStatusInState = useCallback((imageId, newStatus) => {
    updateImageGroupsLocally(groups => {
      let imageFound = false;

      // 在原始图片中查找并更新
      if (groups.original) {
        const imageIndex = groups.original.findIndex(img =>
          img.imageUrl === imageId || img.id === imageId
        );
        if (imageIndex >= 0) {
          groups.original[imageIndex].localStatus = newStatus;
          groups.original[imageIndex].status = newStatus;
          if (newStatus === 'completed') {
            groups.original[imageIndex].isCompleted = true;
          } else {
            groups.original[imageIndex].isCompleted = false;
          }
          imageFound = true;
          console.log(`✅ [updateImageStatusInState] 原始图片状态已更新: ${imageId} → ${newStatus}`);
        }
      }

      // 在SKU图片中查找并更新
      if (!imageFound && groups.skus) {
        groups.skus.forEach(sku => {
          if (sku.images) {
            const imageIndex = sku.images.findIndex(img =>
              img.imageUrl === imageId || img.id === imageId
            );
            if (imageIndex >= 0) {
              sku.images[imageIndex].localStatus = newStatus;
              sku.images[imageIndex].status = newStatus;
              if (newStatus === 'completed') {
                sku.images[imageIndex].isCompleted = true;
              } else {
                sku.images[imageIndex].isCompleted = false;
              }
              imageFound = true;
              console.log(`✅ [updateImageStatusInState] SKU图片状态已更新: ${imageId} → ${newStatus}`);
            }
          }
        });
      }

      // 在场景图片中查找并更新
      if (!imageFound && groups.scenes) {
        const imageIndex = groups.scenes.findIndex(img =>
          img.imageUrl === imageId || img.id === imageId
        );
        if (imageIndex >= 0) {
          groups.scenes[imageIndex].localStatus = newStatus;
          groups.scenes[imageIndex].status = newStatus;
          if (newStatus === 'completed') {
            groups.scenes[imageIndex].isCompleted = true;
          } else {
            groups.scenes[imageIndex].isCompleted = false;
          }
          imageFound = true;
          console.log(`✅ [updateImageStatusInState] 场景图片状态已更新: ${imageId} → ${newStatus}`);
        }
      }

      if (!imageFound) {
        console.error(`❌ [updateImageStatusInState] 找不到图片: ${imageId}`);
      }
    });
  }, [updateImageGroupsLocally]);

  /**
   * 图片重排序核心逻辑 - 性能优化版本
   */
  const reorderImages = async (dragData, targetIndex, targetType, targetSkuIndex, insertPosition) => {
    try {
      console.log(`🚀 [reorderImages] 开始优化排序: ${dragData.imageId}`);

      // 先在本地状态中执行排序，提供即时视觉反馈
      reorderImagesInState(dragData, targetIndex, targetType, targetSkuIndex, insertPosition);

      // 异步同步到LocalImageManager（不阻塞UI）
      try {
        const result = await localImageManager.reorderImageByInsert(
          currentProduct.applyCode,
          targetType,
          targetSkuIndex,
          dragData.imageId,
          targetIndex,
          insertPosition
        );

        if (result.success) {
          console.log(`✅ [reorderImages] 数据同步成功`);
        } else {
          console.warn('⚠️ [reorderImages] 数据同步失败，但UI已更新');
        }
      } catch (syncError) {
        console.error('❌ [reorderImages] 数据同步失败:', syncError);
        // 数据同步失败时，可以选择回滚UI状态或显示警告
        // 这里暂时只记录错误，保持UI更新
      }

      console.log(`🎉 [reorderImages] 排序完成（优化版本）`);

    } catch (error) {
      console.error('❌ [reorderImages] 排序失败:', error);
      throw error;
    }
  };

  /**
   * 检查是否是当前产品的图片
   */
  const checkIfCurrentProductImage = useCallback(async (imageId) => {
    try {
      // 在当前图片组中查找
      const allCurrentImages = [
        ...imageGroups.original,
        ...imageGroups.skus.flatMap(sku => sku.images),
        ...imageGroups.scenes
      ];

      const found = allCurrentImages.some(img =>
        img.id === imageId || img.imageUrl === imageId
      );

      if (found) {
        console.log(`✅ [checkIfCurrentProductImage] 找到匹配图片: ${imageId}`);
        return true;
      }

      // 如果直接查找失败，尝试通过LocalImageManager检查
      await localImageManager.initialize();
      const imageInfo = localImageManager.getImageInfo(imageId);

      if (imageInfo) {
        // 检查图片所属产品是否匹配
        const productMatch = localImageManager.findProductByApplyCode(currentProduct.applyCode);
        if (productMatch) {
          console.log(`🔍 [checkIfCurrentProductImage] 通过LocalImageManager确认图片属于当前产品: ${imageId}`);
          return true;
        }
      }

      console.log(`❌ [checkIfCurrentProductImage] 图片不属于当前产品: ${imageId}`);
      return false;
    } catch (error) {
      console.error('检查图片所属失败:', error);
      return false;
    }
  }, [imageGroups, currentProduct.applyCode]);

  /**
   * 处理图片文件更新（刷新显示）
   */
  const handleImageFileUpdated = useCallback(async (imageId) => {
    try {
      console.log(`🔄 [handleImageFileUpdated] 开始处理图片文件更新: ${imageId}`);

      // 刷新图片显示URL
      const newDisplayUrl = await localImageManager.refreshImageDisplayUrl(imageId);

      if (newDisplayUrl) {
        // 触发组件重新渲染 - 通过重新初始化图片数据
        await initializeImageData();
        console.log(`✅ [handleImageFileUpdated] 图片显示已更新: ${imageId}`);
      } else {
        console.warn(`⚠️ [handleImageFileUpdated] 刷新图片显示失败: ${imageId}`);
      }
    } catch (error) {
      console.error(`❌ [handleImageFileUpdated] 处理图片更新失败:`, error);
    }
  }, []);

  /**
   * 手动切换图片的完成状态 - 性能优化版本
   */
  const handleToggleImageCompleted = async (imageId) => {
    try {
      setError(null);

      // 获取当前图片状态以提供更好的用户反馈
      const imageInfo = localImageManager.getImageInfo(imageId);
      const currentStatus = imageInfo?.status || 'unknown';
      const willComplete = currentStatus !== 'completed';
      const newStatus = willComplete ? 'completed' : 'editing';

      console.log(`🔄 [手动状态切换] ${willComplete ? '标记完成' : '取消完成'}: ${imageId}`);

      // 先在状态中更新，提供即时视觉反馈
      updateImageStatusInState(imageId, newStatus);

      // 同时更新completedImages状态用于UI显示
      if (willComplete) {
        setCompletedImages(prev => new Set([...prev, imageId]));
      } else {
        setCompletedImages(prev => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
      }

      // 异步同步到LocalImageManager（不阻塞UI）
      try {
        const result = await localImageManager.toggleImageCompletedStatus(imageId);

        if (result.success) {
          console.log(`✅ [手动状态切换] 数据同步成功: ${imageId} → ${result.newStatus}`);

          // 确保状态一致性 - 如果服务端返回的状态与预期不同，更新UI
          if (result.newStatus !== newStatus) {
            console.log(`🔄 [手动状态切换] 服务端状态不同，更新UI: ${result.newStatus}`);
            updateImageStatusInState(imageId, result.newStatus);

            // 同步更新completedImages状态
            if (result.newStatus === 'completed') {
              setCompletedImages(prev => new Set([...prev, imageId]));
            } else {
              setCompletedImages(prev => {
                const next = new Set(prev);
                next.delete(imageId);
                return next;
              });
            }
          }

          // 显示成功提示
          const successMessage = result.newStatus === 'completed' ? '图片已标记为完成' : '已取消完成状态';
          console.log(`🎉 [用户操作] ${successMessage}: ${imageId}`);

        } else {
          console.error('❌ [手动状态切换] 数据同步失败，需要重新加载数据');
          setError('状态切换失败，正在重新加载数据');
          // 数据同步失败时重新加载以保持一致性
          await initializeImageData();
        }
      } catch (syncError) {
        console.error('❌ [手动状态切换] 数据同步失败:', syncError);
        setError(`状态切换失败: ${syncError.message}`);
        // 数据同步失败时重新加载以保持一致性
        await initializeImageData();
      }

    } catch (error) {
      console.error('❌ [手动状态切换] 操作失败:', error);
      setError(`状态切换失败: ${error.message}`);
    }
  };

  /**
   * 单击图片打开预览模式
   */
  const handleImageClick = useCallback((imageId, imageUrl) => {
    const imageIndex = getAllImages.findIndex(img => img.id === imageId);
    if (imageIndex === -1) {
      console.warn('⚠️ [handleImageClick] 未找到图片索引:', imageId);
      return;
    }

    console.log(`🖼️ [handleImageClick] 打开图片预览: ${imageId} (索引: ${imageIndex})`);

    setPreviewMode({
      isOpen: true,
      currentImageId: imageId,
      currentImageIndex: imageIndex,
      imageList: getAllImages
    });
  }, [getAllImages]);


  /**
   * 预览模式导航 - 切换上一张/下一张
   */
  const handlePreviewNavigation = useCallback((direction) => {
    const { currentImageIndex, imageList } = previewMode;
    let newIndex;

    if (direction === 'prev') {
      newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : imageList.length - 1;
    } else {
      newIndex = currentImageIndex < imageList.length - 1 ? currentImageIndex + 1 : 0;
    }

    const newImage = imageList[newIndex];
    console.log(`🔄 [handlePreviewNavigation] 切换到 ${direction} 图片:`, newImage.displayName);

    setPreviewMode(prev => ({
      ...prev,
      currentImageId: newImage.id,
      currentImageIndex: newIndex
    }));
  }, [previewMode]);

  /**
   * 关闭预览模式
   */
  const handleClosePreview = useCallback(() => {
    console.log('❌ [handleClosePreview] 关闭图片预览');
    setPreviewMode({
      isOpen: false,
      currentImageId: null,
      currentImageIndex: 0,
      imageList: []
    });
  }, []);

  // 键盘事件处理 - 预览模式导航
  useEffect(() => {
    if (!previewMode.isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClosePreview();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePreviewNavigation('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          handlePreviewNavigation('next');
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewMode.isOpen, handleClosePreview, handlePreviewNavigation]);

  // 组件清理 - 防止内存泄漏
  useEffect(() => {
    return () => {
      // 清理拖拽定时器
      if (dragEnterTimeoutRef.current) {
        clearTimeout(dragEnterTimeoutRef.current);
        dragEnterTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * 双击在PS中打开图片
   */
  const handleOpenImageInPS = async (imageId, imageUrl) => {
    try {
      setOpeningImageId(imageId);
      setError(null);

      console.log('🚀 [handleOpenImageInPS] 开始在PS中打开图片:', { imageId, imageUrl });

      // 检查图片当前状态，如果是已完成状态，重置为编辑中
      const imageInfo = localImageManager.getImageInfo(imageId) || localImageManager.getImageInfo(imageUrl);
      if (imageInfo && imageInfo.status === 'completed') {
        console.log('🔄 [handleOpenImageInPS] 图片为已完成状态，重置为编辑中');
        await localImageManager.resetImageToEditing(imageId);
        // 刷新组件状态
        await initializeImageData();
      }

      // 构建图片信息对象
      const psImageInfo = {
        imageId: imageId,
        url: imageUrl,
        type: 'smart' // 使用智能获取模式，优先本地缓存
      };

      // 使用directOpen模式直接在PS中打开图片
      const documentId = await placeImageInPS(psImageInfo, { directOpen: true });

      console.log('✅ [handleOpenImageInPS] 图片在PS中打开成功，文档ID:', documentId);

      // 立即更新UI状态为"编辑中"
      console.log('🔄 [handleOpenImageInPS] 更新UI状态为编辑中:', imageId);

      // 1. 更新编辑中状态集合
      setEditingImages(prev => new Set([...prev, imageId]));

      // 2. 更新图片组状态，更新localStatus字段
      updateImageStatusInState(imageId, 'editing');

      console.log('✅ [handleOpenImageInPS] UI状态已更新为编辑中');

    } catch (error) {
      console.error('❌ [handleOpenImageInPS] 在PS中打开图片失败:', error);
      setError(`在PS中打开图片失败: ${error.message}`);
    } finally {
      setOpeningImageId(null);
    }
  };

  /**
   * 智能鼠标点击检测 - 左键预览，右键在PS中打开
   */
  const handleSmartMouseClick = useCallback((event, imageId, imageUrl) => {
    // 关键：检查是否正在拖拽，避免与拖拽排序冲突
    if (dragState.isDragging) {
      console.log(`🚫 [handleSmartMouseClick] 正在拖拽中，忽略点击事件 (imageId: ${imageId})`);
      return;
    }

    // 调试：检查事件对象
    console.log(`🐛 [DEBUG] 事件类型: ${event.type}, button: ${event.button}, which: ${event.which}, buttons: ${event.buttons}`);

    // 阻止默认行为
    event.preventDefault();
    event.stopPropagation();

    // 根据事件类型判断操作
    if (event.type === 'click') {
      // 左键点击 - 打开预览
      console.log(`👈 [handleSmartMouseClick] 左键预览: ${imageId}`);
      handleImageClick(imageId, imageUrl);

    } else if (event.type === 'contextmenu') {
      // 右键上下文菜单 - 在PS中打开
      console.log(`👉 [handleSmartMouseClick] 右键在PS中打开: ${imageId}`);
      handleOpenImageInPS(imageId, imageUrl);

    } else {
      // 其他事件类型 - 忽略
      console.log(`🚫 [handleSmartMouseClick] 忽略事件类型: ${event.type}`);
      return;
    }
  }, [dragState.isDragging, handleImageClick, handleOpenImageInPS]);

  /**
   * 执行删除图片的核心逻辑 - 性能优化版本
   */
  const executeDelete = async (imageToDelete) => {
    try {
      setError(null);
      console.log('🗑️ [executeDelete] 开始优化删除图片:', {
        imageUrl: imageToDelete.imageUrl,
        type: imageToDelete.type,
        index: imageToDelete.index,
        skuIndex: imageToDelete.skuIndex
      });

      // 先从本地状态中移除图片，提供即时视觉反馈
      removeImageFromState(imageToDelete);

      // 异步同步到LocalImageManager（不阻塞UI）
      try {
        const success = await localImageManager.deleteImageByIndex(
          currentProduct.applyCode,
          imageToDelete.type,
          imageToDelete.index,
          imageToDelete.skuIndex
        );

        if (success) {
          console.log('✅ [executeDelete] 数据同步成功');
          // 通知父组件数据已更新
          onUpdate?.(currentProduct);
        } else {
          console.error('❌ [executeDelete] 数据删除失败，需要重新加载数据');
          setError('删除图片失败，正在重新加载数据');
          // 如果数据层删除失败，重新初始化数据以保持一致性
          await initializeImageData();
        }
      } catch (syncError) {
        console.error('❌ [executeDelete] 数据同步失败:', syncError);
        setError(`删除图片失败: ${syncError.message}`);
        // 数据同步失败时重新加载以保持一致性
        await initializeImageData();
      }

    } catch (error) {
      console.error('❌ [executeDelete] 删除图片失败:', error);
      setError(`删除图片失败: ${error.message}`);
    }
  };

  /**
   * 处理确认对话框的删除操作
   */
  const handleExecuteDelete = async () => {
    if (!deletingImage) return;

    try {
      // 如果用户勾选了"不再询问"，保存设置
      if (dontAskAgain) {
        console.log('💾 [handleExecuteDelete] 用户选择不再询问，保存设置');
        setSkipDeleteConfirmation(true);
        await saveDeleteSettings(true);
      }

      // 执行删除操作
      await executeDelete(deletingImage);

    } catch (error) {
      console.error('❌ [handleExecuteDelete] 删除操作失败:', error);
      setError(`删除操作失败: ${error.message}`);
    } finally {
      setDeletingImage(null);
    }
  };


  if (loading) {
    return (
      <div className="product-detail">
        <div className="loading-container">
          <div className="loading-spinner">⏳</div>
          <div className="loading-text">加载产品数据中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`product-detail ${dragState.isDragging ? 'dragging' : ''} layout-${imageLayout}`}>
      {/* 头部区域 */}
      <div className="detail-header">
        <div className="header-left">
          <button className="back-btn" onClick={handleClose}>
            返回列表
          </button>
          <div className="product-info">
            <h1 className="product-title">{currentProduct.productName}</h1>
            <div className="product-code">编号: {currentProduct.applyCode}</div>
          </div>
        </div>
        <div className="header-right">
          <div className="layout-selector">
            <div
              className={`layout-btn ${imageLayout === 'small' ? 'active' : ''}`}
              onClick={() => setImageLayout('small')}
              title="小尺寸布局 (100px)"
              role="button"
              tabIndex="0"
            >
              小
            </div>
            <div
              className={`layout-btn ${imageLayout === 'medium' ? 'active' : ''}`}
              onClick={() => setImageLayout('medium')}
              title="中尺寸布局 (140px)"
              role="button"
              tabIndex="0"
            >
              中
            </div>
            <div
              className={`layout-btn ${imageLayout === 'large' ? 'active' : ''}`}
              onClick={() => setImageLayout('large')}
              title="大尺寸布局 (180px)"
              role="button"
              tabIndex="0"
            >
              大
            </div>
          </div>
          <button
            className={`sync-btn ${isSyncing ? 'syncing' : ''} ${getSyncButtonDisabled() ? 'disabled' : ''}`}
            onClick={handleBatchSyncToPS}
            disabled={getSyncButtonDisabled()}
            title={getSyncButtonDisabled() && !isSyncing ? '当前产品没有待编辑状态的图片' : ''}
          >
            {getSyncButtonText()}
          </button>
          <button
            className={`submit-btn ${isSubmitting ? 'submitting' : ''}`}
            onClick={handleSubmitReview}
            disabled={isSubmitting}
          >
            {isSubmitting ? '提交中...' : '提交审核'}
          </button>
        </div>
      </div>

      {/* 工作流程指引 */}
      {showWorkflowGuide && (
        <div className="workflow-guide">
          <div className="guide-header">
            <h3>三状态工作流程说明</h3>
            <button className="guide-close" onClick={() => setShowWorkflowGuide(false)}>
              ×
            </button>
          </div>
          <div className="guide-content">
            <div className="workflow-steps">
              <div className="workflow-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>🔗 待编辑状态</h4>
                  <p>图片已下载但尚未在PS中打开编辑</p>
                  <div className="step-action">右键图片在PS中打开</div>
                </div>
              </div>
              <div className="workflow-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>✏️ 编辑中状态</h4>
                  <p>图片正在或已经在PS中编辑过</p>
                  <div className="step-action">在PS中编辑并保存图片</div>
                </div>
              </div>
              <div className="workflow-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>🎯 已完成状态</h4>
                  <p>图片编辑完成，关闭PS文档时自动标记</p>
                  <div className="step-action">右键可重新编辑</div>
                </div>
              </div>
            </div>
            <div className="guide-tips">
              <h4>💡 使用技巧</h4>
              <ul>
                <li>🖱️ 左键点击：打开图片预览模式</li>
                <li>🖱️ 右键点击：直接在PS中打开图片</li>
                <li>已完成的图片右键会重置为编辑中状态</li>
                <li>可手动点击"标记完成"按钮切换状态</li>
                <li>绿色边框表示已完成，橙色表示编辑中</li>
                <li>系统会自动检测PS文件修改并同步状态</li>
              </ul>
            </div>
          </div>
        </div>
      )}


      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <span className="error-text">{error}</span>
          <button className="error-close" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deletingImage && (
        <div className="error-banner" style={{ background: '#fff3cd', borderColor: '#ffeaa7', color: '#856404' }}>
          <div style={{ flex: 1 }}>
            <div className="error-text" style={{ marginBottom: '6px' }}>
              确定要删除这张图片吗？（仅从列表中移除，本地文件保留）
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                id="dontAskAgain"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                style={{
                  width: '12px',
                  height: '12px',
                  cursor: 'pointer'
                }}
              />
              <label
                htmlFor="dontAskAgain"
                style={{
                  fontSize: '10px',
                  color: '#856404',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                不再询问，直接删除
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                border: '1px solid #856404',
                borderRadius: '3px',
                background: '#dc3545',
                color: 'white',
                cursor: 'pointer'
              }}
              onClick={handleExecuteDelete}
            >
              确定删除
            </button>
            <button
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                border: '1px solid #856404',
                borderRadius: '3px',
                background: '#6c757d',
                color: 'white',
                cursor: 'pointer'
              }}
              onClick={handleCancelDelete}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 批量上传进度条 */}
      {uploadProgress && (
        <div className="upload-progress-container">
          <div className="upload-progress-header">
            <span className="upload-progress-text">
              {uploadProgress.completed >= uploadProgress.total ? '上传完成' : '上传中'} {uploadProgress.completed || 0}/{uploadProgress.total || 0}
              {uploadProgress.running > 0 && ` (${uploadProgress.running}个并发)`}
              {uploadProgress.failed > 0 && ` | ❌${uploadProgress.failed}`}
            </span>
            <div className="upload-progress-percent">
              {uploadProgress.total > 0 ? Math.round(((uploadProgress.completed || 0) / uploadProgress.total) * 100) : 0}%
            </div>
          </div>
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{
                width: uploadProgress.total > 0 ? `${((uploadProgress.completed || 0) / uploadProgress.total) * 100}%` : '0%'
              }}
            />
          </div>
        </div>
      )}

      {/* 内容区域 - 合并所有图片类型 */}
      <div className="tab-content" ref={contentRef}>
        {/* 原始图片 */}
        {imageGroups.original.length > 0 && (
          <div className="original-images">
            <div className="section-header">
              <h3>原始图片 ({imageGroups.original.length})</h3>
            </div>
            <div className="image-grid">
              {virtualizedImageGroups.original.map((image, index) => {
                // 使用预计算的拖拽状态，支持跨类型拖拽样式
                const dragOverClass = image.isHovered
                  ? (dragState.hoveredDropTarget.isCrossTypeInsertion
                      ? `cross-type-drag-over-${dragState.hoveredDropTarget.position}`
                      : `drag-over-${dragState.hoveredDropTarget.position}`)
                  : '';

                // 为拖拽源添加跨类型拖拽样式
                const crossTypeDragClass = (dragState.isDragging &&
                  dragState.draggedImageId === image.id &&
                  dragState.draggedImageType === 'original') ? 'cross-type-dragging' : '';

                return (
                  <div
                    key={image.id}
                    className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass} ${crossTypeDragClass}`}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, image.id, 'original')}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, index, 'original')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index, 'original')}
                  >
                    {/* 图片上方的状态栏 */}
                    <div className="image-header">
                      <div className={`status-indicator-top ${image.localStatus}`}>
                        {getStatusText(image.localStatus)}
                      </div>
                      <div className="image-actions-top">
                        <div
                          className={`top-complete-btn ${image.isCompleted || completedImages.has(image.id) ? 'completed' : ''}`}
                          onClick={() => handleToggleImageCompleted(image.id)}
                          title={image.isCompleted || completedImages.has(image.id) ? '点击取消完成' : '点击标记完成'}
                          role="button"
                          tabIndex="0"
                        >
                          {image.isCompleted || completedImages.has(image.id) ? '完成' : '√'}
                        </div>
                        <div
                          className="top-delete-btn"
                          onClick={() => handleConfirmDelete(image)}
                          title="删除图片"
                          role="button"
                          tabIndex="0"
                        >
                          x
                        </div>
                      </div>
                    </div>
                    <div className="image-preview">
                      <LocalImage
                        imageUrl={image.imageUrl}
                        alt={`原始图片 ${index + 1}`}
                        hasLocal={image.hasLocal}
                        needsRefresh={refreshingImages.has(image.id)}
                        onRefreshComplete={() => handleImageRefreshComplete(image.id)}
                        onClick={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                        onContextMenu={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                        isOpening={openingImageId === image.id}
                        isSyncing={syncingImages.has(image.id)}
                        isRecentlyUpdated={recentlyUpdatedImages.has(image.id)}
                        isCompleted={image.isCompleted || completedImages.has(image.id)}
                        imageStatus={image.localStatus}
                      />
                    </div>
                  </div>
                );
              })}
              {/* 添加图片按钮 */}
              <div className="add-image-btn in-grid" onClick={() => handleAddImage('original')} role="button" tabIndex="0">
                + 添加图片
                <div className="format-hint">(支持PNG、JPG格式)</div>
              </div>
            </div>
          </div>
        )}

        {/* 颜色款式图片 */}
        {virtualizedImageGroups.skus.map((sku, skuIndex) => (
          sku.images.length > 0 && (
            <div key={sku.skuIndex || skuIndex} className="sku-group">
              <div className="sku-header">
                <h3>{sku.skuTitle} ({sku.images.length})</h3>
              </div>
              <div className="image-grid">
                {sku.images.map((image, imgIndex) => {
                  // 使用预计算的拖拽状态，支持跨类型拖拽样式
                  const dragOverClass = image.isHovered
                    ? (dragState.hoveredDropTarget.isCrossTypeInsertion
                        ? `cross-type-drag-over-${dragState.hoveredDropTarget.position}`
                        : `drag-over-${dragState.hoveredDropTarget.position}`)
                    : '';

                  // SKU图片不作为跨类型拖拽源，所以crossTypeDragClass留空
                  const crossTypeDragClass = '';

                  return (
                    <div
                      key={image.id}
                      className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass} ${crossTypeDragClass}`}
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, image.id, 'sku', sku.skuIndex || skuIndex)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, imgIndex, 'sku', sku.skuIndex || skuIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, imgIndex, 'sku', sku.skuIndex || skuIndex)}
                    >
                      {/* 图片上方的状态栏 */}
                      <div className="image-header">
                        <div className={`status-indicator-top ${image.localStatus}`}>
                          {getStatusText(image.localStatus)}
                        </div>
                        <div className="image-actions-top">
                          <div
                            className={`top-complete-btn ${image.isCompleted || completedImages.has(image.id) ? 'completed' : ''}`}
                            onClick={() => handleToggleImageCompleted(image.id)}
                            title={image.isCompleted || completedImages.has(image.id) ? '点击取消完成' : '点击标记完成'}
                            role="button"
                            tabIndex="0"
                          >
                            {image.isCompleted || completedImages.has(image.id) ? '完成' : '√'}
                          </div>
                          <div
                            className="top-delete-btn"
                            onClick={() => handleConfirmDelete(image)}
                            title="删除图片"
                            role="button"
                            tabIndex="0"
                          >
                            ×
                          </div>
                        </div>
                      </div>
                      <div className="image-preview">
                        <LocalImage
                          imageUrl={image.imageUrl}
                          alt={`${sku.skuTitle} 图片 ${imgIndex + 1}`}
                          hasLocal={image.hasLocal}
                          needsRefresh={refreshingImages.has(image.id)}
                          onRefreshComplete={() => handleImageRefreshComplete(image.id)}
                          onClick={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                          onContextMenu={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                          isOpening={openingImageId === image.id}
                          isSyncing={syncingImages.has(image.id)}
                          isRecentlyUpdated={recentlyUpdatedImages.has(image.id)}
                          isCompleted={image.isCompleted || completedImages.has(image.id)}
                          imageStatus={image.localStatus}
                        />
                      </div>
                    </div>
                  );
                })}
                {/* 添加图片按钮 */}
                <div className="add-image-btn in-grid" onClick={() => handleAddImage('sku', sku.skuIndex || skuIndex)} role="button" tabIndex="0">
                  + 添加图片
                <div className="format-hint">(支持PNG、JPG格式)</div>
                </div>
              </div>
            </div>
          )
        ))}

        {/* 场景图片 */}
        {virtualizedImageGroups.scenes.length > 0 && (
          <div className="scene-images">
            <div className="section-header">
              <h3>场景图片 ({virtualizedImageGroups.scenes.length})</h3>
            </div>
            <div className="image-grid">
              {virtualizedImageGroups.scenes.map((image, index) => {
                // 使用预计算的拖拽状态，支持跨类型拖拽样式
                const dragOverClass = image.isHovered
                  ? (dragState.hoveredDropTarget.isCrossTypeInsertion
                      ? `cross-type-drag-over-${dragState.hoveredDropTarget.position}`
                      : `drag-over-${dragState.hoveredDropTarget.position}`)
                  : '';

                // 场景图片不作为跨类型拖拽源，所以crossTypeDragClass留空
                const crossTypeDragClass = '';

                return (
                  <div
                    key={image.id}
                    className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass} ${crossTypeDragClass}`}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, image.id, 'scene')}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, index, 'scene')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index, 'scene')}
                  >
                    {/* 图片上方的状态栏 */}
                    <div className="image-header">
                      <div className={`status-indicator-top ${image.localStatus}`}>
                        {getStatusText(image.localStatus)}
                      </div>
                      <div className="image-actions-top">
                        <div
                          className={`top-complete-btn ${image.isCompleted || completedImages.has(image.id) ? 'completed' : ''}`}
                          onClick={() => handleToggleImageCompleted(image.id)}
                          title={image.isCompleted || completedImages.has(image.id) ? '点击取消完成' : '点击标记完成'}
                          role="button"
                          tabIndex="0"
                        >
                          {image.isCompleted || completedImages.has(image.id) ? '完成' : '√'}
                        </div>
                        <button
                          className="top-delete-btn"
                          onClick={() => handleConfirmDelete(image)}
                          title="删除图片"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="image-preview">
                      <LocalImage
                        imageUrl={image.imageUrl}
                        alt={`场景图片 ${index + 1}`}
                        hasLocal={image.hasLocal}
                        needsRefresh={refreshingImages.has(image.id)}
                        onRefreshComplete={() => handleImageRefreshComplete(image.id)}
                        onClick={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                        onContextMenu={(e) => handleSmartMouseClick(e, image.id, image.imageUrl)}
                        isOpening={openingImageId === image.id}
                        isSyncing={syncingImages.has(image.id)}
                        isRecentlyUpdated={recentlyUpdatedImages.has(image.id)}
                        isCompleted={image.isCompleted || completedImages.has(image.id)}
                        imageStatus={image.localStatus}
                      />
                    </div>
                  </div>
                );
              })}
              {/* 添加图片按钮 */}
              <div className="add-image-btn in-grid" onClick={() => handleAddImage('scene')} role="button" tabIndex="0">
                + 添加图片
                <div className="format-hint">(支持PNG、JPG格式)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 全屏预览模式 */}
      {previewMode.isOpen && (
        <div className="image-preview-modal">
          <div className="preview-overlay" onClick={handleClosePreview}>
            <div className="preview-content" onClick={(e) => e.stopPropagation()}>
              {/* 预览头部信息 */}
              <div className="preview-header">
                <div className="preview-info">
                  <span className="preview-title">
                    {previewMode.imageList[previewMode.currentImageIndex]?.displayName}
                  </span>
                  <span className="preview-counter">
                    {previewMode.currentImageIndex + 1} / {previewMode.imageList.length}
                  </span>
                </div>
                <button className="preview-close" onClick={handleClosePreview}>
                  ×
                </button>
              </div>

              {/* 预览图片区域 */}
              <div className="preview-image-container">
                <LocalImage
                  imageUrl={previewMode.imageList[previewMode.currentImageIndex]?.imageUrl}
                  alt={previewMode.imageList[previewMode.currentImageIndex]?.displayName}
                  hasLocal={previewMode.imageList[previewMode.currentImageIndex]?.hasLocal}
                  needsRefresh={refreshingImages.has(previewMode.imageList[previewMode.currentImageIndex]?.id)}
                  onRefreshComplete={() => handleImageRefreshComplete(previewMode.imageList[previewMode.currentImageIndex]?.id)}
                  onDoubleClick={() => {
                    const currentImage = previewMode.imageList[previewMode.currentImageIndex];
                    handleOpenImageInPS(currentImage.id, currentImage.imageUrl);
                  }}
                  isOpening={openingImageId === previewMode.currentImageId}
                  isSyncing={syncingImages.has(previewMode.currentImageId)}
                  isRecentlyUpdated={recentlyUpdatedImages.has(previewMode.currentImageId)}
                  isCompleted={previewMode.imageList[previewMode.currentImageIndex]?.isCompleted || completedImages.has(previewMode.currentImageId)}
                  imageStatus={previewMode.imageList[previewMode.currentImageIndex]?.localStatus}
                />

                {/* 导航按钮 */}
                <button
                  className="preview-nav prev"
                  onClick={() => handlePreviewNavigation('prev')}
                  disabled={previewMode.imageList.length <= 1}
                >
                  ◀
                </button>
                <button
                  className="preview-nav next"
                  onClick={() => handlePreviewNavigation('next')}
                  disabled={previewMode.imageList.length <= 1}
                >
                  ▶
                </button>
              </div>

              {/* 预览底部操作区 */}
              <div className="preview-footer">
                <div className="preview-category">
                  {previewMode.imageList[previewMode.currentImageIndex]?.categoryName}
                </div>
                <div className="preview-actions">
                  <button
                    className={`top-complete-btn ${previewMode.imageList[previewMode.currentImageIndex]?.isCompleted || completedImages.has(previewMode.currentImageId) ? 'completed' : ''}`}
                    onClick={() => handleToggleImageCompleted(previewMode.currentImageId)}
                    title={previewMode.imageList[previewMode.currentImageIndex]?.isCompleted || completedImages.has(previewMode.currentImageId) ? '点击取消完成' : '点击标记完成'}
                  >
                    {previewMode.imageList[previewMode.currentImageIndex]?.isCompleted || completedImages.has(previewMode.currentImageId) ? '已完成' : '标记完成'}
                  </button>
                  <button
                    className="open-ps-btn"
                    onClick={() => {
                      const currentImage = previewMode.imageList[previewMode.currentImageIndex];
                      handleOpenImageInPS(currentImage.id, currentImage.imageUrl);
                    }}
                    disabled={openingImageId === previewMode.currentImageId}
                  >
                    {openingImageId === previewMode.currentImageId ? (
                      <>
                        ... 正在打开...
                      </>
                    ) : (
                      '在PS中打开'
                    )}
                  </button>
                </div>
              </div>

              {/* 键盘提示 */}
              <div className="preview-shortcuts">
                <span>ESC: 关闭</span>
                <span>← →: 切换图片</span>
                <span>右键: 在PS中打开</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 获取状态文字
 */
const getStatusText = (status) => {
  switch (status) {
    case 'pending_edit':
      return '🔗 待编辑';
    case 'editing':
      return '✏️ 编辑中';
    case 'completed':
      return '🎯 已完成';
    // 向下兼容旧状态
    case 'downloaded':
      return '已下载';
    case 'modified':
      return '已修改';
    case 'synced':
      return '已同步';
    case 'local_added':
      return '本地新增';
    case 'not_downloaded':
      return '未下载';
    default:
      return '未知';
  }
};

export default ProductDetail;