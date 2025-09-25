import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import { placeImageInPS, registerPSEventListeners, unregisterPSEventListeners } from '../panels/photoshop-api.js';
import './ProductDetail.css';

/**
 * 本地图片组件 - 仅显示本地文件系统中的图片
 * 使用React.memo优化性能
 */
const LocalImage = React.memo(({ imageUrl, alt, className, hasLocal, onDoubleClick, onClick, isOpening, isSyncing, isRecentlyUpdated, isCompleted, imageStatus }) => {
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
  }, [imageUrl, hasLocal]);

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
      {isCompleted && !isOpening && !isSyncing && (
        <div className="completed-indicator">
          <div className="completed-icon">🎯</div>
          <div className="completed-text">已完成</div>
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
          🔗 待编辑 - 双击在PS中打开
        </div>
      )}
      {hasLocal && !isOpening && !isSyncing && !isRecentlyUpdated && !isCompleted && imageStatus === 'editing' && (
        <div className="double-click-hint editing">
          ✏️ 编辑中 - 双击在PS中打开
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
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);
  const [openingImageId, setOpeningImageId] = useState(null);
  const [syncingImages, setSyncingImages] = useState(new Set()); // 正在同步的图片ID集合
  const [recentlyUpdatedImages, setRecentlyUpdatedImages] = useState(new Set()); // 最近更新的图片ID集合
  const [completedImages, setCompletedImages] = useState(new Set()); // 已完成的图片ID集合
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
        // 处理PS保存事件
        if (syncResult.type === 'ps_file_saved') {
          console.log(`🎯 [PS事件监听] 接收到PS保存通知:`, syncResult);

          // 检查是否是当前产品的图片
          const isCurrentProductImage = await checkIfCurrentProductImage(syncResult.imageId);
          if (!isCurrentProductImage) {
            console.log(`ℹ️ [PS事件监听] 非当前产品图片，跳过: ${syncResult.imageId}`);
            return;
          }

          console.log(`✅ [PS事件监听] 检测到当前产品图片保存: ${syncResult.imageId}`);

          // 标记为正在同步
          setSyncingImages(prev => new Set([...prev, syncResult.imageId]));

          // 检查文件是否真的被修改
          const wasModified = await localImageManager.checkFileModification(syncResult.imageId);

          if (wasModified) {
            console.log(`🔄 [PS事件监听] 文件已修改，开始刷新显示: ${syncResult.imageId}`);

            // 刷新图片显示
            await handleImageFileUpdated(syncResult.imageId);

            // 标记为最近更新
            setRecentlyUpdatedImages(prev => new Set([...prev, syncResult.imageId]));

            // 3秒后清除"最近更新"状态
            setTimeout(() => {
              setRecentlyUpdatedImages(prev => {
                const next = new Set(prev);
                next.delete(syncResult.imageId);
                return next;
              });
            }, 3000);

            console.log(`🎉 [PS事件监听] 图片更新完成: ${syncResult.imageId}`);
          } else {
            console.log(`ℹ️ [PS事件监听] 文件未发生修改: ${syncResult.imageId}`);
          }

          // 移除同步状态
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

          // 刷新图片数据以显示最新状态
          await initializeImageData();

          console.log(`🎉 [PS事件监听] 图片已标记为完成状态: ${syncResult.imageId}`);
        }

        // 处理PS文档关闭无修改事件
        else if (syncResult.type === 'ps_document_closed_no_change') {
          console.log(`ℹ️ [PS事件监听] PS文档关闭但图片未修改: ${syncResult.imageId}`);
          // 这种情况下不需要特殊处理，只是记录日志
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
   * 获取所有待编辑状态的图片
   */
  const getAllPendingEditImages = useCallback(() => {
    const pendingImages = [];

    // 从原始图片收集待编辑状态的图片
    if (imageGroups.original) {
      imageGroups.original.forEach(img => {
        if (img.localStatus === 'pending_edit' && img.hasLocal) {
          pendingImages.push({
            ...img,
            category: 'original',
            categoryName: '原始图片',
            displayName: `原始图片 ${img.index + 1}`
          });
        }
      });
    }

    // 从SKU图片收集待编辑状态的图片
    if (imageGroups.skus) {
      imageGroups.skus.forEach((sku, skuIndex) => {
        if (sku.images) {
          sku.images.forEach((img, imgIndex) => {
            if (img.localStatus === 'pending_edit' && img.hasLocal) {
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
        if (img.localStatus === 'pending_edit' && img.hasLocal) {
          pendingImages.push({
            ...img,
            category: 'scene',
            categoryName: '场景图片',
            displayName: `场景图片 ${index + 1}`
          });
        }
      });
    }

    console.log(`🔍 [getAllPendingEditImages] 找到 ${pendingImages.length} 张待编辑图片`);
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
   * 提交审核
   */
  const handleSubmitReview = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // TODO: 实现提交逻辑
      console.log('提交审核:', currentProduct.applyCode);

      // 临时模拟提交过程
      await new Promise(resolve => setTimeout(resolve, 2000));

      onSubmit?.(currentProduct);

    } catch (error) {
      console.error('提交失败:', error);
      setError(`提交失败: ${error.message}`);
    } finally {
      setIsSubmitting(false);
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

      // 显示文件选择对话框 - 支持多文件选择
      const files = await fs.getFileForOpening({
        allowMultiple: true
      });

      if (!files || files.length === 0) {
        console.log('用户取消了文件选择');
        return;
      }

      console.log(`📁 [handleAddImage] 选择的文件: ${files.length}个, 类型: ${imageType}`);

      // 初始化进度状态
      if (files.length > 1) {
        setUploadProgress({ current: 0, total: files.length });
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
          setUploadProgress({ current, total: files.length });
        } : null
      );

      console.log(`✅ [handleAddImage] 批量添加完成:`, results);

      // 显示添加结果
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;

      if (failedCount > 0) {
        const failedFiles = results.filter(r => !r.success).map(r => r.fileName).join(', ');
        setError(`部分文件添加失败: ${failedFiles}`);
        console.warn(`⚠️ [handleAddImage] ${failedCount}个文件添加失败`);
      }

      console.log(`✅ [handleAddImage] 成功添加 ${successCount}/${files.length} 个图片`);

      // 清理进度状态
      setUploadProgress(null);

      // 刷新图片数据
      await initializeImageData();

      // 恢复滚动位置
      if (savedScrollPosition > 0 && contentRef.current) {
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = savedScrollPosition;
            console.log('✅ [handleAddImage] 滚动位置已恢复:', savedScrollPosition);
          }
        }, 100);
      }

      console.log(`🔄 [handleAddImage] 图片列表已刷新`);

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

    // 只允许同类型内部排序
    if (dragState.draggedImageType !== targetType || dragState.draggedSkuIndex !== targetSkuIndex) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    // 清除之前的定时器
    if (dragEnterTimeoutRef.current) {
      clearTimeout(dragEnterTimeoutRef.current);
    }

    // 防抖处理，减少频繁的状态更新
    dragEnterTimeoutRef.current = setTimeout(() => {
      // 使用UXP兼容的位置计算方式
      const elementWidth = e.currentTarget.offsetWidth || 200;
      const rect = { left: e.currentTarget.offsetLeft, width: elementWidth };
      const midPoint = rect.left + rect.width / 2;
      const insertPosition = e.clientX < midPoint ? 'before' : 'after';

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
              position: insertPosition
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

    // 只有当真正离开目标元素时才清除hover状态
    if (!e.currentTarget.contains(e.relatedTarget)) {
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

      // 只允许同类型内部排序
      if (dragData.imageType !== targetType || dragData.skuIndex !== targetSkuIndex) {
        console.warn('⚠️ [handleDrop] 不支持跨类型拖拽排序');
        return;
      }

      // 计算插入位置
      const rect = e.currentTarget.getBoundingClientRect();
      const midPoint = rect.left + rect.width / 2;
      const insertPosition = e.clientX < midPoint ? 'before' : 'after';

      console.log(`📍 [handleDrop] 放置图片: ${dragData.imageId} 到位置 ${targetIndex} (${insertPosition})`);

      // 执行重排序
      await reorderImages(dragData, targetIndex, targetType, targetSkuIndex, insertPosition);

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
   * 图片重排序核心逻辑
   */
  const reorderImages = async (dragData, targetIndex, targetType, targetSkuIndex, insertPosition) => {
    try {
      // 保存滚动位置
      let savedScrollPosition = 0;
      if (contentRef.current) {
        savedScrollPosition = contentRef.current.scrollTop;
        console.log('💾 [reorderImages] 保存滚动位置:', savedScrollPosition);
      }

      // 调用LocalImageManager进行重排序
      const result = await localImageManager.reorderImageByInsert(
        currentProduct.applyCode,
        targetType,
        targetSkuIndex,
        dragData.imageId,
        targetIndex,
        insertPosition
      );

      if (result.success) {
        // 刷新图片数据
        await initializeImageData();

        // 恢复滚动位置
        if (savedScrollPosition > 0 && contentRef.current) {
          setTimeout(() => {
            if (contentRef.current) {
              contentRef.current.scrollTop = savedScrollPosition;
              console.log('✅ [reorderImages] 滚动位置已恢复:', savedScrollPosition);
            }
          }, 100);
        }

        console.log(`✅ [reorderImages] 图片排序成功`);
      }

    } catch (error) {
      console.error('❌ [reorderImages] 重排序失败:', error);
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
   * 手动切换图片的完成状态 - 增强用户体验
   */
  const handleToggleImageCompleted = async (imageId) => {
    try {
      setError(null);

      // 获取当前图片状态以提供更好的用户反馈
      const imageInfo = localImageManager.getImageInfo(imageId);
      const currentStatus = imageInfo?.status || 'unknown';
      const willComplete = currentStatus !== 'completed';

      console.log(`🔄 [手动状态切换] ${willComplete ? '标记完成' : '取消完成'}: ${imageId}`);

      // 显示操作反馈
      const operationText = willComplete ? '正在标记为已完成...' : '正在取消完成状态...';

      // 临时显示操作状态
      if (willComplete) {
        setCompletedImages(prev => new Set([...prev, imageId]));
      } else {
        setCompletedImages(prev => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
      }

      // 调用LocalImageManager切换完成状态
      const result = await localImageManager.toggleImageCompletedStatus(imageId);

      if (result.success) {
        console.log(`✅ [手动状态切换] 操作成功: ${imageId} → ${result.newStatus}`);

        // 刷新图片数据以显示最新状态
        await initializeImageData();

        // 显示成功提示
        const successMessage = result.newStatus === 'completed' ? '图片已标记为完成' : '已取消完成状态';

        // 可以添加临时成功提示（可选）
        console.log(`🎉 [用户操作] ${successMessage}: ${imageId}`);

      } else {
        // 恢复之前状态
        if (willComplete) {
          setCompletedImages(prev => {
            const next = new Set(prev);
            next.delete(imageId);
            return next;
          });
        } else {
          setCompletedImages(prev => new Set([...prev, imageId]));
        }
        setError(`操作失败，请重试`);
      }

    } catch (error) {
      console.error('❌ [手动状态切换] 操作失败:', error);

      // 提供用户友好的错误信息
      let userFriendlyMessage = '操作失败';
      if (error.message.includes('not found')) {
        userFriendlyMessage = '图片未找到，请刷新页面重试';
      } else if (error.message.includes('permission')) {
        userFriendlyMessage = '权限不足，请检查文件访问权限';
      } else {
        userFriendlyMessage = `操作失败: ${error.message}`;
      }

      setError(userFriendlyMessage);
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

    } catch (error) {
      console.error('❌ [handleOpenImageInPS] 在PS中打开图片失败:', error);
      setError(`在PS中打开图片失败: ${error.message}`);
    } finally {
      setOpeningImageId(null);
    }
  };

  /**
   * 执行删除图片的核心逻辑
   */
  const executeDelete = async (imageToDelete) => {
    try {
      setError(null);
      console.log('🗑️ [executeDelete] 开始高效删除图片（通过索引）:', {
        imageUrl: imageToDelete.imageUrl,
        type: imageToDelete.type,
        index: imageToDelete.index,
        skuIndex: imageToDelete.skuIndex
      });

      // 在删除操作前保存当前滚动位置
      if (contentRef.current) {
        const currentScrollPosition = contentRef.current.scrollTop;
        setSavedScrollPosition(currentScrollPosition);
        console.log('💾 [executeDelete] 保存滚动位置:', currentScrollPosition);
      } else {
        console.warn('⚠️ [executeDelete] contentRef.current为null，无法保存滚动位置');
      }

      // 调用LocalImageManager通过索引高效删除图片
      console.log(`🚀 [executeDelete] 删除参数:`, {
        applyCode: currentProduct.applyCode,
        imageType: imageToDelete.type,
        imageIndex: imageToDelete.index,
        skuIndex: imageToDelete.skuIndex
      });

      const success = await localImageManager.deleteImageByIndex(
        currentProduct.applyCode,
        imageToDelete.type,
        imageToDelete.index,
        imageToDelete.skuIndex
      );

      if (success) {
        console.log('✅ [executeDelete] 图片索引删除成功，开始刷新数据');

        // 重新初始化数据以刷新UI
        await initializeImageData();

        // 通知父组件数据已更新
        onUpdate?.(currentProduct);
      } else {
        setError('删除图片失败');
        setSavedScrollPosition(0); // 清除保存的位置
      }

    } catch (error) {
      console.error('❌ [executeDelete] 删除图片失败:', error);
      setError(`删除图片失败: ${error.message}`);
      setSavedScrollPosition(0); // 清除保存的位置
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
          <button
            className="help-btn"
            onClick={() => setShowWorkflowGuide(!showWorkflowGuide)}
            title="查看工作流程说明"
          >
            {showWorkflowGuide ? '关闭说明' : '工作流程'}
          </button>
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
                  <div className="step-action">双击图片在PS中打开</div>
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
                  <div className="step-action">双击可重新编辑</div>
                </div>
              </div>
            </div>
            <div className="guide-tips">
              <h4>💡 使用技巧</h4>
              <ul>
                <li>已完成的图片双击会重置为编辑中状态</li>
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
              正在上传图片... ({uploadProgress.current}/{uploadProgress.total})
            </span>
            <div className="upload-progress-percent">
              {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
            </div>
          </div>
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
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
                // 使用预计算的拖拽状态
                const dragOverClass = image.isHovered
                  ? `drag-over-${dragState.hoveredDropTarget.position}`
                  : '';

                return (
                  <div
                    key={image.id}
                    className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass}`}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, image.id, 'original')}
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
                        onClick={() => handleImageClick(image.id, image.imageUrl)}
                        onDoubleClick={() => handleOpenImageInPS(image.id, image.imageUrl)}
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
                  // 使用预计算的拖拽状态
                  const dragOverClass = image.isHovered
                    ? `drag-over-${dragState.hoveredDropTarget.position}`
                    : '';

                  return (
                    <div
                      key={image.id}
                      className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass}`}
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, image.id, 'sku', sku.skuIndex || skuIndex)}
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
                          onClick={() => handleImageClick(image.id, image.imageUrl)}
                          onDoubleClick={() => handleOpenImageInPS(image.id, image.imageUrl)}
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
                // 使用预计算的拖拽状态
                const dragOverClass = image.isHovered
                  ? `drag-over-${dragState.hoveredDropTarget.position}`
                  : '';

                return (
                  <div
                    key={image.id}
                    className={`product-image-item ${image.isDragged ? 'dragging' : ''} ${dragOverClass}`}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, image.id, 'scene')}
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
                        onClick={() => handleImageClick(image.id, image.imageUrl)}
                        onDoubleClick={() => handleOpenImageInPS(image.id, image.imageUrl)}
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
                <span>双击: 在PS中打开</span>
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