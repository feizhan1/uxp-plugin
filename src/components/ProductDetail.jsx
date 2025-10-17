import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import { ConcurrentUploadManager } from '../utils/ConcurrentUploadManager.js';
import { placeImageInPS, registerPSEventListeners, unregisterPSEventListeners, detectAndMatchOpenedImages } from '../panels/photoshop-api.js';
import { post } from '../utils/http.js';
import { translateImage } from '../utils/translateApi.js';
import Toast from './Toast.jsx';
import './ProductDetail.css';

/**
 * 本地图片组件 - 仅显示本地文件系统中的图片
 * 使用React.memo优化性能
 */
const LocalImage = React.memo(({ imageUrl, alt, className, hasLocal, needsRefresh, onRefreshComplete, onDoubleClick, onClick, onMouseDown, onContextMenu, isOpening, isSyncing, isRecentlyUpdated, isCompleted, imageStatus, onImageInfoLoad, isCompareMode }) => {
  const [displaySrc, setDisplaySrc] = useState(null);
  const [loading, setLoading] = useState(hasLocal);
  const [hovered, setHovered] = useState(false);
  const [imageInfo, setImageInfo] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadImage = async () => {
      console.log(`🔍 [LocalImage] loadImage调用 - imageUrl类型: ${typeof imageUrl}, 值（完整）: ${imageUrl}, hasLocal: ${hasLocal}`);

      if (!imageUrl) {
        console.log(`❌ [LocalImage] imageUrl为空`);
        setDisplaySrc(null);
        setLoading(false);
        return;
      }

      // 检查imageUrl是否是字符串
      const imageUrlStr = String(imageUrl);
      console.log(`🔍 [LocalImage] imageUrl转字符串（完整）: ${imageUrlStr}, 长度: ${imageUrlStr.length}, 是否https开头: ${imageUrlStr.startsWith('https://')}, hasLocal: ${hasLocal}`);

      // 如果是https://或http://远程URL且hasLocal为false，直接使用远程URL
      if (!hasLocal && (imageUrlStr.startsWith('https://') || imageUrlStr.startsWith('http://'))) {
        console.log(`✅ [LocalImage] 使用远程URL（完整）: ${imageUrlStr}`);
        if (isMounted) {
          setDisplaySrc(imageUrlStr);
          setLoading(false);
          console.log(`✅ [LocalImage] displaySrc已设置为（完整）: ${imageUrlStr}`);
        }
        return;
      }

      // 如果hasLocal为false且不是https://，不显示
      if (!hasLocal) {
        console.log(`❌ [LocalImage] hasLocal=false但不是https URL: ${imageUrl.substring(0, 50)}`);
        setDisplaySrc(null);
        setLoading(false);
        return;
      }

      // 加载本地图片
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

    loadImage();

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

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (!bytes) return '未知';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  if (loading) {
    return (
      <div className="local-image-loading">
        <div className="loading-text">加载中...</div>
      </div>
    );
  }

  if (!displaySrc) {
    // 如果没有displaySrc，检查是否是远程URL
    if (!hasLocal && imageUrl && imageUrl.startsWith('https://')) {
      // 远程URL的情况已经在useEffect中处理了，这里不应该到达
      return (
        <div className="local-image-loading">
          <div className="loading-text">加载中...</div>
        </div>
      );
    }

    return (
      <div className="local-image-error">
        <div className="error-text">{hasLocal ? '图片加载失败' : '本地图片不可用'}</div>
      </div>
    );
  }

  console.log(`🖼️ [LocalImage] 渲染 - displaySrc（完整）: ${displaySrc}, 长度: ${displaySrc?.length}, hasLocal: ${hasLocal}`);

  return (
    <div
      className={`local-image-container ${isOpening ? 'opening' : ''} ${hasLocal ? 'clickable' : ''} ${isSyncing ? 'syncing' : ''} ${isRecentlyUpdated ? 'recently-updated' : ''} ${isCompleted ? 'completed' : ''}`}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        ref={imgRef}
        src={displaySrc}
        alt={alt}
        className={className}
        style={isCompareMode ?
          { width: '100%', height: '100%', display: 'block' } :
          { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
        }
        onError={(e) => {
          console.error(`❌ [LocalImage] 图片加载失败 - src（完整）: ${displaySrc}, 长度: ${displaySrc?.length}, isCompareMode: ${isCompareMode}`);
          console.error(`❌ [LocalImage] 错误详情:`, e);
          console.error(`❌ [LocalImage] 错误类型: ${e?.type}, target: ${e?.target?.tagName}, currentSrc: ${e?.target?.currentSrc}`);

          // 尝试直接用fetch测试URL是否可访问
          if (displaySrc && !hasLocal) {
            fetch(displaySrc, { method: 'HEAD' })
              .then(response => {
                console.log(`🔍 [LocalImage] fetch测试结果 - status: ${response.status}, ok: ${response.ok}, headers:`, response.headers);
              })
              .catch(err => {
                console.error(`❌ [LocalImage] fetch测试失败:`, err);
              });
          }
        }}
        onLoad={() => {
          if (imgRef.current && imgRef.current.complete) {
            const loadImageInfo = async () => {
              try {
                const img = imgRef.current;
                const width = img.naturalWidth;
                const height = img.naturalHeight;

                let fileSize = null;
                try {
                  const imageData = await localImageManager.getImageInfo(imageUrl);
                  if (imageData && imageData.fileSize) {
                    fileSize = imageData.fileSize;
                  }
                } catch (error) {
                  console.warn('获取文件大小失败:', error);
                }

                const info = { width, height, fileSize };
                setImageInfo(info);
                // 如果有回调，通知父组件
                if (onImageInfoLoad) {
                  onImageInfoLoad(info);
                }
              } catch (error) {
                console.warn('获取图片信息失败:', error);
              }
            };
            loadImageInfo();
          }
        }}
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
  // 获取登录信息的辅助函数
  const getLoginInfo = () => {
    try {
      const loginInfoRaw = localStorage.getItem('loginInfo');
      if (loginInfoRaw) {
        const loginInfo = JSON.parse(loginInfoRaw);
        if (loginInfo?.success && loginInfo?.data) {
          return {
            userId: loginInfo.data.UserId,
            userCode: loginInfo.data.UserCode
          };
        }
      }
    } catch (error) {
      console.error('❌ 解析登录信息失败:', error);
    }
    return { userId: null, userCode: null };
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (!bytes) return '未知';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

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
  const [isRejecting, setIsRejecting] = useState(false); // 驳回操作进行中
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

  // 批量同步相关状态
  const [batchSyncMode, setBatchSyncMode] = useState(false); // 是否处于批量同步模式
  const [selectedImages, setSelectedImages] = useState(new Set()); // 选中的图片ID集合
  const [syncingBatch, setSyncingBatch] = useState(false); // 批量同步进行中状态


  const [skipDeleteConfirmation, setSkipDeleteConfirmation] = useState(false); // 全局控制是否跳过删除确认
  const [dontAskAgain, setDontAskAgain] = useState(false); // 当前对话框中"不再询问"复选框状态
  const [deletingGroup, setDeletingGroup] = useState(null); // 正在删除的组信息 {type: 'sku'|'scene', skuIndex: number, count: number, title: string}
  const [syncingGroupToPS, setSyncingGroupToPS] = useState(null); // 正在批量同步到PS的组信息 {type: 'sku'|'scene', skuIndex: number}

  // 图片预览模式状态管理
  const [previewMode, setPreviewMode] = useState({
    isOpen: false,
    currentImageId: null,
    currentImageIndex: 0,
    imageList: []
  });

  // 预览图片的元数据
  const [previewImageMeta, setPreviewImageMeta] = useState({
    width: null,
    height: null,
    fileSize: null
  });

  // 所有图片的元数据映射 {imageId: {width, height, fileSize}}
  const [imageMetaMap, setImageMetaMap] = useState({});

  // 图片翻译和对比模式状态
  const [translatedImage, setTranslatedImage] = useState(null); // 翻译后的图片URL
  const [compareMode, setCompareMode] = useState(false); // 是否处于对比模式
  const [comparePosition, setComparePosition] = useState(50); // 滑块位置百分比
  const [isTranslating, setIsTranslating] = useState(false); // 是否正在翻译
  const [isApplyingTranslation, setIsApplyingTranslation] = useState(false); // 是否正在应用翻译
  const [compareContainerWidth, setCompareContainerWidth] = useState(0); // 对比容器宽度
  const compareContainerRef = useRef(null); // 对比容器引用

  // 批量翻译状态
  const [translatingGroup, setTranslatingGroup] = useState(null); // 正在翻译的组 {type: 'sku'|'scene', skuIndex}
  const [translateProgress, setTranslateProgress] = useState(null); // 翻译进度 {completed, total, running, failed}

  // Toast 提示状态
  const [toast, setToast] = useState({
    open: false,
    message: '',
    type: 'info'
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

  // 监听对比模式，获取容器宽度
  useEffect(() => {
    if (compareMode && compareContainerRef.current) {
      const updateWidth = () => {
        const width = compareContainerRef.current?.offsetWidth || 0;
        console.log('🔍 [对比模式] 容器宽度:', width);
        setCompareContainerWidth(width);
      };

      // 初始获取
      updateWidth();

      // 监听窗口大小变化
      window.addEventListener('resize', updateWidth);

      return () => {
        window.removeEventListener('resize', updateWidth);
      };
    }
  }, [compareMode]);

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

            // 更新图片localStatus字段为completed（关键修复）
            updateImageStatusInState(syncResult.imageId, 'completed');

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

      // 同步更新currentProduct状态，确保数据一致性
      if (latestProductData) {
        console.log('🔄 [initializeImageData] 同步更新currentProduct状态:', {
          从: '传入的productData',
          到: 'LocalImageManager最新数据',
          applyCode: latestProductData.applyCode
        });
        // 合并数据：以本地图片数据为基础，补充API独有的字段
        setCurrentProduct({
          ...latestProductData,     // 本地图片相关的最新数据
          // 确保API独有字段不被覆盖
          productName: currentProduct.productName,
          chineseName: currentProduct.chineseName,
          chinesePackageList: currentProduct.chinesePackageList,
          status: currentProduct.status
        });
      }

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

      // 检测PS中已打开的图片并更新状态
      try {
        console.log('🔍 [initializeImageData] 开始检测PS中已打开的图片');
        const matchedImageIds = await detectAndMatchOpenedImages(currentProduct.applyCode);

        if (matchedImageIds.length > 0) {
          console.log(`✅ [initializeImageData] 检测到 ${matchedImageIds.length} 张已打开的图片`);

          // 批量更新图片状态为"编辑中"
          for (const imageId of matchedImageIds) {
            try {
              // 关键修复：检查当前状态，如果已经是completed，不要改回editing
              const currentImageInfo = localImageManager.getImageInfo(imageId);
              if (currentImageInfo && currentImageInfo.status === 'completed') {
                console.log(`⏩ [initializeImageData] 跳过已完成的图片: ${imageId}`);
                continue;
              }

              await localImageManager.setImageStatus(imageId, 'editing');
              console.log(`🔄 [initializeImageData] 已将图片 ${imageId} 状态设为编辑中`);
            } catch (statusError) {
              console.error(`❌ [initializeImageData] 更新图片状态失败:`, statusError);
            }
          }

          // 重新读取并更新图片组状态
          const updatedProductData = localImageManager.findProductByApplyCode(currentProduct.applyCode);
          if (updatedProductData) {
            const updatedGroups = processImageGroups(updatedProductData);
            setImageGroups(updatedGroups);
            console.log(`🔄 [initializeImageData] 已刷新图片组状态`);
          }
        } else {
          console.log(`ℹ️ [initializeImageData] 未检测到已打开的图片`);
        }
      } catch (detectError) {
        console.error('❌ [initializeImageData] 检测PS打开图片失败:', detectError);
        // 不影响主流程，继续执行
      }

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
   * 处理图片信息加载完成事件
   */
  const handleImageInfoLoad = useCallback((imageId, imageInfo) => {
    console.log(`📊 [图片信息] 加载完成: ${imageId}`, imageInfo);
    setImageMetaMap(prev => ({
      ...prev,
      [imageId]: imageInfo
    }));
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

      // 获取登录信息
      const { userId, userCode } = getLoginInfo();
      console.log('✅ 获取登录信息:', { userId, userCode });

      if (!userId || !userCode) {
        throw new Error('无法获取用户登录信息，请重新登录');
      }

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
        userId: userId,
        userCode: userCode
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
      console.log('📋 请求体详情 currentProduct:', JSON.stringify(currentProduct, null, 2));

      // 获取登录信息
      const { userId, userCode } = getLoginInfo();
      if (!userId || !userCode) {
        throw new Error('无法获取用户登录信息，请重新登录');
      }

      // 构建完整的API请求体
      const payload = {
        userId: userId,
        userCode: userCode,
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
      console.log('📋 请求体详情 payload:', JSON.stringify(payload, null, 2));
      //console.log('📤 提交审核 payload:', payload);

      // return
      
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

    } catch (error) {
      console.error('❌ 审核API调用失败:', error);
      throw new Error(`审核提交失败: ${error.message}`);
    }
  };

  /**
   * 处理提交成功后的操作
   *
   * 保留模式 - 产品数据和本地图片文件不会被删除
   * 提交成功后仅关闭详情页并通知父组件，数据保留便于调试和验证
   */
  const handleSubmitSuccess = async (successMessage) => {
    try {
      console.log('🎉 提交成功:', successMessage || '审核提交完成');
      console.log('💾 保留模式 - 产品数据和本地图片不会被删除');

      // 数据清理功能已禁用 - 保留产品数据和本地图片文件
      // const removed = await localImageManager.removeProduct(currentProduct.applyCode);
      // if (removed) {
      //   console.log('✅ 产品数据已从本地索引移除');
      // }

      // 1. 关闭产品详情页 - 延迟执行确保用户看到成功状态
      setTimeout(() => {
        if (onClose) {
          console.log('📱 关闭产品详情页');
          onClose();
        }
      }, 1500);

      // 2. 触发父组件提交回调 - 通知提交成功
      if (onSubmit) {
        console.log('🔄 通知父组件产品提交成功');
        onSubmit(currentProduct);
      }

    } catch (error) {
      console.error('⚠️ 处理提交成功后的操作时出现错误:', error);
      // 即使出错，也不阻止页面关闭
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
   * 驳回产品
   */
  const handleRejectProduct = async () => {
    try {
      setIsRejecting(true);
      setError(null);

      console.log('🚫 开始驳回产品:', currentProduct.applyCode);

      // 获取登录信息
      const { userId, userCode } = getLoginInfo();
      if (!userId || !userCode) {
        throw new Error('无法获取用户登录信息，请重新登录');
      }

      // 调用驳回API
      const response = await post('/api/publish/reject_product_image', {
        userId: userId,
        userCode: userCode,
        applyCode: currentProduct.applyCode
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const { statusCode, message } = response || {};

      // 检查响应状态
      if (statusCode === 200) {
        console.log('✅ 产品驳回成功:', message);

        // 🧹 清理本地数据和图片文件
        console.log('🧹 开始清理产品数据和本地图片...');
        const removed = await localImageManager.removeProduct(currentProduct.applyCode);
        if (removed) {
          console.log('✅ 产品数据和本地图片已清理');
        }

        // 显示成功提示
        setToast({
          open: true,
          message: message || '驳回成功',
          type: 'success'
        });

        // 延迟关闭详情页，让用户看到成功提示
        setTimeout(() => {
          if (onClose) {
            console.log('📱 关闭产品详情页');
            onClose();
          }

          // 通知父组件提交成功，触发列表刷新
          if (onSubmit) {
            console.log('🔄 通知父组件驳回成功，刷新列表');
            onSubmit(currentProduct);
          }
        }, 1500);

      } else {
        throw new Error(message || '驳回失败');
      }

    } catch (error) {
      console.error('❌ 驳回产品失败:', error);
      setToast({
        open: true,
        message: `驳回失败: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsRejecting(false);
    }
  };

  /**
   * 复制产品编号到剪贴板
   */
  const handleCopyProductCode = async () => {
    try {
      await navigator.clipboard.writeText(currentProduct.applyCode);
      setToast({
        open: true,
        message: '产品编号已复制',
        type: 'success'
      });
    } catch (error) {
      console.error('复制产品编号失败:', error);
      setToast({
        open: true,
        message: '复制失败: ' + error.message,
        type: 'error'
      });
    }
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
   * 确认一键删除整个组
   */
  const handleConfirmDeleteGroup = (type, skuIndex = null) => {
    // 获取要删除的图片列表
    let images = [];
    let groupTitle = '';

    if (type === 'sku' && skuIndex !== null) {
      const sku = virtualizedImageGroups.skus.find(s => (s.skuIndex || 0) === skuIndex);
      if (sku) {
        images = sku.images;
        groupTitle = sku.skuTitle;
      }
    } else if (type === 'scene') {
      images = virtualizedImageGroups.scenes;
      groupTitle = '场景图片';
    }

    if (images.length === 0) {
      console.log('ℹ️ [handleConfirmDeleteGroup] 没有图片需要删除');
      return;
    }

    console.log(`🗑️ [handleConfirmDeleteGroup] 准备删除组: ${groupTitle}, 共 ${images.length} 张图片`);

    // 如果用户选择跳过确认，直接执行删除
    if (skipDeleteConfirmation) {
      console.log('ℹ️ [handleConfirmDeleteGroup] 跳过删除确认，直接执行批量删除');
      executeBatchDelete(type, skuIndex, images);
    } else {
      // 显示批量删除确认对话框
      setDeletingGroup({
        type,
        skuIndex,
        count: images.length,
        title: groupTitle,
        images
      });
      setDontAskAgain(false); // 重置复选框状态
    }
  };

  /**
   * 取消批量删除
   */
  const handleCancelDeleteGroup = () => {
    setDeletingGroup(null);
  };

  /**
   * 执行批量删除
   */
  const executeBatchDelete = async (type, skuIndex, images) => {
    try {
      setError(null);
      console.log(`🗑️ [executeBatchDelete] 开始批量删除 ${images.length} 张图片, type: ${type}, skuIndex: ${skuIndex}`);

      // 逐个删除图片
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // 从本地状态中移除图片
          removeImageFromState(image);

          // 同步到LocalImageManager（使用索引0，因为每次删除后数组会变短）
          const success = await localImageManager.deleteImageByIndex(
            currentProduct.applyCode,
            type,
            0, // 总是删除第一张，因为数组会动态缩短
            skuIndex
          );

          if (success) {
            successCount++;
            console.log(`✅ [executeBatchDelete] 成功删除第 ${i + 1}/${images.length} 张图片`);
          } else {
            failCount++;
            console.error(`❌ [executeBatchDelete] 删除第 ${i + 1}/${images.length} 张图片失败`);
          }
        } catch (error) {
          failCount++;
          console.error(`❌ [executeBatchDelete] 删除第 ${i + 1}/${images.length} 张图片时出错:`, error);
        }
      }

      console.log(`📊 [executeBatchDelete] 批量删除完成: 成功 ${successCount}/${images.length}, 失败 ${failCount}/${images.length}`);

      if (successCount > 0) {
        // 通知父组件数据已更新
        onUpdate?.(currentProduct);
      }

      if (failCount > 0) {
        setError(`部分图片删除失败: ${failCount}/${images.length} 张失败`);
        // 重新加载数据以保持一致性
        await initializeImageData();
      }

    } catch (error) {
      console.error('❌ [executeBatchDelete] 批量删除失败:', error);
      setError(`批量删除失败: ${error.message}`);
      // 重新加载数据以保持一致性
      await initializeImageData();
    }
  };

  /**
   * 处理批量删除确认对话框的删除操作
   */
  const handleExecuteDeleteGroup = async () => {
    if (!deletingGroup) return;

    try {
      // 如果用户勾选了"不再询问"，保存设置
      if (dontAskAgain) {
        console.log('💾 [handleExecuteDeleteGroup] 用户选择不再询问，保存设置');
        setSkipDeleteConfirmation(true);
        await saveDeleteSettings(true);
      }

      // 执行批量删除
      await executeBatchDelete(deletingGroup.type, deletingGroup.skuIndex, deletingGroup.images);

    } catch (error) {
      console.error('❌ [handleExecuteDeleteGroup] 批量删除操作失败:', error);
      setError(`批量删除操作失败: ${error.message}`);
    } finally {
      setDeletingGroup(null);
    }
  };

  /**
   * 批量同步组到PS
   */
  const handleBatchSyncGroupToPS = async (type, skuIndex = null) => {
    try {
      // 获取要同步的图片列表
      let images = [];
      let groupTitle = '';

      if (type === 'sku' && skuIndex !== null) {
        const sku = virtualizedImageGroups.skus.find(s => (s.skuIndex || 0) === skuIndex);
        if (sku) {
          images = sku.images;
          groupTitle = sku.skuTitle;
        }
      } else if (type === 'scene') {
        images = virtualizedImageGroups.scenes;
        groupTitle = '场景图片';
      }

      if (images.length === 0) {
        console.log('ℹ️ [handleBatchSyncGroupToPS] 没有图片需要同步');
        return;
      }

      console.log(`🚀 [handleBatchSyncGroupToPS] 准备批量同步: ${groupTitle}, 共 ${images.length} 张图片`);

      // 设置同步状态
      setSyncingGroupToPS({ type, skuIndex });
      setError(null);

      // 批量处理配置
      const BATCH_SIZE = 3; // 避免同时打开太多PS文档
      const results = { success: 0, failed: 0, errors: [] };

      // 分批处理图片
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(images.length / BATCH_SIZE);

        console.log(`📦 [批量同步组] 处理第 ${batchNumber}/${totalBatches} 批，包含 ${batch.length} 张图片`);

        // 并发处理当前批次
        const batchPromises = batch.map(async (image) => {
          try {
            console.log(`🖼️ [批量同步组] 正在打开图片: ${image.imageUrl}`);

            // 检查图片当前状态，如果是已完成状态，重置为编辑中
            const imageInfo = localImageManager.getImageInfo(image.id) || localImageManager.getImageInfo(image.imageUrl);
            if (imageInfo && imageInfo.status === 'completed') {
              console.log('🔄 [批量同步组] 图片为已完成状态，重置为编辑中');
              await localImageManager.resetImageToEditing(image.id);
            }

            // 使用现有的单个图片打开逻辑
            const psImageInfo = {
              imageId: image.id,
              url: image.imageUrl,
              type: 'smart'
            };

            const documentId = await placeImageInPS(psImageInfo, { directOpen: true });

            console.log(`✅ [批量同步组] 成功打开: ${image.imageUrl} (文档ID: ${documentId})`);

            // 更新图片状态为编辑中
            try {
              await localImageManager.setImageStatus(image.id, 'editing');
              setEditingImages(prev => new Set([...prev, image.id]));
              updateImageStatusInState(image.id, 'editing');
            } catch (statusError) {
              console.error('❌ [批量同步组] 更新图片状态失败:', statusError);
            }

            results.success++;
            return { success: true, imageId: image.id, documentId };
          } catch (error) {
            console.error(`❌ [批量同步组] 打开失败: ${image.imageUrl}`, error);
            results.failed++;
            results.errors.push({
              imageId: image.id,
              imageUrl: image.imageUrl,
              error: error.message
            });
            return { success: false, imageId: image.id, error: error.message };
          }
        });

        // 等待当前批次完成
        await Promise.allSettled(batchPromises);

        // 批次间短暂延迟，避免PS过载
        if (i + BATCH_SIZE < images.length) {
          console.log(`⏳ [批量同步组] 批次间延迟，给PS缓冲时间...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 刷新图片数据显示最新状态
      console.log(`🔄 [批量同步组] 刷新图片数据以显示最新状态...`);
      await initializeImageData();

      // 显示结果
      if (results.success > 0 && results.failed === 0) {
        console.log(`🎉 [批量同步组] 完全成功: 已成功打开 ${results.success} 张图片到PS中`);
        setError(null);
      } else if (results.success > 0 && results.failed > 0) {
        const errorDetails = results.errors.map(err => `${err.imageUrl}: ${err.error}`).join(', ');
        console.warn(`⚠️ [批量同步组] 部分成功: ${results.success}张成功, ${results.failed}张失败`);
        setError(`部分同步成功: ${results.success}张成功, ${results.failed}张失败`);
      } else {
        console.error(`💥 [批量同步组] 完全失败`);
        setError('批量同步失败，请检查PS是否正常运行');
      }

    } catch (error) {
      console.error('❌ [handleBatchSyncGroupToPS] 批量同步过程发生异常:', error);
      setError(`批量同步失败: ${error.message}`);
    } finally {
      setSyncingGroupToPS(null);
    }
  };

  /**
   * 批量翻译组图片
   */
  const handleBatchTranslateGroup = async (type, skuIndex = null) => {
    try {
      // 获取要翻译的图片列表
      let images = [];
      let groupTitle = '';

      if (type === 'sku' && skuIndex !== null) {
        const sku = virtualizedImageGroups.skus.find(s => (s.skuIndex || 0) === skuIndex);
        if (sku) {
          images = sku.images;
          groupTitle = sku.skuTitle;
        }
      } else if (type === 'scene') {
        images = virtualizedImageGroups.scenes;
        groupTitle = '场景图片';
      }

      if (images.length === 0) {
        console.log('ℹ️ [handleBatchTranslateGroup] 没有图片需要翻译');
        return;
      }

      console.log(`🚀 [handleBatchTranslateGroup] 准备批量翻译: ${groupTitle}, 共 ${images.length} 张图片`);

      // 设置翻译状态
      setTranslatingGroup({ type, skuIndex });
      setTranslateProgress({ completed: 0, total: images.length, running: 0, failed: 0 });
      setError(null);

      // 批量处理配置（翻译API较慢，减少并发数）
      const BATCH_SIZE = 2;
      const results = { success: 0, failed: 0, errors: [] };

      // 存储翻译结果，稍后统一更新索引
      const translationResults = [];

      // 分批处理图片
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(images.length / BATCH_SIZE);

        console.log(`📦 [批量翻译] 处理第 ${batchNumber}/${totalBatches} 批，包含 ${batch.length} 张图片`);

        // 并发处理当前批次
        const batchPromises = batch.map(async (image) => {
          try {
            // 更新进度：增加运行中计数
            setTranslateProgress(prev => prev ? { ...prev, running: prev.running + 1 } : null);

            console.log(`🖼️ [批量翻译] 正在翻译图片: ${image.imageUrl}`);

            // 1. 获取图片源（优先使用HTTPS URL）
            let imageSource = null;
            if (image.imageUrl && image.imageUrl.startsWith('https://')) {
              imageSource = image.imageUrl;
              console.log('✅ [批量翻译] 使用图片URL:', imageSource);
            } else if (image.hasLocal) {
              try {
                const localFile = await localImageManager.getLocalImageFile(image.id);
                if (localFile) {
                  const arrayBuffer = await localFile.read({ format: require('uxp').storage.formats.binary });
                  imageSource = arrayBuffer;
                  console.log('✅ [批量翻译] 使用本地文件，大小:', arrayBuffer.byteLength);
                }
              } catch (error) {
                console.warn('⚠️ [批量翻译] 读取本地文件失败:', error);
              }
            }

            if (!imageSource) {
              throw new Error('无法获取图片源');
            }

            // 2. 调用翻译API
            const translatedImageUrl = await translateImage(imageSource, {
              sourceLang: 'CHS',
              targetLang: 'ENG',
              filename: image.id ? `${image.id}.png` : 'image.png',
              mimeType: 'image/png'
            });

            console.log(`✅ [批量翻译] 翻译成功: ${translatedImageUrl}`);

            // 3. 下载翻译后的图片
            const response = await fetch(translatedImageUrl);
            if (!response.ok) {
              throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log('✅ [批量翻译] 图片下载成功, 大小:', arrayBuffer.byteLength);

            // 4. 获取图片信息
            const imageInfo = localImageManager.getImageInfo(image.id);
            if (!imageInfo) {
              throw new Error('未找到图片信息');
            }

            // 5. 保存图片到本地（使用翻译后的URL生成文件名）
            const productFolder = await localImageManager.getOrCreateProductFolder(imageInfo.applyCode);
            const localFilePath = localImageManager.generateLocalFilename({
              imageUrl: translatedImageUrl, // 使用翻译后的URL（包含-f后缀）
              applyCode: imageInfo.applyCode
            });
            const fileName = localFilePath.split('/')[1];

            const fs = require('uxp').storage.localFileSystem;
            const formats = require('uxp').storage.formats;
            const localFile = await productFolder.createFile(fileName, { overwrite: true });
            await localFile.write(arrayBuffer, { format: formats.binary });
            console.log('✅ [批量翻译] 文件已保存:', fileName);

            // 6. 存储翻译结果，稍后统一更新索引
            translationResults.push({
              originalImageUrl: image.imageUrl,  // 保存原始URL用于查找
              translatedImageUrl: translatedImageUrl,
              localPath: `${imageInfo.applyCode}/${fileName}`,
              fileSize: arrayBuffer.byteLength,
              imageInfo: imageInfo
            });

            console.log('✅ [批量翻译] 翻译结果已记录:', image.imageUrl);

            // 更新进度：完成数+1，运行中-1
            setTranslateProgress(prev => prev ? {
              ...prev,
              completed: prev.completed + 1,
              running: prev.running - 1
            } : null);

            results.success++;
            return { success: true, imageId: image.id };
          } catch (error) {
            console.error(`❌ [批量翻译] 翻译失败: ${image.imageUrl}`, error);

            // 更新进度：完成数+1（失败也算完成），运行中-1，失败数+1
            setTranslateProgress(prev => prev ? {
              ...prev,
              completed: prev.completed + 1,
              running: prev.running - 1,
              failed: prev.failed + 1
            } : null);

            results.failed++;
            results.errors.push({
              imageId: image.id,
              imageUrl: image.imageUrl,
              error: error.message
            });
            return { success: false, imageId: image.id, error: error.message };
          }
        });

        // 等待当前批次完成
        await Promise.allSettled(batchPromises);

        // 批次间短暂延迟，避免API过载
        if (i + BATCH_SIZE < images.length) {
          console.log(`⏳ [批量翻译] 批次间延迟...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 7. 统一更新索引（在所有翻译完成后）
      console.log(`📝 [批量翻译] 开始统一更新索引，共 ${translationResults.length} 条记录`);
      console.log(`📝 [批量翻译] 翻译结果预览:`, translationResults.map(r => `${r.originalImageUrl} -> ${r.translatedImageUrl}`));

      if (translationResults.length > 0) {
        // 获取第一个图片的applyCode来获取product对象
        const firstImageInfo = translationResults[0].imageInfo;
        const product = localImageManager.getOrCreateProduct(firstImageInfo.applyCode);

        console.log(`📝 [批量翻译] Product信息:`, {
          applyCode: firstImageInfo.applyCode,
          originalImages: product.originalImages?.length || 0,
          senceImages: product.senceImages?.length || 0,
          publishSkus: product.publishSkus?.length || 0
        });

        // 遍历所有翻译结果，更新索引
        let successCount = 0;
        for (let i = 0; i < translationResults.length; i++) {
          const result = translationResults[i];
          const { originalImageUrl, translatedImageUrl, localPath, fileSize, imageInfo } = result;
          let targetImageInfo = null;

          console.log(`\n🔍 [批量翻译] [${i + 1}/${translationResults.length}] 处理图片:`);
          console.log(`   原始URL: ${originalImageUrl}`);
          console.log(`   翻译URL: ${translatedImageUrl}`);
          console.log(`   图片类型: ${imageInfo.imageType}`);
          console.log(`   SKU索引: ${imageInfo.skuIndex}`);

          if (imageInfo.imageType === 'scene') {
            console.log(`   → 在场景图片中查找 (共${product.senceImages?.length || 0}张)`);
            targetImageInfo = product.senceImages?.find(img => img.imageUrl === originalImageUrl);
          } else if (imageInfo.skuIndex !== undefined) {
            console.log(`   → 在SKU图片中查找 (SKU索引: ${imageInfo.skuIndex})`);
            const sku = product.publishSkus?.find(s => s.skuIndex === imageInfo.skuIndex);
            if (sku) {
              console.log(`   → 找到SKU，包含${sku.skuImages?.length || 0}张图片`);
              if (sku.skuImages && sku.skuImages.length > 0) {
                console.log(`   → SKU图片URLs:`, sku.skuImages.map(img => img.imageUrl).join(', '));
              }
              targetImageInfo = sku.skuImages?.find(img => img.imageUrl === originalImageUrl);
            } else {
              console.error(`   ❌ 未找到SKU (索引: ${imageInfo.skuIndex})`);
            }
          } else {
            console.log(`   → 在原始图片中查找 (共${product.originalImages?.length || 0}张)`);
            targetImageInfo = product.originalImages?.find(img => img.imageUrl === originalImageUrl);
          }

          if (targetImageInfo) {
            targetImageInfo.imageUrl = translatedImageUrl;
            targetImageInfo.localPath = localPath;
            targetImageInfo.hasLocal = true;
            targetImageInfo.status = 'pending_edit';
            targetImageInfo.timestamp = Date.now();
            targetImageInfo.fileSize = fileSize;
            successCount++;
            console.log(`   ✅ 索引已更新`);
          } else {
            console.error(`   ❌ 未找到图片记录！无法更新索引`);
          }
        }

        console.log(`\n📝 [批量翻译] 索引更新完成: 成功${successCount}/${translationResults.length}条`);
      }

      // 7. 保存索引数据
      await localImageManager.saveIndexData();
      console.log('💾 [批量翻译] 索引数据已保存');

      // 8. 刷新页面数据
      console.log('🔄 [批量翻译] 刷新页面数据...');
      await initializeImageData();

      // 9. 显示结果
      if (results.success > 0 && results.failed === 0) {
        console.log(`🎉 [批量翻译] 完全成功: 已成功翻译 ${results.success} 张图片`);
        setToast({
          open: true,
          message: `批量翻译成功：${results.success}张图片已翻译并更新`,
          type: 'success'
        });
      } else if (results.success > 0 && results.failed > 0) {
        console.warn(`⚠️ [批量翻译] 部分成功: ${results.success}张成功, ${results.failed}张失败`);
        setToast({
          open: true,
          message: `部分翻译成功: ${results.success}张成功, ${results.failed}张失败`,
          type: 'warning'
        });
      } else {
        console.error(`💥 [批量翻译] 完全失败`);
        setError('批量翻译失败，请检查网络连接和翻译服务');
      }

    } catch (error) {
      console.error('❌ [handleBatchTranslateGroup] 批量翻译过程发生异常:', error);
      setError(`批量翻译失败: ${error.message}`);
    } finally {
      setTranslatingGroup(null);
      setTranslateProgress(null);
    }
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

      // 获取当前产品的文件夹作为初始位置
      let initialFolder = null;
      try {
        await localImageManager.initialize();
        initialFolder = await localImageManager.getOrCreateProductFolder(currentProduct.applyCode);
        console.log(`📁 [handleAddImage] 设置初始文件夹: ${currentProduct.applyCode}`);
      } catch (error) {
        console.warn(`⚠️ [handleAddImage] 获取产品文件夹失败，使用默认位置:`, error);
      }

      // 显示文件选择对话框 - 限制PNG/JPG格式，尝试定位到产品文件夹
      const fileOptions = {
        allowMultiple: true,
        types: ['png', 'jpg', 'jpeg']
      };
      if (initialFolder) {
        fileOptions.initialLocation = initialFolder;
      }

      const files = await fs.getFileForOpening(fileOptions);

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
      console.log('🏁 [handleDragEnd] 拖拽结束事件触发');
      console.log('📊 [handleDragEnd] 当前 dragState.isDragging:', dragState.isDragging);

      // 无论拖拽是否成功，都重置状态
      setDragState({
        isDragging: false,
        draggedImageId: null,
        draggedImageType: null,
        draggedSkuIndex: null,
        hoveredDropTarget: null
      });

      console.log('✅ [handleDragEnd] 拖拽状态已重置为 false');

      // 清理防抖定时器
      if (dragEnterTimeoutRef.current) {
        clearTimeout(dragEnterTimeoutRef.current);
        dragEnterTimeoutRef.current = null;
      }

    } catch (error) {
      console.error('❌ [handleDragEnd] 拖拽结束处理失败:', error);
      // 即使出错也要确保状态被重置
      setDragState({
        isDragging: false,
        draggedImageId: null,
        draggedImageType: null,
        draggedSkuIndex: null,
        hoveredDropTarget: null
      });
    }
  }, [dragState.isDragging]);

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
    }, 20); // 优化：减少到20ms提升拖拽响应速度
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

    // 保存拖拽状态用于后续处理
    const wasDragging = dragState.isDragging;

    // ⚠️ 关键修复：立即重置拖拽状态，防止状态更新导致的事件丢失
    // 必须在执行任何可能触发重渲染的操作之前重置
    console.log('🔄 [handleDrop] 立即重置拖拽状态');
    setDragState({
      isDragging: false,
      draggedImageId: null,
      draggedImageType: null,
      draggedSkuIndex: null,
      hoveredDropTarget: null
    });

    try {
      if (!wasDragging) {
        console.warn('⚠️ [handleDrop] 拖拽状态已经是 false，忽略 drop 事件');
        return;
      }

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
      let updatedCount = 0;

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
          updatedCount++;
          console.log(`✅ [updateImageStatusInState] 原始图片状态已更新: ${imageId} → ${newStatus}`);
        }
      }

      // 在SKU图片中查找并更新（移除 !imageFound 条件，确保所有引用都被更新）
      if (groups.skus) {
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
              updatedCount++;
              console.log(`✅ [updateImageStatusInState] SKU图片状态已更新: ${imageId} → ${newStatus}`);
            }
          }
        });
      }

      // 在场景图片中查找并更新（移除 !imageFound 条件，确保所有引用都被更新）
      if (groups.scenes) {
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
          updatedCount++;
          console.log(`✅ [updateImageStatusInState] 场景图片状态已更新: ${imageId} → ${newStatus}`);
        }
      }

      console.log(`📊 [updateImageStatusInState] 共更新了 ${updatedCount} 个图片实例的UI状态`);

      if (updatedCount === 0) {
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
        // 保存当前滚动位置
        if (contentRef.current) {
          const currentScrollPosition = contentRef.current.scrollTop;
          setSavedScrollPosition(currentScrollPosition);
          console.log('💾 [handleImageFileUpdated] 保存滚动位置:', currentScrollPosition);
        }

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
   * 开始批量同步模式
   */
  const handleStartBatchSync = () => {
    setBatchSyncMode(true);
    setSelectedImages(new Set());
    console.log('🔄 [批量同步] 进入批量同步模式');
  };

  /**
   * 取消批量同步模式
   */
  const handleCancelBatchSync = () => {
    setBatchSyncMode(false);
    setSelectedImages(new Set());
    console.log('❌ [批量同步] 取消批量同步模式');
  };

  /**
   * 切换图片选择状态
   */
  const handleToggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
        console.log(`☐ [批量同步] 取消选择图片: ${imageId}`);
      } else {
        newSet.add(imageId);
        console.log(`☑ [批量同步] 选择图片: ${imageId}`);
      }
      console.log(`📋 [批量同步] 当前选中图片数量: ${newSet.size}`);
      return newSet;
    });
  };

  /**
   * 执行批量同步操作
   */
  const handleExecuteSync = async () => {
    try {
      setSyncingBatch(true);
      setError(null);

      const selectedImageIds = Array.from(selectedImages);
      const firstSku = virtualizedImageGroups.skus[0];
      const selectedImageData = firstSku.images.filter(img =>
        selectedImageIds.includes(img.id)
      );

      console.log(`🚀 [批量同步] 开始批量同步 ${selectedImageData.length} 张图片`);
      console.log(`📋 [批量同步] 源SKU索引: ${firstSku.skuIndex}, 标题: ${firstSku.skuTitle}`);

      // 获取其他SKU
      const otherSkus = virtualizedImageGroups.skus.slice(1);

      if (otherSkus.length === 0) {
        throw new Error('没有其他颜色款式可同步');
      }

      console.log(`📋 [批量同步] 目标SKU数量: ${otherSkus.length}`);

      let totalOperations = 0;
      let successOperations = 0;

      // 对每个目标SKU执行同步
      for (const targetSku of otherSkus) {
        console.log(`🎯 [批量同步] 同步到SKU: ${targetSku.skuTitle} (索引: ${targetSku.skuIndex})`);

        // 从LocalImageManager获取实际的目标SKU数据，确保使用最新长度
        const product = localImageManager.findProductByApplyCode(productData.applyCode);
        const actualTargetSku = product.publishSkus.find(s => s.skuIndex === targetSku.skuIndex);

        if (!actualTargetSku) {
          console.error(`❌ [批量同步] 未找到目标SKU: ${targetSku.skuIndex}`);
          continue;
        }

        for (const selectedImage of selectedImageData) {
          totalOperations++;
          try {
            // 每次插入前重新获取最新的SKU数据，确保targetIndex正确累加
            const currentProduct = localImageManager.findProductByApplyCode(productData.applyCode);
            const currentTargetSku = currentProduct.publishSkus.find(s => s.skuIndex === targetSku.skuIndex);
            const targetIndex = (currentTargetSku.skuImages || []).length;

            console.log(`📍 [批量同步] 插入位置: ${targetIndex}, 当前SKU图片数: ${targetIndex}`);

            await localImageManager.insertImageReferenceAt(
              productData.applyCode,
              selectedImage.imageUrl,
              'sku',
              'sku',
              targetIndex,
              firstSku.skuIndex, // 使用正确的源SKU索引
              targetSku.skuIndex
            );

            successOperations++;
            console.log(`✅ [批量同步] 成功同步图片 ${selectedImage.id} 到 SKU${targetSku.skuIndex} 位置${targetIndex}`);

          } catch (error) {
            console.error(`❌ [批量同步] 同步图片 ${selectedImage.id} 到 SKU${targetSku.skuIndex} 失败:`, error);
          }
        }
      }

      // 刷新数据
      console.log('🔄 [批量同步] 刷新图片数据...');
      await initializeImageData();

      // 退出批量同步模式
      setBatchSyncMode(false);
      setSelectedImages(new Set());

      // 显示成功提示
      if (successOperations === totalOperations) {
        console.log(`🎉 [批量同步] 成功同步 ${selectedImageData.length} 张图片到 ${otherSkus.length} 个颜色款式`);
        console.log(`🎉 [批量同步] 完全成功: ${successOperations}/${totalOperations} 个操作完成`);
      } else {
        console.warn(`⚠️ [批量同步] 部分同步成功: ${successOperations}/${totalOperations} 个操作完成`);
        console.warn(`⚠️ [批量同步] 部分成功: ${successOperations}/${totalOperations} 个操作完成`);
      }

    } catch (error) {
      console.error('❌ [批量同步] 批量同步失败:', error);
      setError(`批量同步失败: ${error.message}`);
    } finally {
      setSyncingBatch(false);
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

    // 清空图片元数据，等待新图片加载后更新
    setPreviewImageMeta({ width: null, height: null, fileSize: null });

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
    // 重置翻译和对比状态
    setTranslatedImage(null);
    setCompareMode(false);
    setComparePosition(50);
    setIsTranslating(false);
    setIsApplyingTranslation(false);
  }, []);

  /**
   * 翻译当前预览的图片
   */
  const handleTranslateImage = useCallback(async () => {
    const currentImage = previewMode.imageList[previewMode.currentImageIndex];
    if (!currentImage) {
      console.warn('❌ [handleTranslateImage] 未找到当前预览图片');
      return;
    }

    try {
      setIsTranslating(true);
      console.log('🌐 [handleTranslateImage] 开始翻译图片:', currentImage.id);

      // 获取图片的本地文件或URL
      let imageSource = null;

      // 优先使用https URL（直接URL翻译更快）
      if (currentImage.imageUrl && currentImage.imageUrl.startsWith('https://')) {
        imageSource = currentImage.imageUrl;
        console.log('✅ [handleTranslateImage] 使用图片URL:', imageSource);
      }
      // 如果是local:// URL或没有URL，则使用本地文件
      else if (currentImage.hasLocal) {
        try {
          const localFile = await localImageManager.getLocalImageFile(currentImage.id);
          if (localFile) {
            // 读取文件为ArrayBuffer
            const arrayBuffer = await localFile.read({ format: require('uxp').storage.formats.binary });
            imageSource = arrayBuffer;
            console.log('✅ [handleTranslateImage] 使用本地文件，大小:', arrayBuffer.byteLength);
          }
        } catch (error) {
          console.warn('⚠️ [handleTranslateImage] 读取本地文件失败:', error);
        }
      }

      if (!imageSource) {
        throw new Error('无法获取图片源（既没有URL也没有本地文件）');
      }

      // 调用翻译API
      const translatedImageUrl = await translateImage(imageSource, {
        sourceLang: 'CHS',  // 源语言：中文
        targetLang: 'ENG',  // 目标语言：英文
        filename: currentImage.id ? `${currentImage.id}.png` : 'image.png',
        mimeType: 'image/png'
      });

      console.log('✅ [handleTranslateImage] 翻译成功（完整URL）:', translatedImageUrl);
      console.log('✅ [handleTranslateImage] URL长度:', translatedImageUrl.length);

      setTranslatedImage(translatedImageUrl);
      console.log('✅ [handleTranslateImage] setTranslatedImage已调用，传入值:', translatedImageUrl);
      setCompareMode(true);

      setToast({
        open: true,
        message: '图片翻译成功',
        type: 'success'
      });

    } catch (error) {
      console.error('❌ [handleTranslateImage] 翻译失败:', error);
      setToast({
        open: true,
        message: `翻译失败: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsTranslating(false);
    }
  }, [previewMode]);

  /**
   * 退出对比模式
   */
  const handleExitCompare = useCallback(() => {
    console.log('🔙 [handleExitCompare] 退出对比模式');
    setCompareMode(false);
    setTranslatedImage(null);
    setComparePosition(50);
  }, []);

  /**
   * 应用翻译结果（同意按钮）
   * 下载翻译后的图片并更新索引
   */
  const handleApplyTranslation = useCallback(async () => {
    const currentImage = previewMode.imageList[previewMode.currentImageIndex];
    if (!currentImage || !translatedImage) {
      console.warn('❌ [handleApplyTranslation] 未找到当前图片或翻译结果');
      return;
    }

    try {
      setIsApplyingTranslation(true);
      console.log('✅ [handleApplyTranslation] 开始应用翻译结果:', translatedImage);

      // 1. 下载翻译后的图片
      console.log('📥 [handleApplyTranslation] 下载翻译后的图片...');
      const response = await fetch(translatedImage);
      if (!response.ok) {
        throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      console.log('✅ [handleApplyTranslation] 图片下载成功, 大小:', arrayBuffer.byteLength);

      // 2. 获取当前图片的信息
      const imageInfo = localImageManager.getImageInfo(currentImage.id);
      if (!imageInfo) {
        throw new Error('未找到图片信息');
      }
      console.log('📝 [handleApplyTranslation] 图片信息:', imageInfo);

      // 3. 保存图片到本地（使用翻译后的URL生成文件名）
      const productFolder = await localImageManager.getOrCreateProductFolder(imageInfo.applyCode);

      // 从翻译后的URL生成文件名（包含-f后缀）
      const localFilePath = localImageManager.generateLocalFilename({
        imageUrl: translatedImage, // 使用翻译后的URL
        applyCode: imageInfo.applyCode
      });
      const fileName = localFilePath.split('/')[1];

      console.log('💾 [handleApplyTranslation] 从翻译URL生成文件名:', fileName);
      console.log('💾 [handleApplyTranslation] 完整localPath:', `${imageInfo.applyCode}/${fileName}`);

      const fs = require('uxp').storage.localFileSystem;
      const formats = require('uxp').storage.formats;
      const localFile = await productFolder.createFile(fileName, { overwrite: true });
      console.log('📁 [handleApplyTranslation] 文件已创建:', localFile.name);

      await localFile.write(arrayBuffer, { format: formats.binary });
      console.log('✅ [handleApplyTranslation] 文件已写入, 大小:', arrayBuffer.byteLength, '字节');
      console.log('📂 [handleApplyTranslation] 文件保存路径:', localFile.nativePath);

      // 4. 更新索引中的图片URL
      console.log('📝 [handleApplyTranslation] 更新索引数据...');
      console.log('📝 [handleApplyTranslation] imageInfo:', JSON.stringify(imageInfo, null, 2));
      console.log('📝 [handleApplyTranslation] currentImage:', JSON.stringify(currentImage, null, 2));

      const product = localImageManager.getOrCreateProduct(imageInfo.applyCode);
      console.log('📝 [handleApplyTranslation] product结构:', {
        originalImagesCount: product.originalImages?.length || 0,
        senceImagesCount: product.senceImages?.length || 0,
        publishSkusCount: product.publishSkus?.length || 0
      });

      // 根据imageInfo找到对应的图片记录并更新
      let targetImageInfo = null;
      if (imageInfo.imageType === 'scene') {
        // 场景图片
        console.log('🔍 [handleApplyTranslation] 在场景图片中查找...');
        targetImageInfo = product.senceImages?.find(img => {
          console.log('  比较:', img.imageUrl, '===', currentImage.imageUrl, '?', img.imageUrl === currentImage.imageUrl);
          return img.imageUrl === currentImage.imageUrl;
        });
      } else if (imageInfo.skuIndex !== undefined) {
        // SKU图片
        console.log('🔍 [handleApplyTranslation] 在SKU图片中查找, skuIndex:', imageInfo.skuIndex);
        const sku = product.publishSkus?.find(s => s.skuIndex === imageInfo.skuIndex);
        if (sku) {
          targetImageInfo = sku.skuImages?.find(img => {
            console.log('  比较:', img.imageUrl, '===', currentImage.imageUrl, '?', img.imageUrl === currentImage.imageUrl);
            return img.imageUrl === currentImage.imageUrl;
          });
        } else {
          console.warn('⚠️ [handleApplyTranslation] 未找到对应的SKU');
        }
      } else {
        // 原始图片
        console.log('🔍 [handleApplyTranslation] 在原始图片中查找...');
        targetImageInfo = product.originalImages?.find(img => {
          console.log('  比较:', img.imageUrl, '===', currentImage.imageUrl, '?', img.imageUrl === currentImage.imageUrl);
          return img.imageUrl === currentImage.imageUrl;
        });
      }

      console.log('🔍 [handleApplyTranslation] 查找结果 targetImageInfo:', targetImageInfo ? '找到' : '未找到');

      if (targetImageInfo) {
        // 更新图片信息：保存本地路径并更新状态
        const localPath = `${imageInfo.applyCode}/${fileName}`;
        targetImageInfo.imageUrl = translatedImage; // 远程URL（翻译后的）
        targetImageInfo.localPath = localPath; // 本地路径（包含-f后缀）
        targetImageInfo.hasLocal = true; // 标记已有本地文件
        targetImageInfo.status = 'pending_edit'; // 翻译后待编辑
        targetImageInfo.timestamp = Date.now();
        targetImageInfo.fileSize = arrayBuffer.byteLength;
        console.log('✅ [handleApplyTranslation] 索引数据已更新:', {
          imageUrl: targetImageInfo.imageUrl,
          localPath: targetImageInfo.localPath,
          hasLocal: targetImageInfo.hasLocal,
          status: targetImageInfo.status,
          fileSize: targetImageInfo.fileSize
        });
      } else {
        console.warn('⚠️ [handleApplyTranslation] 未在索引中找到对应的图片记录');
      }

      // 5. 保存索引数据
      await localImageManager.saveIndexData();
      console.log('💾 [handleApplyTranslation] 索引数据已保存');

      // 6. 关闭对比模式
      setCompareMode(false);
      setTranslatedImage(null);
      setComparePosition(50);

      // 7. 关闭预览弹窗
      setPreviewMode({ active: false, imageList: [], currentImageIndex: 0 });

      // 8. 显示成功提示
      setToast({
        open: true,
        message: '翻译应用成功，图片已更新',
        type: 'success'
      });

      // 9. 刷新页面数据 - 重新从索引文件加载
      console.log('🔄 [handleApplyTranslation] 刷新页面数据...');
      await initializeImageData();

    } catch (error) {
      console.error('❌ [handleApplyTranslation] 应用翻译失败:', error);
      setToast({
        open: true,
        message: `应用翻译失败: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsApplyingTranslation(false);
    }
  }, [previewMode, translatedImage]);

  /**
   * 对比滑块拖动逻辑
   */
  const isDraggingSlider = useRef(false);
  const sliderContainerRef = useRef(null);

  const handleSliderMouseDown = useCallback(() => {
    isDraggingSlider.current = true;
  }, []);

  const handleSliderMouseMove = useCallback((e) => {
    if (!isDraggingSlider.current || !sliderContainerRef.current) return;

    const container = sliderContainerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    setComparePosition(percentage);
  }, []);

  const handleSliderMouseUp = useCallback(() => {
    isDraggingSlider.current = false;
  }, []);

  // 监听对比模式的鼠标事件
  useEffect(() => {
    if (!compareMode) return;

    document.addEventListener('mousemove', handleSliderMouseMove);
    document.addEventListener('mouseup', handleSliderMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleSliderMouseMove);
      document.removeEventListener('mouseup', handleSliderMouseUp);
    };
  }, [compareMode, handleSliderMouseMove, handleSliderMouseUp]);

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

      // 立即更新状态为"编辑中"
      console.log('🔄 [handleOpenImageInPS] 更新状态为编辑中:', imageId);

      // 1. 更新本地索引数据（持久化）
      try {
        await localImageManager.setImageStatus(imageId, 'editing');
        console.log('✅ [handleOpenImageInPS] 本地索引状态已更新为 editing');
      } catch (statusError) {
        console.error('❌ [handleOpenImageInPS] 更新本地索引状态失败:', statusError);
        // 继续执行UI更新，即使索引更新失败
      }

      // 2. 更新编辑中状态集合
      setEditingImages(prev => new Set([...prev, imageId]));

      // 3. 更新图片组状态，更新localStatus字段
      updateImageStatusInState(imageId, 'editing');

      console.log('✅ [handleOpenImageInPS] 状态已完整更新为编辑中');

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
    console.log(`🖱️ [handleSmartMouseClick] 点击事件触发:`, {
      eventType: event.type,
      imageId: imageId.substring(0, 50) + '...',
      isDragging: dragState.isDragging,
      draggedImageId: dragState.draggedImageId ? dragState.draggedImageId.substring(0, 50) + '...' : null
    });

    // 关键：检查是否正在拖拽，避免与拖拽排序冲突
    if (dragState.isDragging) {
      console.warn(`🚫 [handleSmartMouseClick] 正在拖拽中，忽略点击事件`);
      console.warn(`⚠️ [handleSmartMouseClick] 拖拽状态异常！dragState.isDragging 应该在拖拽结束后被重置为 false`);
      console.warn(`💡 [handleSmartMouseClick] 提示：如果看到此消息，说明 handleDrop 或 handleDragEnd 没有正确重置状态`);
      return;
    }

    // 调试：检查事件对象
    console.log(`🐛 [DEBUG] 事件详情:`, {
      type: event.type,
      button: event.button,
      which: event.which,
      buttons: event.buttons
    });

    // 阻止默认行为
    event.preventDefault();
    event.stopPropagation();

    // 根据事件类型判断操作
    if (event.type === 'click') {
      // 左键点击 - 打开预览
      console.log(`👈 [handleSmartMouseClick] 左键预览: ${imageId.substring(0, 50)}...`);
      handleImageClick(imageId, imageUrl);

    } else if (event.type === 'contextmenu') {
      // 右键上下文菜单 - 在PS中打开
      console.log(`👉 [handleSmartMouseClick] 右键在PS中打开: ${imageId.substring(0, 50)}...`);
      handleOpenImageInPS(imageId, imageUrl);

    } else {
      // 其他事件类型 - 忽略
      console.log(`🚫 [handleSmartMouseClick] 忽略事件类型: ${event.type}`);
      return;
    }
  }, [dragState.isDragging, dragState.draggedImageId, handleImageClick, handleOpenImageInPS]);

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
            返回
          </button>
          <div className="product-info">
            <h1 className="product-title">{currentProduct.productName}</h1>
            <div className="product-code">
              <span>编号: {currentProduct.applyCode}</span>
              <button className="copy-code-btn" onClick={handleCopyProductCode}>
                复制
              </button>
            </div>
            {currentProduct.chinesePackageList && (
              <div className="product-package-info">
                <span className="package-label">包装信息: </span>
                <span className="package-value">
                  {Array.isArray(currentProduct.chinesePackageList)
                    ? currentProduct.chinesePackageList.join(' / ')
                    : currentProduct.chinesePackageList}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <div
            className="submit-btn"
            onClick={() => {
              initializeImageData();
            }}
            title="刷新页面数据"
            role="div"
            tabIndex="0"
          >
            刷新
          </div>
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
          {currentProduct.status === 3 && (
            <button
              className={`detail-reject-btn ${isRejecting ? 'rejecting' : ''}`}
              onClick={handleRejectProduct}
              disabled={isRejecting}
            >
              {isRejecting ? '驳回中...' : '驳回'}
            </button>
          )}
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

      {/* 批量删除确认对话框 */}
      {deletingGroup && (
        <div className="error-banner" style={{ background: '#fff3cd', borderColor: '#ffeaa7', color: '#856404' }}>
          <div style={{ flex: 1 }}>
            <div className="error-text" style={{ marginBottom: '6px' }}>
              确定要删除 <strong>{deletingGroup.title}</strong> 的全部 <strong>{deletingGroup.count}</strong> 张图片吗？
            </div>
            <div className="error-text" style={{ fontSize: '10px', marginBottom: '6px', color: '#856404' }}>
              （仅从列表中移除，本地文件保留）
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                id="dontAskAgainBatch"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                style={{
                  width: '12px',
                  height: '12px',
                  cursor: 'pointer'
                }}
              />
              <label
                htmlFor="dontAskAgainBatch"
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
              onClick={handleExecuteDeleteGroup}
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
              onClick={handleCancelDeleteGroup}
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

      {/* 批量翻译进度条 */}
      {translateProgress && (
        <div className="upload-progress-container">
          <div className="upload-progress-header">
            <span className="upload-progress-text">
              {translateProgress.completed >= translateProgress.total ? '翻译完成' : '翻译中'} {translateProgress.completed || 0}/{translateProgress.total || 0}
              {translateProgress.running > 0 && ` (${translateProgress.running}个进行中)`}
              {translateProgress.failed > 0 && ` | ❌${translateProgress.failed}`}
            </span>
            <div className="upload-progress-percent">
              {translateProgress.total > 0 ? Math.round(((translateProgress.completed || 0) / translateProgress.total) * 100) : 0}%
            </div>
          </div>
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{
                width: translateProgress.total > 0 ? `${((translateProgress.completed || 0) / translateProgress.total) * 100}%` : '0%'
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
                    key={`original-${image.id}`}
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
                        onImageInfoLoad={(info) => handleImageInfoLoad(image.id, info)}
                      />
                    </div>
                    {/* 图片信息显示 */}
                    {imageMetaMap[image.id] && (
                      <div className="image-info-display">
                        <span className="image-dimension">
                          {imageMetaMap[image.id].width}×{imageMetaMap[image.id].height}
                        </span>
                        /
                        <span className="image-size">
                          {formatFileSize(imageMetaMap[image.id].fileSize)}
                        </span>
                      </div>
                    )}
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
          <div key={sku.skuIndex || skuIndex} className="sku-group">
              <div className="sku-header">
                <h3>{sku.skuTitle} ({sku.images.length})</h3>
                <div className="sku-actions">
                  {skuIndex === 0 && virtualizedImageGroups.skus.length > 1 && (
                    <div className="sku-batch-actions">
                      {!batchSyncMode ? (
                        <button className="batch-sync-btn" onClick={handleStartBatchSync}>
                          批量同步
                        </button>
                      ) : (
                        <div className="batch-sync-controls">
                          <button
                            className="sync-btn"
                            disabled={selectedImages.size === 0 || syncingBatch}
                            onClick={handleExecuteSync}
                          >
                            同步 ({selectedImages.size})
                          </button>
                          <button className="cancel-btn" onClick={handleCancelBatchSync}>
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {sku.images.length > 0 && (
                    <>
                      <button
                        className="batch-sync-to-ps-btn"
                        onClick={() => handleBatchSyncGroupToPS('sku', sku.skuIndex || skuIndex)}
                        disabled={syncingGroupToPS?.type === 'sku' && syncingGroupToPS?.skuIndex === (sku.skuIndex || skuIndex)}
                        title={`批量同步${sku.skuTitle}的所有图片到PS`}
                      >
                        {syncingGroupToPS?.type === 'sku' && syncingGroupToPS?.skuIndex === (sku.skuIndex || skuIndex)
                          ? '同步中...'
                          : '批量同步到PS'}
                      </button>
                      <button
                        className="batch-translate-btn"
                        onClick={() => handleBatchTranslateGroup('sku', sku.skuIndex || skuIndex)}
                        disabled={translatingGroup?.type === 'sku' && translatingGroup?.skuIndex === (sku.skuIndex || skuIndex)}
                        title={`一键翻译${sku.skuTitle}的所有图片`}
                      >
                        {translatingGroup?.type === 'sku' && translatingGroup?.skuIndex === (sku.skuIndex || skuIndex)
                          ? '翻译中...'
                          : '一键翻译'}
                      </button>
                      <button
                        className="delete-all-btn"
                        onClick={() => handleConfirmDeleteGroup('sku', sku.skuIndex || skuIndex)}
                        title={`一键删除${sku.skuTitle}的所有图片`}
                      >
                        一键删除
                      </button>
                    </>
                  )}
                </div>
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
                      key={`sku-${sku.skuIndex || skuIndex}-${image.id}`}
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
                          {/* 批量同步模式下的勾选框（仅第一个SKU） */}
                          {batchSyncMode && skuIndex === 0 && (
                            <div className="image-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedImages.has(image.id)}
                                onChange={() => handleToggleImageSelection(image.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                          <div
                            className={`top-delete-btn ${batchSyncMode && skuIndex === 0 ? 'disabled' : ''}`}
                            onClick={batchSyncMode && skuIndex === 0 ? undefined : () => handleConfirmDelete(image)}
                            title={batchSyncMode && skuIndex === 0 ? "批量同步模式下不可删除" : "删除图片"}
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
                          onImageInfoLoad={(info) => handleImageInfoLoad(image.id, info)}
                        />
                      </div>
                      {/* 图片信息显示 */}
                      {imageMetaMap[image.id] && (
                        <div className="image-info-display">
                          <span className="image-dimension">
                            {imageMetaMap[image.id].width}×{imageMetaMap[image.id].height}
                          </span>
                          /
                          <span className="image-size">
                            {formatFileSize(imageMetaMap[image.id].fileSize)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* 添加图片按钮 */}
                <div
                  className="add-image-btn in-grid"
                  onClick={() => handleAddImage('sku', sku.skuIndex || skuIndex)}
                  role="button"
                  tabIndex="0"
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, sku.images.length, 'sku', sku.skuIndex || skuIndex)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, sku.images.length, 'sku', sku.skuIndex || skuIndex)}
                >
                  + 添加图片
                <div className="format-hint">(支持PNG、JPG格式)</div>
                </div>
              </div>
            </div>
        ))}

        {/* 场景图片 */}
        <div className="scene-images">
            <div className="section-header">
              <h3>场景图片 ({virtualizedImageGroups.scenes.length})</h3>
              {virtualizedImageGroups.scenes.length > 0 && (
                <div className="section-actions">
                  <button
                    className="batch-sync-to-ps-btn"
                    onClick={() => handleBatchSyncGroupToPS('scene')}
                    disabled={syncingGroupToPS?.type === 'scene'}
                    title="批量同步所有场景图片到PS"
                  >
                    {syncingGroupToPS?.type === 'scene' ? '同步中...' : '批量同步到PS'}
                  </button>
                  <button
                    className="batch-translate-btn"
                    onClick={() => handleBatchTranslateGroup('scene')}
                    disabled={translatingGroup?.type === 'scene'}
                    title="一键翻译所有场景图片"
                  >
                    {translatingGroup?.type === 'scene' ? '翻译中...' : '一键翻译'}
                  </button>
                  <button
                    className="delete-all-btn"
                    onClick={() => handleConfirmDeleteGroup('scene')}
                    title="一键删除所有场景图片"
                  >
                    一键删除
                  </button>
                </div>
              )}
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
                    key={`scene-${image.id}`}
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
                        onImageInfoLoad={(info) => handleImageInfoLoad(image.id, info)}
                      />
                    </div>
                    {/* 图片信息显示 */}
                    {imageMetaMap[image.id] && (
                      <div className="image-info-display">
                        <span className="image-dimension">
                          {imageMetaMap[image.id].width}×{imageMetaMap[image.id].height}
                        </span>
                        /
                        <span className="image-size">
                          {formatFileSize(imageMetaMap[image.id].fileSize)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 添加图片按钮 */}
              <div
                className="add-image-btn in-grid"
                onClick={() => handleAddImage('scene')}
                role="button"
                tabIndex="0"
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, (productData.senceImages || []).length, 'scene')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, (productData.senceImages || []).length, 'scene')}
              >
                + 添加图片
                <div className="format-hint">(支持PNG、JPG格式)</div>
              </div>
            </div>
          </div>
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
                <div className="preview-image-info">
                  <span className="preview-image-meta">
                    {previewMode.imageList[previewMode.currentImageIndex]?.imageUrl && (
                      <>名称: {previewMode.imageList[previewMode.currentImageIndex].imageUrl.split('/').pop().split('?')[0]}</>
                    )}
                  </span>
                  <span className="preview-image-meta">
                    {previewImageMeta.width && previewImageMeta.height && (
                      <>尺寸: {previewImageMeta.width} x {previewImageMeta.height}</>
                    )}
                  </span>
                  <span className="preview-image-meta">
                    {previewImageMeta.fileSize && (
                      <>大小: {formatFileSize(previewImageMeta.fileSize)}</>
                    )}
                  </span>
                </div>
                <button className="preview-close" onClick={handleClosePreview}>
                  ×
                </button>
              </div>

              {/* 预览图片区域 */}
              <div className="preview-image-container" ref={sliderContainerRef}>
                {!compareMode ? (
                  /* 普通模式：显示单张图片 */
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
                    onImageInfoLoad={(info) => setPreviewImageMeta(info)}
                  />
                ) : (
                  /* 对比模式：显示前后对比 */
                  <div className="image-compare-container" ref={compareContainerRef}>
                    {/* 左侧：原图 */}
                    <div
                      className="compare-image-before"
                      style={{
                        width: `${comparePosition}%`
                      }}
                    >
                      <div style={{ width: compareContainerWidth || '100%', height: '100%', position: 'absolute', left: 0, top: 0 }}>
                        <LocalImage
                          imageUrl={previewMode.imageList[previewMode.currentImageIndex]?.imageUrl}
                          alt="原图"
                          hasLocal={previewMode.imageList[previewMode.currentImageIndex]?.hasLocal}
                          onImageInfoLoad={(info) => setPreviewImageMeta(info)}
                          isCompareMode={true}
                        />
                      </div>
                      <div className="compare-label compare-label-before">原图</div>
                    </div>

                    {/* 右侧：翻译后的图片 */}
                    <div
                      className="compare-image-after"
                      style={{
                        width: `${100 - comparePosition}%`
                      }}
                    >
                      {console.log('🔍 [对比模式] 渲染翻译图片，translatedImage（完整）:', translatedImage, '容器宽度:', compareContainerWidth)}
                      <div style={{ width: compareContainerWidth || '100%', height: '100%', position: 'absolute', right: 0, top: 0 }}>
                        <LocalImage
                          imageUrl={translatedImage}
                          alt="翻译后"
                          hasLocal={false}
                          isCompareMode={true}
                        />
                      </div>
                      <div className="compare-label compare-label-after">翻译后</div>
                    </div>

                    {/* 可拖动滑块 */}
                    <div
                      className="compare-slider"
                      style={{ left: `${comparePosition}%` }}
                      onMouseDown={handleSliderMouseDown}
                    >
                      <div className="compare-handle">
                        <span>◀</span>
                        <span>▶</span>
                      </div>
                    </div>
                  </div>
                )}

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
                    className={`complete-btn ${previewMode.imageList[previewMode.currentImageIndex]?.isCompleted || completedImages.has(previewMode.currentImageId) ? 'completed' : ''}`}
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
                  <button
                    className="copy-path-btn"
                    onClick={async () => {
                      const currentImage = previewMode.imageList[previewMode.currentImageIndex];
                      try {
                        const localPath = localImageManager.getLocalImagePath(currentImage.id);
                        if (localPath) {
                          await navigator.clipboard.writeText(localPath);
                          setToast({
                            open: true,
                            message: `文件路径已复制: ${localPath}`,
                            type: 'success'
                          });
                        } else {
                          setToast({
                            open: true,
                            message: '未找到本地文件路径',
                            type: 'warning'
                          });
                        }
                      } catch (error) {
                        console.error('复制文件路径失败:', error);
                        setToast({
                          open: true,
                          message: '复制文件路径失败: ' + error.message,
                          type: 'error'
                        });
                      }
                    }}
                  >
                    复制文件路径
                  </button>

                  {/* 翻译和对比模式按钮 */}
                  {!compareMode ? (
                    <button
                      className="translate-btn"
                      onClick={handleTranslateImage}
                      disabled={isTranslating}
                    >
                      {isTranslating ? '翻译中...' : '翻译'}
                    </button>
                  ) : (
                    <>
                      <button
                        className="compare-action-btn apply-btn"
                        onClick={handleApplyTranslation}
                        disabled={isApplyingTranslation}
                      >
                        {isApplyingTranslation ? '应用中...' : '同意'}
                      </button>
                      <button
                        className="compare-action-btn cancel-btn"
                        onClick={handleExitCompare}
                        disabled={isApplyingTranslation}
                      >
                        取消
                      </button>
                    </>
                  )}
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

      {/* Toast 提示组件 */}
      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        duration={3000}
        onClose={() => setToast({ ...toast, open: false })}
      />

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