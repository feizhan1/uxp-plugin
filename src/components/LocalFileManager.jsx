import React, { useState, useEffect } from 'react';
import { localImageManager } from '../utils/LocalImageManager.js';
import { fileSystemUtils } from '../utils/FileSystemUtils.js';
import './LocalFileManager.css';

/**
 * 本地文件管理器组件
 * 用于查看、管理和清理本地存储的图片文件
 */
const LocalFileManager = ({ onClose }) => {
  const [storageStats, setStorageStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview'); // overview, cleanup
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  /**
   * 加载存储信息
   */
  const loadStorageInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // 初始化管理器
      await localImageManager.initialize();
      await fileSystemUtils.initialize();

      // 获取存储统计
      const stats = await localImageManager.getStorageStats();
      setStorageStats(stats);


      // 获取目录信息
      const pluginPath = fileSystemUtils.getPluginDataPath();
      const dirInfo = await fileSystemUtils.getDirectoryInfo('product-images');

      setStorageInfo({
        pluginDataPath: pluginPath,
        imageDirectory: dirInfo
      });

    } catch (err) {
      console.error('加载存储信息失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 清理过期文件
   */
  const handleCleanup = async () => {
    try {
      setLoading(true);
      const result = await localImageManager.cleanupOldImages();

      // 重新加载数据
      await loadStorageInfo();

      alert(`清理完成：删除了 ${result.deleted} 个过期文件`);
    } catch (err) {
      console.error('清理失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 显示用户消息 (UXP兼容)
   */
  const showMessage = (message) => {
    try {
      // 尝试使用UXP的对话框API
      if (typeof require !== 'undefined') {
        const { entrypoints } = require('uxp');
        if (entrypoints && entrypoints.setup) {
          // 在控制台显示消息
          console.log('📱 用户消息:', message);
          // 可以考虑使用UI反馈替代alert
          setError(message);
          return;
        }
      }

      // 回退到console.log
      console.log('📱 消息:', message);
      setError(message);
    } catch (err) {
      console.log('📱 消息:', message);
      setError(message);
    }
  };

  /**
   * 打开文件夹 - 使用UXP shell.openPath() API
   */
  const handleOpenFolder = async () => {
    try {
      if (!storageInfo?.pluginDataPath) {
        showMessage('无法获取文件夹路径');
        return;
      }

      console.log('🚀 开始尝试直接打开文件夹:', storageInfo.pluginDataPath);
      setError(null);

      // 获取实际文件夹路径
      let actualPath = storageInfo.pluginDataPath;
      let folderExists = false;

      // 验证文件夹存在
      try {
        if (fileSystemUtils && fileSystemUtils.initialized) {
          const pluginFolder = fileSystemUtils.pluginDataFolder;
          if (pluginFolder && pluginFolder.nativePath) {
            folderExists = true;
            actualPath = pluginFolder.nativePath;
            console.log('✅ 文件夹验证成功:', actualPath);
          }
        }
      } catch (fsError) {
        console.warn('文件夹验证失败:', fsError);
      }

      // 🎯 macOS/Windows：UXP限制导致无法自动打开文件夹
      // 改为优化剪贴板复制体验，让用户可以快速访问
      let directOpenSuccess = false;

      // 🔄 备选方案1：尝试通过临时批处理文件打开（Windows）
      if (!directOpenSuccess && typeof require !== 'undefined') {
        try {
          const os = require('os');
          const { shell } = require('uxp');

          if (os.platform() === 'win32' && shell && shell.openPath) {
            console.log('🔄 尝试通过临时批处理文件打开...');

            // 创建临时批处理文件
            const batchContent = `@echo off\nstart "" explorer "${actualPath}"\n`;
            const tempBatFile = await fileSystemUtils.createTempFile('open_folder.bat', batchContent, 'utf8');

            if (tempBatFile) {
              await shell.openPath(tempBatFile.nativePath);
              directOpenSuccess = true;
              console.log('🎉 通过批处理文件成功打开文件夹！');

              setError('✅ 文件夹已在资源管理器中打开！');
              setTimeout(() => setError(null), 3000);
              return;
            }
          }
        } catch (batchError) {
          console.warn('❌ 批处理文件方法失败:', batchError);
        }
      }

      // 🔄 备选方案2：尝试复制路径到剪贴板并显示指导
      let clipboardSuccess = false;
      try {
        if (typeof require !== 'undefined') {
          const { clipboard } = require('uxp');
          if (clipboard && clipboard.writeText) {
            await clipboard.writeText(actualPath);
            clipboardSuccess = true;
            console.log('✅ 使用UXP剪贴板API复制成功');
          }
        }
      } catch (clipError) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(actualPath);
            clipboardSuccess = true;
            console.log('✅ 使用标准剪贴板API复制成功');
          }
        } catch (standardError) {
          console.warn('剪贴板操作失败:', standardError);
        }
      }

      // 📝 显示手动操作指导
      let message = `📁 插件数据目录位置：\n${actualPath}\n\n`;

      if (!directOpenSuccess) {
        message += `ℹ️ 自动打开失败，请手动操作：\n\n`;
      }

      if (folderExists) {
        message += `✅ 文件夹已确认存在\n\n`;
      }

      // 根据操作系统提供不同的指引
      const os = require('os');
      const isMac = os.platform() === 'darwin';

      message += `🔧 手动打开步骤：\n`;
      if (isMac) {
        message += `1. 打开 Finder\n`;
        message += `2. 按 Cmd+Shift+G（前往文件夹）\n`;
        message += `3. 粘贴路径 (Cmd+V)\n`;
        message += `4. 按回车键访问\n\n`;
      } else {
        message += `1. 打开文件管理器 (Windows资源管理器)\n`;
        message += `2. 点击地址栏或按 Ctrl+L\n`;
        message += `3. 粘贴路径 (Ctrl+V)\n`;
        message += `4. 按回车键访问\n\n`;
      }

      if (clipboardSuccess) {
        message += `💡 路径已自动复制到剪贴板，可直接粘贴！`;
      } else {
        message += `💡 请点击下方"复制路径"按钮复制路径`;
      }

      showMessage(message);

      console.log('📋 操作结果汇总:');
      console.log('直接打开:', directOpenSuccess ? '成功' : '失败');
      console.log('路径:', actualPath);
      console.log('剪贴板:', clipboardSuccess ? '已复制' : '复制失败');
      console.log('文件夹存在:', folderExists ? '是' : '未确认');

    } catch (err) {
      console.error('❌ 打开文件夹操作彻底失败:', err);

      const errorMessage = `⚠️ 无法处理文件夹打开请求\n\n原因：${err.message}\n\n📁 请手动访问路径：\n${storageInfo?.pluginDataPath || '未知路径'}\n\n💡 将此路径复制到文件管理器地址栏中打开`;
      showMessage(errorMessage);
    }
  };

  /**
   * 格式化文件大小
   */
  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  if (loading) {
    return (
      <div className="local-file-manager-overlay">
        <div className="local-file-manager-dialog">
          <div className="loading-container">
            <div className="loading-spinner">⏳</div>
            <div>正在加载存储信息...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="local-file-manager-overlay">
      <div className="local-file-manager-dialog">
        <div className="local-file-manager-header">
          <h3>本地文件管理器</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="local-file-manager-tabs">
          <button
            className={`tab ${selectedTab === 'overview' ? 'active' : ''}`}
            onClick={() => setSelectedTab('overview')}
          >
            概览
          </button>
          <button
            className={`tab ${selectedTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => setSelectedTab('cleanup')}
          >
            清理工具
          </button>
        </div>

        <div className="local-file-manager-content">
          {error && (
            <div className="error-message">
              错误: {error}
            </div>
          )}

          {/* 概览标签页 */}
          {selectedTab === 'overview' && storageStats && (
            <div className="overview-section">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">总图片数</div>
                  <div className="stat-value">{storageStats.totalImages}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">已下载</div>
                  <div className="stat-value">{storageStats.downloadedImages}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">已修改</div>
                  <div className="stat-value">{storageStats.modifiedImages}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">已同步</div>
                  <div className="stat-value">{storageStats.syncedImages}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">总大小</div>
                  <div className="stat-value">{formatSize(storageStats.totalSize)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">最后更新</div>
                  <div className="stat-value">
                    {storageStats.lastUpdate ? storageStats.lastUpdate.toLocaleString() : '无'}
                  </div>
                </div>
              </div>

              {storageInfo && (
                <div className="path-info">
                  <h4>存储路径</h4>
                  <div className="path-item">
                    <strong>插件数据目录:</strong>
                    <div className="path-value">
                      <input
                        type="text"
                        value={storageInfo.pluginDataPath}
                        readOnly
                        className="path-input"
                        onClick={(e) => e.target.select()}
                        title="点击选择全部路径，然后Ctrl+C复制"
                      />
                    </div>
                    <div className="path-actions">
                      <button className="btn-small" onClick={handleOpenFolder}>
                        打开文件夹
                      </button>
                      <button
                        className="btn-small"
                        onClick={async () => {
                          console.log('📋 尝试复制路径到剪贴板...');
                          let copySuccess = false;

                          try {
                            // 优先使用UXP剪贴板API
                            if (typeof require !== 'undefined') {
                              const { clipboard } = require('uxp');
                              if (clipboard && clipboard.writeText) {
                                await clipboard.writeText(storageInfo.pluginDataPath);
                                copySuccess = true;
                                console.log('✅ UXP剪贴板API复制成功');
                              }
                            }
                          } catch (uxpError) {
                            console.warn('UXP剪贴板API失败:', uxpError);

                            // 备选：尝试标准API
                            try {
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(storageInfo.pluginDataPath);
                                copySuccess = true;
                                console.log('✅ 标准剪贴板API复制成功');
                              }
                            } catch (standardError) {
                              console.warn('标准剪贴板API失败:', standardError);
                            }
                          }

                          if (copySuccess) {
                            // 根据操作系统提供不同的提示
                            const os = require('os');
                            const isMac = os.platform() === 'darwin';
                            if (isMac) {
                              setError('✅ 路径已复制！在Finder中按 Cmd+Shift+G 然后 Cmd+V 粘贴');
                            } else {
                              setError('✅ 路径已复制！在文件管理器地址栏按 Ctrl+V 粘贴');
                            }
                          } else {
                            // 获取操作系统信息
                            const os = require('os');
                            const isMac = os.platform() === 'darwin';
                            const copyKey = isMac ? 'Cmd+C' : 'Ctrl+C';

                            setError(`💡 请点击路径输入框全选文本，然后按 ${copyKey} 复制`);
                            // 自动选择输入框中的文本
                            const pathInput = document.querySelector('.path-input');
                            if (pathInput) {
                              pathInput.focus();
                              pathInput.select();
                              console.log('📝 已自动选择路径文本，用户可以复制');
                            }
                          }
                          setTimeout(() => setError(null), 5000);
                        }}
                      >
                        📋 复制路径
                      </button>
                    </div>
                  </div>

                  {storageInfo.imageDirectory && (
                    <div className="directory-info">
                      <h5>图片目录信息:</h5>
                      <p>文件数量: {storageInfo.imageDirectory.fileCount}</p>
                      <p>总大小: {formatSize(storageInfo.imageDirectory.totalSize)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {/* 清理工具标签页 */}
          {selectedTab === 'cleanup' && (
            <div className="cleanup-section">
              <h4>存储清理工具</h4>

              <div className="cleanup-options">
                <div className="cleanup-item">
                  <h5>清理过期文件</h5>
                  <p>删除30天前的已同步图片文件，释放存储空间。</p>
                  <button className="btn-warning" onClick={handleCleanup}>
                    清理过期文件
                  </button>
                </div>

                <div className="cleanup-item">
                  <h5>临时文件清理</h5>
                  <p>清理下载和处理过程中产生的临时文件。</p>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      try {
                        await fileSystemUtils.cleanupTempFiles();
                        alert('临时文件清理完成');
                        loadStorageInfo();
                      } catch (err) {
                        alert('清理失败: ' + err.message);
                      }
                    }}
                  >
                    清理临时文件
                  </button>
                </div>

                <div className="cleanup-item danger">
                  <h5>⚠️ 重置所有数据</h5>
                  <p>删除所有本地图片和索引数据。此操作不可撤销！</p>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (confirm('确定要删除所有本地数据吗？此操作不可撤销！')) {
                        try {
                          await localImageManager.reset();
                          alert('数据重置完成');
                          loadStorageInfo();
                        } catch (err) {
                          alert('重置失败: ' + err.message);
                        }
                      }
                    }}
                  >
                    重置所有数据
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="local-file-manager-footer">
          <button className="btn-default" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalFileManager;