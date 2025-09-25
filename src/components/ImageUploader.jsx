import React, { useState, useEffect, useRef } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import { uploadImageToServer } from '../panels/photoshop-api.js';
import './ImageUploader.css';

/**
 * 图片批量上传组件
 * 在审核提交前上传所有修改过的本地图片到云端
 */
const ImageUploader = ({
  onComplete = null,
  onError = null,
  onProgress = null,
  autoStart = false,
  showProgress = true,
  applyCode = '',
  userId = '',
  userCode = ''
}) => {
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, loading, uploading, completed, error
  const [progress, setProgress] = useState({ current: 0, total: 0, currentImage: null });
  const [uploadResults, setUploadResults] = useState(null);
  const [errors, setErrors] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [modifiedImages, setModifiedImages] = useState([]);

  const uploadingRef = useRef(false);
  const timerRef = useRef(null);

  // 组件挂载时检查是否有需要上传的图片
  useEffect(() => {
    loadModifiedImages();
  }, []);

  // 自动开始上传
  useEffect(() => {
    if (autoStart && modifiedImages.length > 0 && !uploadingRef.current) {
      handleStartUpload();
    }
  }, [autoStart, modifiedImages]);

  // 计时器
  useEffect(() => {
    if (uploadStatus === 'uploading' && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [uploadStatus, startTime]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  /**
   * 加载需要上传的修改图片
   */
  const loadModifiedImages = async () => {
    try {
      setUploadStatus('loading');
      await localImageManager.initialize();

      const modifiedImageList = localImageManager.getModifiedImages();
      console.log('发现需要上传的图片:', modifiedImageList);

      setModifiedImages(modifiedImageList);

      if (modifiedImageList.length > 0) {
        setIsVisible(true);
        setUploadStatus('idle');
      } else {
        setUploadStatus('completed');
        console.log('没有需要上传的图片');
      }
    } catch (error) {
      console.error('加载修改图片失败:', error);
      setUploadStatus('error');
      setErrors([{ error: error.message, imageInfo: null }]);
    }
  };

  /**
   * 开始上传
   */
  const handleStartUpload = async () => {
    if (uploadingRef.current || modifiedImages.length === 0) {
      return;
    }

    console.log(`开始批量上传 ${modifiedImages.length} 张修改图片`);

    uploadingRef.current = true;
    setUploadStatus('uploading');
    setProgress({ current: 0, total: modifiedImages.length, currentImage: null });
    setUploadResults(null);
    setErrors([]);
    setStartTime(Date.now());
    setElapsedTime(0);

    const results = {
      success: 0,
      failed: 0,
      errors: [],
      newUrls: {} // imageId -> newUrl
    };

    try {
      // 逐个上传图片
      for (let i = 0; i < modifiedImages.length; i++) {
        const imageInfo = modifiedImages[i];
        const { imageId } = imageInfo;

        try {
          setProgress(prev => ({ ...prev, current: i, currentImage: imageInfo }));

          // 获取修改后的文件
          const modifiedFile = await getModifiedImageFile(imageInfo);
          if (!modifiedFile) {
            throw new Error('无法获取修改后的图片文件');
          }

          // 读取文件数据
          const imageBuffer = await modifiedFile.read({ format: require('uxp').storage.formats.binary });

          // 上传到服务器
          console.log(`上传图片 ${imageId}...`);
          const uploadResult = await uploadImageToServer(
            imageBuffer,
            { filename: `${imageId}_${Date.now()}.png` },
            applyCode,
            userId,
            userCode
          );

          if (uploadResult && uploadResult.url) {
            // 标记图片为已上传
            await localImageManager.markImageAsUploaded(imageId, uploadResult.url);
            results.success++;
            results.newUrls[imageId] = uploadResult.url;
            console.log(`✅ 图片 ${imageId} 上传成功: ${uploadResult.url}`);
          } else {
            throw new Error('服务器未返回有效的图片URL');
          }

        } catch (error) {
          results.failed++;
          results.errors.push({ imageId, error: error.message });
          setErrors(prev => [...prev, { error: error.message, imageInfo }]);
          console.error(`❌ 图片 ${imageId} 上传失败:`, error.message);
        }

        // 更新进度
        const currentProgress = i + 1;
        setProgress(prev => ({ ...prev, current: currentProgress }));

        if (onProgress) {
          onProgress(currentProgress, modifiedImages.length, imageInfo);
        }
      }

      setUploadResults(results);

      if (results.failed === 0) {
        setUploadStatus('completed');
        console.log('✅ 所有图片上传完成');

        if (onComplete) {
          onComplete(results);
        }
      } else {
        setUploadStatus('error');
        console.warn(`⚠️ 上传完成但有 ${results.failed} 张图片失败`);

        if (onError) {
          onError(new Error(`${results.failed} 张图片上传失败`), results);
        }
      }

    } catch (error) {
      console.error('❌ 批量上传失败:', error);
      setUploadStatus('error');
      setErrors(prev => [...prev, { error: error.message, imageInfo: null }]);

      if (onError) {
        onError(error, results);
      }
    } finally {
      uploadingRef.current = false;
    }
  };

  /**
   * 获取修改后的图片文件
   * @param {Object} imageInfo 图片信息
   * @returns {Promise<File>} 修改后的文件
   */
  const getModifiedImageFile = async (imageInfo) => {
    const { imageId, modifiedPath, localPath } = imageInfo;

    if (!localImageManager.imageFolder) {
      throw new Error('图片存储目录未初始化');
    }

    // 优先使用修改后的文件
    if (modifiedPath) {
      try {
        const modifiedFile = await localImageManager.imageFolder.getEntry(modifiedPath);
        return modifiedFile;
      } catch (error) {
        console.warn(`获取修改文件失败 ${imageId}:`, error.message);
      }
    }

    // 回退到原始本地文件
    if (localPath) {
      try {
        const originalFile = await localImageManager.imageFolder.getEntry(localPath);
        return originalFile;
      } catch (error) {
        console.warn(`获取原始文件失败 ${imageId}:`, error.message);
      }
    }

    throw new Error(`无法找到图片文件: ${imageId}`);
  };

  /**
   * 重试上传
   */
  const handleRetry = () => {
    if (uploadingRef.current) {
      return;
    }
    loadModifiedImages().then(() => {
      handleStartUpload();
    });
  };

  /**
   * 关闭上传对话框
   */
  const handleClose = () => {
    if (uploadStatus === 'uploading') {
      return; // 上传中不允许关闭
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
   * 计算上传速度
   */
  const getUploadSpeed = () => {
    if (!uploadResults || elapsedTime === 0) {
      return '';
    }

    const imagesPerSecond = uploadResults.success / (elapsedTime / 1000);
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

  // 当没有图片需要上传时
  if (uploadStatus === 'completed' && modifiedImages.length === 0) {
    return null;
  }

  return (
    <div className="image-uploader-overlay">
      <div className="image-uploader-dialog">
        <div className="image-uploader-header">
          <h3>图片上传</h3>
          {uploadStatus !== 'uploading' && (
            <button className="close-btn" onClick={handleClose}>×</button>
          )}
        </div>

        <div className="image-uploader-content">
          {/* 状态显示 */}
          <div className="upload-status">
            {uploadStatus === 'loading' && (
              <div className="status-loading">
                <div className="status-icon">🔍</div>
                <div className="status-text">正在检查需要上传的图片...</div>
              </div>
            )}

            {uploadStatus === 'idle' && (
              <div className="status-idle">
                <div className="status-icon">📤</div>
                <div className="status-text">
                  发现 {modifiedImages.length} 张修改过的图片需要上传
                </div>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div className="status-uploading">
                <div className="status-icon">⏳</div>
                <div className="status-text">正在上传图片...</div>
                {progress.currentImage && (
                  <div className="current-image">
                    当前: {progress.currentImage.imageId || '未知图片'}
                  </div>
                )}
              </div>
            )}

            {uploadStatus === 'completed' && (
              <div className="status-completed">
                <div className="status-icon">✅</div>
                <div className="status-text">上传完成!</div>
              </div>
            )}

            {uploadStatus === 'error' && (
              <div className="status-error">
                <div className="status-icon">❌</div>
                <div className="status-text">上传遇到问题</div>
              </div>
            )}
          </div>

          {/* 进度条 */}
          {(uploadStatus === 'uploading' || uploadStatus === 'completed' || uploadStatus === 'error') && (
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
          {uploadResults && (
            <div className="upload-stats">
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">成功:</span>
                  <span className="stat-value success">{uploadResults.success}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">失败:</span>
                  <span className="stat-value failed">{uploadResults.failed}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">耗时:</span>
                  <span className="stat-value">{formatElapsedTime(elapsedTime)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">速度:</span>
                  <span className="stat-value">{getUploadSpeed()}</span>
                </div>
              </div>
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
                      {errorItem.imageInfo?.imageId || '未知图片'}:
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
        <div className="image-uploader-actions">
          {uploadStatus === 'loading' && (
            <div className="loading-actions">
              <span className="loading-text">检查中...</span>
            </div>
          )}

          {uploadStatus === 'idle' && (
            <button
              className="btn btn-primary"
              onClick={handleStartUpload}
              disabled={modifiedImages.length === 0}
            >
              开始上传
            </button>
          )}

          {uploadStatus === 'uploading' && (
            <div className="uploading-actions">
              <span className="uploading-text">上传进行中，请稍候...</span>
            </div>
          )}

          {uploadStatus === 'completed' && (
            <button className="btn btn-success" onClick={handleClose}>
              完成
            </button>
          )}

          {uploadStatus === 'error' && (
            <div className="error-actions">
              <button className="btn btn-secondary" onClick={handleRetry}>
                重试上传
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

export default ImageUploader;