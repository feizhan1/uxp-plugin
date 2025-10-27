import React, { useState } from 'react';
import { storageLocationManager } from '../utils/StorageLocationManager.js';
import './StorageSetupDialog.css';

/**
 * 存储位置配置引导对话框
 * 首次使用或存储位置失效时显示
 */
const StorageSetupDialog = ({ onComplete, onCancel, isRetry = false }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 处理选择文件夹
   */
  const handleSelectFolder = async () => {
    try {
      setIsSelecting(true);
      setError(null);

      console.log('📁 [StorageSetupDialog] 开始选择存储文件夹...');

      // 调用存储位置管理器让用户选择文件夹
      const folder = await storageLocationManager.selectFolder();

      if (!folder) {
        // 用户取消选择
        console.log('⚠️ [StorageSetupDialog] 用户取消了文件夹选择');
        setError('必须选择存储位置才能继续使用');
        return;
      }

      console.log('✅ [StorageSetupDialog] 存储位置配置成功:', folder.nativePath);

      // 配置成功，通知父组件
      if (onComplete) {
        onComplete(folder);
      }
    } catch (err) {
      console.error('❌ [StorageSetupDialog] 选择文件夹失败:', err);
      setError(`配置失败: ${err.message}`);
    } finally {
      setIsSelecting(false);
    }
  };

  /**
   * 处理取消
   */
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="storage-setup-overlay">
      <div className="storage-setup-dialog">
        <div className="storage-setup-header">
          <h3>{isRetry ? '重新选择存储位置' : '选择图片存储位置'}</h3>
        </div>

        <div className="storage-setup-content">
          {isRetry ? (
            <div className="setup-message warning">
              <p>存储位置失效，请重新选择文件夹。</p>
            </div>
          ) : (
            <div className="setup-message">
              <p>请选择一个本地文件夹用于存储产品图片。</p>
            </div>
          )}

          <div className="setup-tips">
            <h4>建议:</h4>
            <ul>
              <li>选择硬盘上有足够空间的位置</li>
              <li>建议预留至少 5GB 空间</li>
              <li>避免选择系统盘根目录</li>
              <li>选择本地硬盘以获得最佳性能</li>
            </ul>
          </div>

          <div className="setup-info">
            <p>插件将在您选择的文件夹下创建:</p>
            <div className="path-example">
              {'<您的文件夹>/tvcmall-plugin/product-images/'}
            </div>
          </div>

          {error && (
            <div className="setup-error">
              {error}
            </div>
          )}
        </div>

        <div className="storage-setup-footer">
          <button
            className="btn-primary"
            onClick={handleSelectFolder}
            disabled={isSelecting}
          >
            {isSelecting ? '正在选择...' : '选择文件夹'}
          </button>
        </div>

        {isSelecting && (
          <div className="setup-loading">
            <div className="loading-spinner">⏳</div>
            <div>请在文件选择器中选择文件夹...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageSetupDialog;
