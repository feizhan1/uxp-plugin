import React, { useState, useEffect, useRef } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import './ImageDownloader.css';

/**
 * 图片批量下载组件
 * 登录成功后自动下载所有产品图片到本地
 */
const ImageDownloader = ({
  productImages = [],
  onComplete = null,
  onError = null,
  autoStart = false,
  showProgress = true
}) => {
  const [downloadStatus, setDownloadStatus] = useState('idle'); // idle, downloading, completed, error
  const [progress, setProgress] = useState({ current: 0, total: 0, currentImage: null });
  const [downloadResults, setDownloadResults] = useState(null);
  const [errors, setErrors] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const downloadingRef = useRef(false);
  const timerRef = useRef(null);

  // 自动开始下载
  useEffect(() => {
    console.log('ImageDownloader useEffect 触发:', {
      autoStart,
      productImagesLength: productImages.length,
      isDownloading: downloadingRef.current,
      shouldStart: autoStart && productImages.length > 0 && !downloadingRef.current
    });

    if (autoStart && productImages.length > 0 && !downloadingRef.current) {
      console.log('ImageDownloader 自动开始下载');
      handleStartDownload();
    }
  }, [autoStart, productImages]);

  // 计时器
  useEffect(() => {
    if (downloadStatus === 'downloading' && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [downloadStatus, startTime]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  /**
   * 开始下载
   */
  const handleStartDownload = async () => {
    console.log('handleStartDownload 调用:', {
      isDownloading: downloadingRef.current,
      productImagesLength: productImages.length,
      productImages: productImages.slice(0, 3) // 只显示前3个作为示例
    });

    if (downloadingRef.current || productImages.length === 0) {
      console.log('跳过下载:', {
        isDownloading: downloadingRef.current,
        hasImages: productImages.length > 0
      });
      return;
    }

    console.log(`=== ImageDownloader 开始批量下载 ${productImages.length} 张产品图片 ===`);
    console.log('productImages 详情:', productImages.map(img => ({
      id: img.id,
      url: img.url.substring(0, 50) + '...',
      applyCode: img.applyCode,
      filename: img.filename
    })));

    downloadingRef.current = true;
    setDownloadStatus('downloading');
    setProgress({ current: 0, total: productImages.length, currentImage: null });
    setDownloadResults(null);
    setErrors([]);
    setStartTime(Date.now());
    setElapsedTime(0);
    setIsVisible(true);

    try {
      // 进度回调
      const onProgressCallback = (current, total, currentImage) => {
        console.log(`下载进度: ${current}/${total}, 当前图片:`, currentImage?.id);
        setProgress({ current, total, currentImage });
      };

      // 错误回调
      const onErrorCallback = (error, imageInfo) => {
        setErrors(prev => [...prev, { error: error.message, imageInfo }]);
        console.error('下载图片失败:', imageInfo?.id, error.message);
      };

      console.log('调用 localImageManager.downloadProductImages...');

      // 执行批量下载
      const results = await localImageManager.downloadProductImages(
        productImages,
        onProgressCallback,
        onErrorCallback
      );

      console.log('localImageManager.downloadProductImages 完成，结果:', results);

      // 如果有失败的图片，自动跳过它们
      if (results.failed > 0 && errors.length > 0) {
        console.log(`自动跳过 ${errors.length} 张失败的图片`);
        try {
          const skippedCount = await localImageManager.skipFailedImages(errors);
          console.log(`✅ 已自动跳过 ${skippedCount} 张失败的图片`);

          // 更新结果，将失败的图片计入跳过数
          results.skipped = (results.skipped || 0) + skippedCount;
          results.failed = 0;
        } catch (error) {
          console.error('自动跳过失败的图片时出错:', error);
          // 即使跳过失败，也继续执行，不影响用户体验
        }
      }

      setDownloadResults(results);
      setDownloadStatus('completed');
      console.log('✅ 图片下载完成');

      if (onComplete) {
        onComplete(results);
      }

    } catch (error) {
      console.error('❌ 批量下载失败:', error);
      setDownloadStatus('error');
      setErrors(prev => [...prev, { error: error.message, imageInfo: null }]);

      if (onError) {
        onError(error, null);
      }
    } finally {
      downloadingRef.current = false;
    }
  };

  /**
   * 重试下载
   */
  const handleRetry = () => {
    if (downloadingRef.current) {
      return;
    }
    handleStartDownload();
  };

  /**
   * 关闭下载对话框
   */
  const handleClose = () => {
    if (downloadStatus === 'downloading') {
      return; // 下载中不允许关闭
    }
    setIsVisible(false);
  };

  /**
   * 格式化时间显示
   */
  const formatElapsedTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`;
    }
    return `${remainingSeconds}秒`;
  };

  /**
   * 计算下载速度
   */
  const getDownloadSpeed = () => {
    if (!downloadResults || elapsedTime === 0) {
      return '';
    }

    const imagesPerSecond = downloadResults.success / (elapsedTime / 1000);
    return `${imagesPerSecond.toFixed(1)} 张/秒`;
  };

  /**
   * 获取进度百分比
   */
  const getProgressPercentage = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  // 不显示组件时返回空
  if (!isVisible && !showProgress) {
    return null;
  }

  // 当没有图片需要下载时
  if (productImages.length === 0) {
    return null;
  }

  return (
    <div className="image-downloader-overlay">
      <div className="image-downloader-dialog">
        <div className="image-downloader-header">
          <h3>产品图片下载</h3>
          {downloadStatus !== 'downloading' && (
            <button className="close-btn" onClick={handleClose}>×</button>
          )}
        </div>

        <div className="image-downloader-content">
          {/* 状态显示 */}
          <div className="download-status">
            {downloadStatus === 'idle' && (
              <div className="status-idle">
                <div className="status-icon">📥</div>
                <div className="status-text">准备下载 {productImages.length} 张产品图片</div>
              </div>
            )}

            {downloadStatus === 'downloading' && (
              <div className="status-downloading">
                <div className="status-icon">⏳</div>
                <div className="status-text">正在下载图片...</div>
                {progress.currentImage && (
                  <div className="current-image">
                    当前: {progress.currentImage.id || '未知图片'}
                  </div>
                )}
              </div>
            )}

            {downloadStatus === 'completed' && (
              <div className="status-completed">
                <div className="status-icon">✅</div>
                <div className="status-text">下载完成!</div>
              </div>
            )}

            {downloadStatus === 'error' && (
              <div className="status-error">
                <div className="status-icon">❌</div>
                <div className="status-text">下载遇到问题</div>
              </div>
            )}
          </div>

          {/* 进度条 */}
          {(downloadStatus === 'downloading' || downloadStatus === 'completed' || downloadStatus === 'error') && (
            <div className="progress-section">
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{ width: `${getProgressPercentage()}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {progress.current} / {progress.total} ({getProgressPercentage()}%)
              </div>
            </div>
          )}

          {/* 统计信息 */}
          {downloadResults && (
            <div className="download-stats">
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">成功:</span>
                  <span className="stat-value success">{downloadResults.success}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">跳过:</span>
                  <span className="stat-value skipped">{downloadResults.skipped}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">失败:</span>
                  <span className="stat-value failed">{downloadResults.failed}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">耗时:</span>
                  <span className="stat-value">{formatElapsedTime(elapsedTime)}</span>
                </div>
              </div>

              {downloadStatus === 'completed' && (
                <div className="download-speed">
                  下载速度: {getDownloadSpeed()}
                </div>
              )}
            </div>
          )}

          {/* 错误信息 */}
          {errors.length > 0 && (
            <div className="error-section">
              <h4>错误详情:</h4>
              <div className="error-list">
                {errors.slice(0, 5).map((errorItem, index) => (
                  <div key={index} className="error-item">
                    <span className="error-image">
                      {errorItem.imageInfo?.id || '未知图片'}:
                    </span>
                    <span className="error-message">{errorItem.error}</span>
                  </div>
                ))}
                {errors.length > 5 && (
                  <div className="error-more">
                    还有 {errors.length - 5} 个错误...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="image-downloader-actions">
          {downloadStatus === 'idle' && (
            <button
              className="btn btn-primary"
              onClick={handleStartDownload}
              disabled={productImages.length === 0}
            >
              开始下载
            </button>
          )}

          {downloadStatus === 'downloading' && (
            <div className="downloading-actions">
              <span className="downloading-text">下载进行中，请稍候...</span>
            </div>
          )}

          {downloadStatus === 'completed' && (
            <button className="btn btn-success" onClick={handleClose}>
              完成
            </button>
          )}

          {downloadStatus === 'error' && (
            <div className="error-actions">
              <button className="btn btn-secondary" onClick={handleRetry}>
                重试下载
              </button>
              <button className="btn btn-default" onClick={handleClose}>
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageDownloader;