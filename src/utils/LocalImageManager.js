// LocalImageManager.js - 本地图片管理器
// 负责产品图片的本地存储、下载、索引和同步管理

import { get } from './http.js';

// 检测是否在UXP环境中
const isUXPEnvironment = () => {
  try {
    return typeof require !== 'undefined' && require('photoshop') && require('uxp');
  } catch {
    return false;
  }
};

// 仅在UXP环境中加载相关模块
let fs, formats;
if (isUXPEnvironment()) {
  try {
    fs = require('uxp').storage.localFileSystem;
    formats = require('uxp').storage.formats;
  } catch (error) {
    console.warn('无法加载UXP存储模块:', error);
  }
}

/**
 * 根据文件扩展名获取MIME类型
 * @param {string} filename - 文件名
 * @returns {string} MIME类型
 */
const getMimeTypeFromExtension = (filename) => {
  if (!filename) return 'image/jpeg'; // 默认值

  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.') + 1);

  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon'
  };

  return mimeTypes[extension] || 'image/jpeg'; // 默认返回jpeg
};

/**
 * 本地图片管理器类
 * 提供产品图片的本地存储和管理功能
 */
export class LocalImageManager {
  constructor() {
    this.imageFolder = null; // 图片存储根目录
    this.indexData = []; // 产品数据数组 [{applyCode, originalImages, publishSkus, senceImages}]
    this.downloadQueue = []; // 下载队列
    this.isDownloading = false; // 下载状态标记
    this.maxConcurrentDownloads = 3; // 最大并发下载数
    this.retryCount = 3; // 重试次数
    this.initialized = false; // 初始化状态
  }

  /**
   * 初始化本地图片管理器
   * 创建存储目录和加载索引数据
   * @param {Object} options - 初始化选项
   * @param {boolean} options.forceCleanup - 是否强制清理所有索引数据
   */
  async initialize(options = {}) {
    if (!isUXPEnvironment()) {
      throw new Error('本地图片管理器仅在UXP环境中可用');
    }

    if (this.initialized) {
      console.log('🔄 本地图片管理器已经初始化');
      return;
    }

    try {
      console.log('🚀 [LocalImageManager] 正在初始化本地图片管理器...');
      console.log('🚀 [LocalImageManager] 初始化选项:', options);

      // 创建图片存储目录
      await this.createImageDirectory();

      if (!options.forceCleanup) {
        // 加载索引数据
        await this.loadIndexData();

      }

      this.initialized = true;
      console.log('✅ [LocalImageManager] 本地图片管理器初始化成功');
    } catch (error) {
      console.error('❌ [LocalImageManager] 本地图片管理器初始化失败:', error);
      throw error;
    }
  }



  /**
   * 手动清理索引数据（不删除本地文件）
   * 用于调试和手动触发重新下载
   */
  async manualClearIndex() {
    console.log('🧨 [manualClearIndex] 手动清理索引数据...');

    try {
      const originalSize = this.indexData.length;
      this.indexData = [];

      // 重写索引文件为空
      try {
        const indexFile = await this.imageFolder.getEntry('index.json');
        if (indexFile) {
          console.log('🗑️ [manualClearIndex] 清空索引文件');
          await indexFile.write('[]', { format: formats.utf8 });
        }
      } catch (error) {
        console.log('⚠️ [manualClearIndex] 索引文件不存在或重写失败:', error.message);
      }

      // 保存空的索引数据
      await this.saveIndexData();
      console.log(`✅ [manualClearIndex] 手动清理完成，清理了 ${originalSize} 个产品记录`);
      console.log('✅ [manualClearIndex] 本地文件保留，但下次同步会重新检查和下载');

      return { cleared: originalSize };
    } catch (error) {
      console.error('❌ [manualClearIndex] 手动清理失败:', error);
      throw error;
    }
  }

  /**
   * 创建图片存储目录结构
   */
  async createImageDirectory() {
    try {
      // 获取用户文档目录
      const dataFolder = await fs.getDataFolder();

      // 创建或获取插件专用目录
      let pluginFolder;
      try {
        pluginFolder = await dataFolder.createFolder('tvcmall-plugin', { overwrite: false });
      } catch (error) {
        if (error.message.includes('exists')) {
          pluginFolder = await dataFolder.getEntry('tvcmall-plugin');
          console.log('插件目录已存在，直接使用');
        } else {
          throw error;
        }
      }

      // 创建或获取图片存储目录
      try {
        this.imageFolder = await pluginFolder.createFolder('product-images', { overwrite: false });
      } catch (error) {
        if (error.message.includes('exists')) {
          this.imageFolder = await pluginFolder.getEntry('product-images');
          console.log('图片存储目录已存在，直接使用');
        } else {
          throw error;
        }
      }

      console.log('图片存储目录:', this.imageFolder.nativePath);
    } catch (error) {
      console.error('创建图片存储目录失败:', error);
      throw new Error(`无法创建图片存储目录: ${error.message}`);
    }
  }

  /**
   * 加载图片索引数据
   */
  async loadIndexData() {
    console.log('📂 [loadIndexData] 开始加载图片索引数据...');

    try {
      const indexFile = await this.imageFolder.getEntry('index.json').catch(() => null);

      if (indexFile) {
        console.log('📂 [loadIndexData] 找到索引文件，正在读取...');
        const indexContent = await indexFile.read({ format: formats.utf8 });
        const indexJson = JSON.parse(indexContent);

        // 直接加载产品数组格式
        if (Array.isArray(indexJson)) {
          this.indexData = indexJson;
          console.log(`📂 [loadIndexData] 加载了 ${this.indexData.length} 个产品`);
        } else {
          console.log('📂 [loadIndexData] 旧格式数据，初始化为空数组');
          this.indexData = [];
        }

        // 打印前3个产品的详细信息用于调试
        const firstFewEntries = this.indexData.slice(0, 3);
        console.log('📂 [loadIndexData] 前3个产品示例:', JSON.stringify(firstFewEntries, null, 2));

        // 检查每个产品的图片数量
        this.indexData.forEach((product, index) => {
          const originalCount = product.originalImages ? product.originalImages.length : 0;
          const skuCount = product.publishSkus ? product.publishSkus.length : 0;
          const sceneCount = product.senceImages ? product.senceImages.length : 0;

          console.log(`📊 [loadIndexData] 产品 ${index + 1} (${product.applyCode}): 原始图片=${originalCount}, SKU=${skuCount}, 场景图片=${sceneCount}`);

          // 如果有SKU，显示每个SKU的图片数量
          if (product.publishSkus && product.publishSkus.length > 0) {
            product.publishSkus.forEach((sku, skuIndex) => {
              const skuImageCount = sku.skuImages ? sku.skuImages.length : 0;
              console.log(`  📊 [loadIndexData] SKU ${skuIndex} (${sku.skuIndex}): ${skuImageCount} 张图片`);
            });
          }
        });
      } else {
        console.log('📂 [loadIndexData] 未找到索引文件，创建新的索引');
        this.indexData = [];
      }
    } catch (error) {
      console.warn('📂 [loadIndexData] 加载索引数据失败，使用空数组:', error);
      this.indexData = [];
    }
  }


  /**
   * 保存产品索引数据
   */
  async saveIndexData() {
    try {
      if (!this.imageFolder) {
        throw new Error('图片存储目录未初始化');
      }

      const indexFile = await this.imageFolder.createFile('index.json', { overwrite: true });

      // 直接保存产品数组格式
      await indexFile.write(JSON.stringify(this.indexData, null, 2), { format: formats.utf8 });
      console.log(`产品索引数据已保存: ${this.indexData.length} 个产品`);
    } catch (error) {
      console.error('保存索引数据失败:', error);
      throw error;
    }
  }

  /**
   * 批量下载产品图片
   * @param {Array} productImages 产品图片列表 [{id, url, filename?, applyCode?, productId?}]
   * @param {Function} onProgress 进度回调 (current, total, currentImage)
   * @param {Function} onError 错误回调 (error, imageInfo)
   */
  async downloadProductImages(productImages, onProgress = null, onError = null) {
    console.log('=== LocalImageManager.downloadProductImages 被调用 ===');
    console.log('参数检查:', {
      initialized: this.initialized,
      isArray: Array.isArray(productImages),
      length: productImages?.length,
      hasOnProgress: typeof onProgress === 'function',
      hasOnError: typeof onError === 'function'
    });

    if (!this.initialized) {
      console.log('LocalImageManager 未初始化，正在初始化...');
      await this.initialize();
    }

    if (!Array.isArray(productImages) || productImages.length === 0) {
      console.log('没有需要下载的图片，返回空结果');
      return { success: 0, failed: 0, skipped: 0 };
    }

    console.log(`=== 开始批量下载 ${productImages.length} 张产品图片 ===`);
    console.log('图片列表:', productImages.map(img => ({
      id: img.id,
      url: img.url.substring(0, 50) + '...',
      applyCode: img.applyCode,
      filename: img.filename
    })));

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // 过滤出需要下载的图片（跳过已存在且未过期的）
    console.log('=== 检查需要下载的图片 ===');
    const imagesToDownload = [];
    for (const imageInfo of productImages) {
      const shouldDownload = await this.shouldDownloadImage(imageInfo);
      console.log(`图片 ${imageInfo.id}: shouldDownload=${shouldDownload}`);

      if (shouldDownload) {
        imagesToDownload.push(imageInfo);
      } else {
        results.skipped++;
        console.log(`跳过已存在的图片: ${imageInfo.id}`);
      }
    }

    console.log(`=== 过滤结果: 实际需要下载 ${imagesToDownload.length} 张图片，跳过 ${results.skipped} 张 ===`);

    // 分批下载（控制并发数）
    const batches = this.chunkArray(imagesToDownload, this.maxConcurrentDownloads);
    let processedCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (imageInfo) => {
        try {
          await this.downloadSingleImage(imageInfo);
          results.success++;
          console.log(`✅ 下载成功: ${imageInfo.id}`);
        } catch (error) {
          results.failed++;
          results.errors.push({ imageInfo, error: error.message });
          console.error(`❌ 下载失败: ${imageInfo.id}`, error.message);

          if (onError) {
            onError(error, imageInfo);
          }
        } finally {
          processedCount++;
          if (onProgress) {
            onProgress(processedCount, productImages.length, imageInfo);
          }
        }
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);
    }

    // 保存索引数据
    console.log('=== 保存索引数据到本地存储 ===');
    await this.saveIndexData();

    console.log('=== 批量下载完成 ===');
    console.log('最终结果:', results);
    console.log(`成功: ${results.success}, 失败: ${results.failed}, 跳过: ${results.skipped}`);

    return results;
  }

  /**
   * 检查是否需要下载图片
   * @param {Object} imageInfo 图片信息
   * @returns {boolean} 是否需要下载
   */
  async shouldDownloadImage(imageInfo) {
    const { id, url } = imageInfo;

    console.log(`🤔 [shouldDownloadImage] 检查图片 ${id} 是否需要下载:`, {
      hasId: !!id,
      hasUrl: !!url,
      urlPreview: url ? url.substring(0, 50) + '...' : null
    });

    if (!id || !url) {
      console.log(`❌ [shouldDownloadImage] 图片 ${id} 缺少必要信息，跳过下载`);
      return false;
    }

    const existingInfo = this.getImageInfo(id);
    console.log(`🤔 [shouldDownloadImage] 图片 ${id} 索引检查:`, {
      hasExisting: !!existingInfo,
      existingStatus: existingInfo?.status,
      existingUrl: existingInfo?.imageUrl ? existingInfo.imageUrl.substring(0, 50) + '...' : null,
      existingLocalPath: existingInfo?.localPath
    });

    if (!existingInfo) {
      console.log(`✅ [shouldDownloadImage] 图片 ${id} 是新图片，需要下载`);
      return true; // 新图片需要下载
    }

    // 检查本地文件是否存在
    try {
      console.log(`🔍 [shouldDownloadImage] 检查本地文件是否存在: ${existingInfo.localPath}`);
      const localFile = await this.imageFolder.getEntry(existingInfo.localPath);
      if (!localFile) {
        console.log(`✅ [shouldDownloadImage] 本地文件不存在，需要重新下载: ${existingInfo.localPath}`);
        return true; // 本地文件不存在，需要重新下载
      }

      // 检查URL是否发生变化
      if (existingInfo.imageUrl !== url) {
        console.log(`✅ [shouldDownloadImage] 图片 ${id} URL已变化，需要重新下载`);
        console.log(`🔍 [shouldDownloadImage] 旧URL: ${existingInfo.imageUrl}`);
        console.log(`🔍 [shouldDownloadImage] 新URL: ${url}`);
        return true;
      }

      // 检查文件是否过期（可选：7天）
      const fileAge = Date.now() - existingInfo.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
      if (fileAge > maxAge) {
        console.log(`✅ [shouldDownloadImage] 图片 ${id} 已过期，需要重新下载 (年龄: ${Math.round(fileAge / (24 * 60 * 60 * 1000))} 天)`);
        return true;
      }

      console.log(`❌ [shouldDownloadImage] 图片 ${id} 本地文件存在且有效，跳过下载`);
      return false; // 本地文件存在且有效
    } catch (error) {
      console.warn(`✅ [shouldDownloadImage] 检查本地文件失败 ${id}:`, error);
      console.log(`✅ [shouldDownloadImage] 因为文件检查失败，将重新下载`);
      return true; // 检查失败时重新下载
    }
  }

  /**
   * 下载单张图片
   * @param {Object} imageInfo 图片信息
   */
  async downloadSingleImage(imageInfo) {
    // 提取参数
    let { imageUrl, applyCode, sourceIndex, skuIndex } = imageInfo;

    // 兼容旧格式参数名
    const url = imageUrl || imageInfo.url;

    if (!url || !applyCode) {
      throw new Error('缺少必需参数: imageUrl, applyCode');
    }

    console.log(`🚀 [downloadSingleImage] 开始下载图片: ${url}`);

    let attempt = 0;
    let lastError = null;

    while (attempt < this.retryCount) {
      try {
        // 生成本地文件名
        console.log(`📁 [downloadSingleImage] 为图片 ${url} 生成本地文件名...`);
        const localFilename = this.generateLocalFilename(imageInfo);
        console.log(`📁 [downloadSingleImage] 生成的本地文件名: ${localFilename}`);

        // 下载图片
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // 保存到本地
        const localFile = await this.imageFolder.createFile(localFilename, { overwrite: true });
        await localFile.write(arrayBuffer, { format: formats.binary });

        // 更新产品数据中的图片信息
        const product = this.getOrCreateProduct(applyCode);

        // 根据是否有skuIndex判断图片类型
        if (skuIndex !== undefined && skuIndex !== null) {
          // 处理SKU图片
          let sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
          if (!sku) {
            sku = {
              skuIndex: skuIndex,
              attrClasses: [],
              skuImages: []
            };
            product.publishSkus.push(sku);
          }

          // 查找现有的skuImage或新增
          let skuImage = sku.skuImages.find(img => img.imageUrl === url);
          if (!skuImage) {
            skuImage = { imageUrl: url };
            sku.skuImages.push(skuImage);
          }

          // 更新图片信息
          Object.assign(skuImage, {
            localPath: localFilename,
            status: 'pending_edit',
            timestamp: Date.now(),
            fileSize: arrayBuffer.byteLength,
            index: sourceIndex
          });
        } else {
          // 处理原始图片
          let originalImage = product.originalImages.find(img => img.imageUrl === url);
          if (!originalImage) {
            originalImage = { imageUrl: url };
            product.originalImages.push(originalImage);
          }

          // 更新图片信息
          Object.assign(originalImage, {
            localPath: localFilename,
            status: 'pending_edit',
            timestamp: Date.now(),
            fileSize: arrayBuffer.byteLength
          });
        }

        console.log(`图片下载完成: ${url} -> ${localFilename}`);
        return;

      } catch (error) {
        attempt++;
        lastError = error;
        console.warn(`下载图片 ${url} 第 ${attempt} 次尝试失败:`, error.message);

        if (attempt < this.retryCount) {
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`下载图片 ${url} 失败，已重试 ${this.retryCount} 次: ${lastError?.message}`);
  }


  /**
   * 生成本地文件名
   * 统一使用简单的命名规则：{申请码}_{原始文件名}
   * @param {Object} imageInfo 图片信息
   * @param {string} imageInfo.url 图片URL
   * @param {string} imageInfo.applyCode 申请码
   * @param {string} [imageInfo.imageType] 图片类型（可选，不影响命名）
   * @returns {string} 本地文件名
   */
  generateLocalFilename(imageInfo) {
    const { imageUrl, url, applyCode } = imageInfo;
    const actualUrl = imageUrl || url; // 兼容新旧参数名
    console.log('🔍 [generateLocalFilename] 输入参数:', imageInfo);

    if (!actualUrl || !applyCode) {
      throw new Error('缺少必需参数: imageUrl/url, applyCode');
    }

    try {
      // 从URL中提取原始文件名
      const urlObj = new URL(actualUrl);
      const pathname = urlObj.pathname;

      // 获取文件名部分（路径的最后一段）
      const originalFilename = pathname.split('/').pop() || 'image.jpg';

      // 生成统一格式：{申请码}_{原始文件名}
      const localFilename = `${applyCode}_${originalFilename}`;

      console.log(`✅ [generateLocalFilename] 生成本地文件名: ${actualUrl} -> ${localFilename}`);
      return localFilename;

    } catch (error) {
      console.error('❌ [generateLocalFilename] 生成本地文件名失败:', error);

      // 备用方案：使用时间戳避免冲突
      const fallbackName = `${applyCode}_fallback_${Date.now()}.jpg`;
      console.warn(`⚠️ [generateLocalFilename] 使用备用方案: ${fallbackName}`);
      return fallbackName;
    }
  }

  /**
   * 获取本地图片文件
   * @param {string} imageId 图片ID
   * @returns {Promise<File|null>} 本地文件对象
   */
  async getLocalImageFile(imageId) {
    if (!this.initialized) {
      await this.initialize();
    }

    const imageInfo = this.getImageInfo(imageId);
    if (!imageInfo) {
      return null;
    }

    try {
      const localFile = await this.imageFolder.getEntry(imageInfo.localPath);
      return localFile;
    } catch (error) {
      console.warn(`获取本地图片文件失败 ${imageId}:`, error);
      return null;
    }
  }

  /**
   * 获取本地图片路径
   * @param {string} imageId 图片ID
   * @returns {string|null} 本地文件路径
   */
  getLocalImagePath(imageId) {
    const imageInfo = this.getImageInfo(imageId);
    if (!imageInfo || !this.imageFolder) {
      return null;
    }

    return `${this.imageFolder.nativePath}/${imageInfo.localPath}`;
  }

  /**
   * 检查图片是否存在于本地且可用
   * @param {string} imageId 图片ID（前端生成的ID）
   * @returns {boolean} 是否存在且可用
   */
  hasLocalImage(imageId) {
    // 遍历所有产品查找图片
    for (const product of this.indexData) {
      // 查找originalImages
      if (product.originalImages) {
        const found = product.originalImages.find(img =>
          img.imageUrl === imageId || img.localPath === imageId
        );
        if (found) {
          const isAvailable = found.status === 'pending_edit' ||
                             found.status === 'editing' ||
                             found.status === 'completed' ||
                             // 保持向后兼容
                             found.status === 'downloaded' ||
                             found.status === 'synced' ||
                             found.status === 'modified';
          console.log(`[hasLocalImage] 在原图中找到 ${imageId}: status=${found.status}, available=${isAvailable}`);
          return isAvailable;
        }
      }

      // 查找skuImages
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            const found = sku.skuImages.find(img =>
              img.imageUrl === imageId || img.localPath === imageId
            );
            if (found) {
              const isAvailable = found.status === 'pending_edit' ||
                                 found.status === 'editing' ||
                                 found.status === 'completed' ||
                                 // 保持向后兼容
                                 found.status === 'downloaded' ||
                                 found.status === 'synced' ||
                                 found.status === 'modified';
              console.log(`[hasLocalImage] 在SKU图中找到 ${imageId}: status=${found.status}, available=${isAvailable}`);
              return isAvailable;
            }
          }
        }
      }
    }

    console.log(`[hasLocalImage] 未找到图片 ${imageId}`);
    return false;
  }


  /**
   * 通过URL获取本地图片的显示URL（极简版）
   * @param {string} imageUrl 图片URL
   * @returns {Promise<string|null>} 本地图片的blob URL或null
   */
  async getLocalImageDisplayUrlByUrl(imageUrl) {
    if (!imageUrl) return null;

    // 遍历所有产品查找图片
    for (const product of this.indexData) {
      // 查找originalImages
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.imageUrl === imageUrl && this.isImageStatusAvailable(img.status) && img.localPath) {
            try {
              const localFile = await this.imageFolder.getEntry(img.localPath);
              const arrayBuffer = await localFile.read({ format: formats.binary });
              const mimeType = getMimeTypeFromExtension(img.localPath);
              const blob = new Blob([arrayBuffer], { type: mimeType });
              return URL.createObjectURL(blob);
            } catch {
              return null;
            }
          }
        }
      }

      // 查找skuImages
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.imageUrl === imageUrl && this.isImageStatusAvailable(img.status) && img.localPath) {
                try {
                  const localFile = await this.imageFolder.getEntry(img.localPath);
                  const arrayBuffer = await localFile.read({ format: formats.binary });
                  const mimeType = getMimeTypeFromExtension(img.localPath);
                  const blob = new Blob([arrayBuffer], { type: mimeType });
                  return URL.createObjectURL(blob);
                } catch {
                  return null;
                }
              }
            }
          }
        }
      }

      // 查找场景图片
      if (product.senceImages) {
        for (const img of product.senceImages) {
          if (img.imageUrl === imageUrl && this.isImageStatusAvailable(img.status) && img.localPath) {
            try {
              const localFile = await this.imageFolder.getEntry(img.localPath);
              const arrayBuffer = await localFile.read({ format: formats.binary });
              const mimeType = getMimeTypeFromExtension(img.localPath);
              const blob = new Blob([arrayBuffer], { type: mimeType });
              return URL.createObjectURL(blob);
            } catch {
              return null;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取本地图片的显示URL（极简版）
   * @param {string} imageId 图片ID
   * @returns {Promise<string|null>} 本地图片的blob URL或null
   */
  async getLocalImageDisplayUrl(imageId) {
    try {
      const imageInfo = this.getImageInfo(imageId);
      if (!imageInfo || !this.isImageStatusAvailable(imageInfo.status) || !imageInfo.localPath) {
        return null;
      }

      const localFile = await this.imageFolder.getEntry(imageInfo.localPath);
      const arrayBuffer = await localFile.read({ format: formats.binary });
      const mimeType = getMimeTypeFromExtension(imageInfo.localPath);
      const blob = new Blob([arrayBuffer], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }


  /**
   * 根据申请码查找产品
   * @param {string} applyCode 申请码
   * @returns {Object|null} 产品信息
   */
  findProductByApplyCode(applyCode) {
    return this.indexData.find(product => product.applyCode === applyCode) || null;
  }

  /**
   * 添加临时图片（用于PS同步等临时操作）
   * @param {string} imageId 图片ID
   * @param {Object} imageInfo 图片信息
   */
  addTemporaryImage(imageId, imageInfo) {
    // 查找或创建临时产品
    let tempProduct = this.findProductByApplyCode('temp_sync');
    if (!tempProduct) {
      tempProduct = {
        applyCode: 'temp_sync',
        originalImages: [],
        publishSkus: [],
        senceImages: [],
        userId: 0,
        userCode: null
      };
      this.indexData.push(tempProduct);
    }

    // 将临时图片添加到originalImages中（因为这些通常是PS同步的图片）
    const tempImage = {
      imageUrl: imageInfo.url || `temp_sync_${imageId}`,
      localPath: imageInfo.localPath,
      status: imageInfo.status || 'synced_temp',
      timestamp: imageInfo.timestamp || Date.now(),
      fileSize: imageInfo.fileSize,
      isTemporary: true,
      originalData: imageInfo
    };

    tempProduct.originalImages.push(tempImage);
    console.log(`✅ [addTemporaryImage] 添加临时图片: ${imageId}`);
  }

  /**
   * 获取所有图片的扁平列表（用于遍历显示）
   * @returns {Array} 所有图片的列表，每个图片包含完整信息
   */
  getAllImages() {
    const allImages = [];

    for (const product of this.indexData) {
      // 添加原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          allImages.push({
            id: img.imageUrl || img.localPath,
            applyCode: product.applyCode,
            ...img
          });
        }
      }

      // 添加SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              allImages.push({
                id: img.imageUrl || img.localPath,
                applyCode: product.applyCode,
                skuIndex: sku.skuIndex,
                ...img
              });
            }
          }
        }
      }
    }

    return allImages;
  }

  /**
   * 获取或创建产品
   * @param {string} applyCode 申请码
   * @returns {Object} 产品信息
   */
  getOrCreateProduct(applyCode) {
    let product = this.findProductByApplyCode(applyCode);
    if (!product) {
      product = {
        applyCode: applyCode,
        originalImages: [],
        publishSkus: [],
        senceImages: [],
        userId: 0,
        userCode: null
      };
      this.indexData.push(product);
      console.log(`📦 [getOrCreateProduct] 创建新产品: ${applyCode}`);
    }
    return product;
  }

  /**
   * 获取图片信息
   * @param {string} imageId 图片ID
   * @returns {Object|null} 图片信息
   */
  getImageInfo(imageId) {
    // 遍历所有产品查找图片信息
    for (const product of this.indexData) {
      // 查找originalImages
      if (product.originalImages) {
        const found = product.originalImages.find(img =>
          img.imageUrl === imageId || img.localPath === imageId
        );
        if (found) {
          return { ...found, applyCode: product.applyCode };
        }
      }

      // 查找skuImages
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            const found = sku.skuImages.find(img =>
              img.imageUrl === imageId || img.localPath === imageId
            );
            if (found) {
              return {
                ...found,
                applyCode: product.applyCode,
                skuIndex: sku.skuIndex
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 添加本地图片到产品
   * @param {string} applyCode 产品申请码
   * @param {File} file 图片文件
   * @param {string} imageType 图片类型：'original', 'sku', 'scene'
   * @param {number} skuIndex SKU索引（仅sku类型需要）
   * @returns {Promise<Object>} 添加结果包含文件名等信息
   */
  async addLocalImage(applyCode, file, imageType, skuIndex = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`📁 [addLocalImage] 开始添加本地图片: ${file.name} 到产品 ${applyCode}`);

      // 生成规范文件名
      const originalExtension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
      const baseFileName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
      const standardFileName = `${applyCode}_${baseFileName}${originalExtension}`;

      // 检查文件名是否已存在，如果存在则添加序号
      let finalFileName = standardFileName;
      let counter = 1;
      while (await this.fileExists(finalFileName)) {
        const nameWithoutExt = standardFileName.substring(0, standardFileName.lastIndexOf('.'));
        finalFileName = `${nameWithoutExt}_${counter}${originalExtension}`;
        counter++;
      }

      console.log(`📝 [addLocalImage] 生成文件名: ${file.name} -> ${finalFileName}`);

      // 读取文件内容 - 使用UXP兼容的方式
      const arrayBuffer = await file.read({ format: formats.binary });

      // 保存到本地文件系统
      const localFile = await this.imageFolder.createFile(finalFileName, { overwrite: false });
      await localFile.write(arrayBuffer, { format: formats.binary });

      console.log(`💾 [addLocalImage] 文件已保存: ${finalFileName}`);

      // 更新索引数据
      const product = this.getOrCreateProduct(applyCode);

      // 创建图片记录
      const imageRecord = {
        imageUrl: `local://${finalFileName}`, // 使用特殊URL标记为本地添加的图片
        localPath: finalFileName,
        status: 'pending_edit',
        timestamp: Date.now(),
        fileSize: arrayBuffer.byteLength,
        addedLocally: true // 标记为本地添加的图片
      };

      // 根据类型添加到对应数组
      if (imageType === 'original') {
        if (!product.originalImages) product.originalImages = [];
        product.originalImages.push(imageRecord);
      } else if (imageType === 'sku') {
        if (!product.publishSkus) product.publishSkus = [];
        let sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
        if (!sku) {
          sku = {
            skuIndex: skuIndex || 0,
            attrClasses: [],
            skuImages: []
          };
          product.publishSkus.push(sku);
        }
        if (!sku.skuImages) sku.skuImages = [];
        imageRecord.index = sku.skuImages.length;
        sku.skuImages.push(imageRecord);
      } else if (imageType === 'scene') {
        if (!product.senceImages) product.senceImages = [];
        product.senceImages.push(imageRecord);
      }

      // 保存索引
      await this.saveIndexData();

      console.log(`✅ [addLocalImage] 图片添加成功: ${finalFileName}`);

      return {
        fileName: finalFileName,
        localPath: finalFileName,
        status: 'pending_edit',
        imageUrl: imageRecord.imageUrl
      };

    } catch (error) {
      console.error(`❌ [addLocalImage] 添加图片失败:`, error);
      throw error;
    }
  }

  /**
   * 批量添加本地图片
   * @param {string} applyCode 产品申请码
   * @param {File[]} files 图片文件数组
   * @param {string} imageType 图片类型：'original', 'sku', 'scene'
   * @param {number} skuIndex SKU索引（仅sku类型需要）
   * @param {function} progressCallback 进度回调函数 (current) => void
   * @returns {Promise<Object[]>} 添加结果数组
   */
  async addLocalImages(applyCode, files, imageType, skuIndex = null, progressCallback = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`📁 [addLocalImages] 开始批量添加本地图片: ${files.length}个文件到产品 ${applyCode}`);

      const results = [];
      const product = this.getOrCreateProduct(applyCode);

      // 串行处理每个文件，保证文件名去重的正确性
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📁 [addLocalImages] 处理文件 ${i + 1}/${files.length}: ${file.name}`);

        try {
          // 生成规范文件名
          const originalExtension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
          const baseFileName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
          const standardFileName = `${applyCode}_${baseFileName}${originalExtension}`;

          // 检查文件名是否已存在，如果存在则添加序号
          let finalFileName = standardFileName;
          let counter = 1;
          while (await this.fileExists(finalFileName)) {
            const nameWithoutExt = standardFileName.substring(0, standardFileName.lastIndexOf('.'));
            finalFileName = `${nameWithoutExt}_${counter}${originalExtension}`;
            counter++;
          }

          console.log(`📝 [addLocalImages] 生成文件名: ${file.name} -> ${finalFileName}`);

          // 读取文件内容 - 使用UXP兼容的方式
          const arrayBuffer = await file.read({ format: formats.binary });

          // 保存到本地文件系统
          const localFile = await this.imageFolder.createFile(finalFileName, { overwrite: false });
          await localFile.write(arrayBuffer, { format: formats.binary });

          console.log(`💾 [addLocalImages] 文件已保存: ${finalFileName}`);

          // 创建图片记录
          const imageRecord = {
            imageUrl: `local://${finalFileName}`, // 使用特殊URL标记为本地添加的图片
            localPath: finalFileName,
            status: 'pending_edit',
            timestamp: Date.now(),
            fileSize: arrayBuffer.byteLength,
            addedLocally: true // 标记为本地添加的图片
          };

          // 根据类型添加到对应数组
          if (imageType === 'original') {
            if (!product.originalImages) product.originalImages = [];
            product.originalImages.push(imageRecord);
          } else if (imageType === 'sku') {
            if (!product.publishSkus) product.publishSkus = [];
            let sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
            if (!sku) {
              sku = {
                skuIndex: skuIndex || 0,
                attrClasses: [],
                skuImages: []
              };
              product.publishSkus.push(sku);
            }
            if (!sku.skuImages) sku.skuImages = [];
            imageRecord.index = sku.skuImages.length;
            sku.skuImages.push(imageRecord);
          } else if (imageType === 'scene') {
            if (!product.senceImages) product.senceImages = [];
            product.senceImages.push(imageRecord);
          }

          // 添加到结果数组
          results.push({
            fileName: finalFileName,
            localPath: finalFileName,
            status: 'pending_edit',
            imageUrl: imageRecord.imageUrl,
            success: true
          });

        } catch (fileError) {
          console.error(`❌ [addLocalImages] 处理文件 ${file.name} 失败:`, fileError);
          results.push({
            fileName: file.name,
            success: false,
            error: fileError.message
          });
        }

        // 更新进度
        if (progressCallback) {
          progressCallback(i + 1);
        }
      }

      // 批量操作完成后统一保存索引
      await this.saveIndexData();

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ [addLocalImages] 批量添加完成: 成功 ${successCount}/${files.length} 个文件`);

      return results;

    } catch (error) {
      console.error(`❌ [addLocalImages] 批量添加图片失败:`, error);
      throw error;
    }
  }

  /**
   * 检查文件是否已存在
   * @param {string} fileName 文件名
   * @returns {Promise<boolean>} 是否存在
   */
  async fileExists(fileName) {
    try {
      await this.imageFolder.getEntry(fileName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 图片重排序 - 插入式排序
   * @param {string} applyCode 产品申请码
   * @param {string} imageType 图片类型 ('original', 'sku', 'scene')
   * @param {number|null} skuIndex SKU索引 (仅sku类型需要)
   * @param {string} draggedImageId 被拖拽的图片ID
   * @param {number} targetIndex 目标插入位置
   * @param {string} insertPosition 插入位置 ('before', 'after')
   */
  async reorderImageByInsert(applyCode, imageType, skuIndex, draggedImageId, targetIndex, insertPosition) {
    try {
      console.log(`🔄 [reorderImageByInsert] 开始重排序: ${imageType}/${skuIndex}, 图片: ${draggedImageId}, 目标: ${targetIndex} (${insertPosition})`);

      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        throw new Error(`产品不存在: ${applyCode}`);
      }

      let imageArray;
      let arrayPath; // 用于调试日志

      // 获取对应的图片数组
      if (imageType === 'original') {
        imageArray = product.originalImages || [];
        arrayPath = 'originalImages';
      } else if (imageType === 'sku') {
        const sku = product.publishSkus?.find(s => s.skuIndex === skuIndex);
        if (!sku) {
          throw new Error(`SKU ${skuIndex} 不存在`);
        }
        imageArray = sku.skuImages || [];
        arrayPath = `publishSkus[${skuIndex}].skuImages`;
      } else if (imageType === 'scene') {
        imageArray = product.senceImages || [];
        arrayPath = 'senceImages';
      } else {
        throw new Error(`无效的图片类型: ${imageType}`);
      }

      if (imageArray.length === 0) {
        throw new Error(`${arrayPath} 为空，无法重排序`);
      }

      // 查找源图片索引 - 支持多种ID格式
      const sourceIndex = imageArray.findIndex(img =>
        img.imageUrl === draggedImageId ||
        img.id === draggedImageId ||
        (img.imageUrl && img.imageUrl.includes(draggedImageId))
      );

      if (sourceIndex === -1) {
        console.warn(`⚠️ [reorderImageByInsert] 在 ${arrayPath} 中找不到图片:`, draggedImageId);
        console.warn('可用的图片IDs:', imageArray.map(img => ({
          imageUrl: img.imageUrl,
          id: img.id
        })));
        throw new Error('源图片不存在');
      }

      // 验证目标索引范围
      if (targetIndex < 0 || targetIndex >= imageArray.length) {
        throw new Error(`目标索引 ${targetIndex} 超出范围 [0, ${imageArray.length - 1}]`);
      }

      // 计算最终插入位置
      let finalIndex = insertPosition === 'before' ? targetIndex : targetIndex + 1;

      // 如果源位置在目标位置之前，需要调整插入位置
      if (sourceIndex < finalIndex) {
        finalIndex--;
      }

      // 如果源位置和最终位置相同，不需要移动
      if (sourceIndex === finalIndex) {
        console.log(`ℹ️ [reorderImageByInsert] 位置未变化，无需重排序: ${sourceIndex} -> ${finalIndex}`);
        return { success: true, newOrder: imageArray };
      }

      console.log(`📍 [reorderImageByInsert] 执行重排序: ${sourceIndex} -> ${finalIndex} (目标: ${targetIndex}, 插入: ${insertPosition})`);

      // 执行数组重排序
      const [draggedItem] = imageArray.splice(sourceIndex, 1);
      imageArray.splice(finalIndex, 0, draggedItem);

      // 重新计算所有图片的index字段
      imageArray.forEach((img, index) => {
        img.index = index;
      });

      // 保存索引文件
      await this.saveIndexData();

      console.log(`✅ [reorderImageByInsert] 图片排序已更新: ${arrayPath}, 从 ${sourceIndex} 到 ${finalIndex}`);
      return { success: true, newOrder: imageArray };

    } catch (error) {
      console.error('❌ [reorderImageByInsert] 重排序失败:', error);
      throw error;
    }
  }

  /**
   * 标记图片已被修改（需要上传）
   * @param {string} imageId 图片ID
   * @param {File} modifiedFile 修改后的文件
   */
  async markImageAsModified(imageId, modifiedFile = null) {
    // 遍历产品数组查找并更新图片状态
    let imageFound = false;

    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.imageUrl === imageId || img.localPath === imageId) {
            img.status = 'modified';
            img.modifiedTimestamp = Date.now();

            if (modifiedFile) {
              const modifiedFilename = `modified_${img.localPath}`;
              const newFile = await this.imageFolder.createFile(modifiedFilename, { overwrite: true });
              const buffer = await modifiedFile.read({ format: formats.binary });
              await newFile.write(buffer, { format: formats.binary });
              img.modifiedPath = modifiedFilename;
            }

            imageFound = true;
            console.log(`原始图片 ${imageId} 已标记为已修改`);
            break;
          }
        }
      }

      // 检查SKU图片
      if (!imageFound && product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.imageUrl === imageId || img.localPath === imageId) {
                img.status = 'modified';
                img.modifiedTimestamp = Date.now();

                if (modifiedFile) {
                  const modifiedFilename = `modified_${img.localPath}`;
                  const newFile = await this.imageFolder.createFile(modifiedFilename, { overwrite: true });
                  const buffer = await modifiedFile.read({ format: formats.binary });
                  await newFile.write(buffer, { format: formats.binary });
                  img.modifiedPath = modifiedFilename;
                }

                imageFound = true;
                console.log(`SKU图片 ${imageId} 已标记为已修改`);
                break;
              }
            }
          }
          if (imageFound) break;
        }
      }

      if (imageFound) break;
    }

    if (!imageFound) {
      console.warn(`尝试标记不存在的图片为已修改: ${imageId}`);
      return;
    }

    await this.saveIndexData();
  }

  /**
   * 获取需要上传的图片列表
   * @returns {Array} 需要上传的图片信息数组
   */
  getModifiedImages() {
    const modifiedImages = [];

    // 遍历所有产品查找状态为modified的图片
    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.status === 'modified') {
            modifiedImages.push({
              imageId: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              ...img
            });
          }
        }
      }

      // 检查SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.status === 'modified') {
                modifiedImages.push({
                  imageId: img.imageUrl || img.localPath,
                  applyCode: product.applyCode,
                  skuIndex: sku.skuIndex,
                  ...img
                });
              }
            }
          }
        }
      }
    }

    return modifiedImages;
  }

  /**
   * 标记图片上传完成
   * @param {string} imageId 图片ID
   * @param {string} newUrl 新的云端URL
   */
  async markImageAsUploaded(imageId, newUrl) {
    // 遍历产品数组查找并更新图片状态
    let imageFound = false;

    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.imageUrl === imageId || img.localPath === imageId) {
            img.status = 'synced';
            img.imageUrl = newUrl;
            img.uploadedTimestamp = Date.now();

            // 清理修改后的文件
            if (img.modifiedPath) {
              try {
                const modifiedFile = await this.imageFolder.getEntry(img.modifiedPath);
                if (modifiedFile) {
                  await modifiedFile.delete();
                }
              } catch (error) {
                console.warn(`清理修改文件失败: ${error.message}`);
              }
              delete img.modifiedPath;
            }

            imageFound = true;
            console.log(`原始图片 ${imageId} 已标记为已上传`);
            break;
          }
        }
      }

      // 检查SKU图片
      if (!imageFound && product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.imageUrl === imageId || img.localPath === imageId) {
                img.status = 'synced';
                img.imageUrl = newUrl;
                img.uploadedTimestamp = Date.now();

                // 清理修改后的文件
                if (img.modifiedPath) {
                  try {
                    const modifiedFile = await this.imageFolder.getEntry(img.modifiedPath);
                    if (modifiedFile) {
                      await modifiedFile.delete();
                    }
                  } catch (error) {
                    console.warn(`清理修改文件失败: ${error.message}`);
                  }
                  delete img.modifiedPath;
                }

                imageFound = true;
                console.log(`SKU图片 ${imageId} 已标记为已上传`);
                break;
              }
            }
          }
          if (imageFound) break;
        }
      }

      if (imageFound) break;
    }

    if (!imageFound) {
      console.warn(`尝试标记不存在的图片为已上传: ${imageId}`);
      return;
    }

    await this.saveIndexData();
  }

  /**
   * 清理过期和无用的图片
   * @param {number} maxAge 最大保留时间（毫秒）
   * @returns {Object} 清理统计
   */
  async cleanupOldImages(maxAge = 30 * 24 * 60 * 60 * 1000) { // 默认30天
    if (!this.initialized) {
      await this.initialize();
    }

    const results = { deleted: 0, errors: [] };
    const currentTime = Date.now();

    // 遍历所有产品清理过期图片
    for (const product of this.indexData) {
      // 清理原始图片
      if (product.originalImages) {
        product.originalImages = product.originalImages.filter(img => {
          if (img.timestamp) {
            const age = currentTime - img.timestamp;
            if (age > maxAge && img.status === 'synced') {
              try {
                // 删除本地文件
                this.imageFolder.getEntry(img.localPath).then(localFile => {
                  if (localFile) {
                    localFile.delete();
                  }
                }).catch(() => {
                  // 文件不存在，忽略错误
                });

                results.deleted++;
                console.log(`已清理过期原始图片: ${img.imageUrl || img.localPath}`);
                return false; // 从数组中移除
              } catch (error) {
                results.errors.push({
                  imageId: img.imageUrl || img.localPath,
                  error: error.message
                });
                console.error(`清理原始图片失败 ${img.imageUrl || img.localPath}:`, error);
                return true; // 保留在数组中
              }
            }
          }
          return true; // 保留在数组中
        });
      }

      // 清理SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            sku.skuImages = sku.skuImages.filter(img => {
              if (img.timestamp) {
                const age = currentTime - img.timestamp;
                if (age > maxAge && img.status === 'synced') {
                  try {
                    // 删除本地文件
                    this.imageFolder.getEntry(img.localPath).then(localFile => {
                      if (localFile) {
                        localFile.delete();
                      }
                    }).catch(() => {
                      // 文件不存在，忽略错误
                    });

                    results.deleted++;
                    console.log(`已清理过期SKU图片: ${img.imageUrl || img.localPath}`);
                    return false; // 从数组中移除
                  } catch (error) {
                    results.errors.push({
                      imageId: img.imageUrl || img.localPath,
                      error: error.message
                    });
                    console.error(`清理SKU图片失败 ${img.imageUrl || img.localPath}:`, error);
                    return true; // 保留在数组中
                  }
                }
              }
              return true; // 保留在数组中
            });
          }
        }
      }
    }

    if (results.deleted > 0) {
      await this.saveIndexData();
    }

    console.log(`清理完成: 删除了 ${results.deleted} 张过期图片`);
    return results;
  }

  /**
   * 获取存储统计信息
   * @returns {Object} 存储统计
   */
  async getStorageStats() {
    if (!this.initialized) {
      await this.initialize();
    }

    const stats = {
      totalImages: 0,
      downloadedImages: 0,
      modifiedImages: 0,
      syncedImages: 0,
      totalSize: 0,
      lastUpdate: null,
      totalProducts: this.indexData.length
    };

    let newestTimestamp = 0;

    // 遍历所有产品统计图片信息
    for (const product of this.indexData) {
      // 统计原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          stats.totalImages++;

          if (img.status === 'downloaded') stats.downloadedImages++;
          else if (img.status === 'modified') stats.modifiedImages++;
          else if (img.status === 'synced') stats.syncedImages++;

          if (img.fileSize) {
            stats.totalSize += img.fileSize;
          }

          if (img.timestamp && img.timestamp > newestTimestamp) {
            newestTimestamp = img.timestamp;
          }
        }
      }

      // 统计SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              stats.totalImages++;

              if (img.status === 'downloaded') stats.downloadedImages++;
              else if (img.status === 'modified') stats.modifiedImages++;
              else if (img.status === 'synced') stats.syncedImages++;

              if (img.fileSize) {
                stats.totalSize += img.fileSize;
              }

              if (img.timestamp && img.timestamp > newestTimestamp) {
                newestTimestamp = img.timestamp;
              }
            }
          }
        }
      }
    }

    if (newestTimestamp > 0) {
      stats.lastUpdate = new Date(newestTimestamp);
    }

    return stats;
  }

  /**
   * 将数组分块
   * @param {Array} array 原数组
   * @param {number} size 块大小
   * @returns {Array} 分块后的数组
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 重置所有数据（慎用）
   */
  async reset() {
    try {
      if (this.imageFolder) {
        // 删除所有文件
        const entries = await this.imageFolder.getEntries();
        for (const entry of entries) {
          await entry.delete();
        }
      }

      this.indexData = [];
      console.log('本地图片管理器已重置');
    } catch (error) {
      console.error('重置本地图片管理器失败:', error);
      throw error;
    }
  }

  /**
   * 通过文件名查找对应的图片ID
   * 用于处理直接从文件夹打开到PS的图片反向同步
   * @param {string} filename - PS文档文件名
   * @returns {Promise<string|null>} - 匹配的图片ID，如果找不到返回null
   */
  async findImageIdByFilename(filename) {
    if (!filename) {
      console.log(`❌ [findImageIdByFilename] 文件名为空`);
      return null;
    }

    console.log(`🔍 [findImageIdByFilename] 查找文件名: ${filename}`);

    // 检查是否已初始化，如果未初始化则自动初始化
    if (!this.initialized) {
      console.log(`⚠️ [findImageIdByFilename] LocalImageManager未初始化，正在自动初始化...`);
      try {
        await this.initialize();
      } catch (error) {
        console.error(`❌ [findImageIdByFilename] 自动初始化失败:`, error);
        return null;
      }
    }

    // 如果索引数据为空，尝试重新加载
    if (this.indexData.length === 0) {
      console.log(`⚠️ [findImageIdByFilename] 索引数据为空，尝试重新加载...`);
      try {
        await this.loadIndexData();
      } catch (error) {
        console.error(`❌ [findImageIdByFilename] 重新加载索引数据失败:`, error);
      }
    }

    // 标准化目标文件名
    const normalizedTarget = this.normalizeFilename(filename);
    console.log(`🔍 [findImageIdByFilename] 标准化目标文件名: ${normalizedTarget}`);

    // 遍历所有产品查找匹配的文件名
    let matchCount = 0;
    let totalChecked = 0;

    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          totalChecked++;
          if (img.localPath) {
            const normalizedLocal = this.normalizeFilename(img.localPath);
            console.log(`🔍 [findImageIdByFilename] 比较原始图片: ${normalizedLocal} vs ${normalizedTarget}`);

            if (normalizedLocal === normalizedTarget) {
              matchCount++;
              const imageId = img.imageUrl || img.localPath;
              console.log(`🎯 [findImageIdByFilename] 找到匹配原始图片 #${matchCount}: ${filename} -> ${imageId}`);
              console.log(`📋 [findImageIdByFilename] 匹配的图片信息:`, {
                imageId,
                localPath: img.localPath,
                status: img.status,
                timestamp: img.timestamp,
                applyCode: product.applyCode
              });

              return imageId;
            }
          }
        }
      }

      // 检查SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              totalChecked++;
              if (img.localPath) {
                const normalizedLocal = this.normalizeFilename(img.localPath);
                console.log(`🔍 [findImageIdByFilename] 比较SKU图片: ${normalizedLocal} vs ${normalizedTarget}`);

                if (normalizedLocal === normalizedTarget) {
                  matchCount++;
                  const imageId = img.imageUrl || img.localPath;
                  console.log(`🎯 [findImageIdByFilename] 找到匹配SKU图片 #${matchCount}: ${filename} -> ${imageId}`);
                  console.log(`📋 [findImageIdByFilename] 匹配的图片信息:`, {
                    imageId,
                    localPath: img.localPath,
                    status: img.status,
                    timestamp: img.timestamp,
                    applyCode: product.applyCode,
                    skuIndex: sku.skuIndex
                  });

                  return imageId;
                }
              }
            }
          }
        }
      }
    }

    console.log(`❌ [findImageIdByFilename] 未找到匹配的图片ID，文件名: ${filename}`);
    console.log(`📊 [findImageIdByFilename] 搜索统计: 检查了 ${totalChecked} 个图片记录`);

    return null;
  }

  /**
   * 标准化文件名用于匹配比较
   * 去除路径前缀，统一大小写，便于精确匹配
   * @param {string} filename - 原始文件名
   * @returns {string} - 标准化后的文件名
   */
  normalizeFilename(filename) {
    if (!filename) return '';

    // 去除路径部分，只保留文件名
    let baseName = filename;
    if (filename.includes('/')) {
      baseName = filename.split('/').pop();
    }
    if (filename.includes('\\')) {
      baseName = baseName.split('\\').pop();
    }

    // 统一转换为小写用于比较（避免大小写差异）
    const normalized = baseName.toLowerCase();

    console.log(`🔄 [normalizeFilename] ${filename} -> ${normalized}`);
    return normalized;
  }

  /**
   * 检查本地图片文件是否已被修改（基于修改时间）
   * @param {string} imageId - 图片ID（可以是imageUrl）
   * @returns {Promise<boolean>} - 文件是否已被修改
   */
  async checkFileModification(imageId) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🔍 [checkFileModification] 检查图片文件修改: ${imageId}`);

      // 查找图片信息
      const imageInfo = this.getImageInfo(imageId);
      if (!imageInfo) {
        console.log(`❌ [checkFileModification] 未找到图片信息: ${imageId}`);
        return false;
      }

      if (!imageInfo.localPath) {
        console.log(`⚠️ [checkFileModification] 图片无本地文件路径: ${imageId}`);
        return false;
      }

      // 获取本地文件
      const file = await this.imageFolder.getEntry(imageInfo.localPath);
      const metadata = await file.getMetadata();

      if (!metadata) {
        console.log(`❌ [checkFileModification] 无法获取文件元数据: ${imageInfo.localPath}`);
        return false;
      }

      const currentModified = metadata.dateModified.getTime();
      const recordedModified = imageInfo.lastModified || imageInfo.timestamp || 0;

      console.log(`📊 [checkFileModification] 时间比较:`, {
        imageId: imageId,
        localPath: imageInfo.localPath,
        currentModified: new Date(currentModified).toLocaleString(),
        recordedModified: new Date(recordedModified).toLocaleString(),
        hasBeenModified: currentModified > recordedModified
      });

      // 如果文件已被修改，更新记录
      if (currentModified > recordedModified) {
        console.log(`✅ [checkFileModification] 检测到文件修改: ${imageInfo.localPath}`);

        // 更新图片信息
        imageInfo.lastModified = currentModified;
        imageInfo.status = 'modified';
        imageInfo.fileSize = metadata.size;

        // 保存更新的索引数据
        await this.saveIndexData();

        console.log(`💾 [checkFileModification] 已更新图片状态为 'modified': ${imageId}`);
        return true;
      }

      console.log(`ℹ️ [checkFileModification] 文件未修改: ${imageInfo.localPath}`);
      return false;

    } catch (error) {
      console.error(`❌ [checkFileModification] 检查文件修改失败:`, error);
      console.error(`📋 [checkFileModification] 错误详情:`, {
        imageId: imageId,
        errorMessage: error.message,
        errorStack: error.stack
      });
      return false;
    }
  }

  /**
   * 刷新图片的显示URL（重新生成blob URL）
   * @param {string} imageId - 图片ID
   * @returns {Promise<string|null>} - 新的显示URL
   */
  async refreshImageDisplayUrl(imageId) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🔄 [refreshImageDisplayUrl] 刷新图片显示URL: ${imageId}`);

      const imageInfo = this.getImageInfo(imageId);
      if (!imageInfo || !imageInfo.localPath) {
        console.log(`❌ [refreshImageDisplayUrl] 图片无本地文件: ${imageId}`);
        return null;
      }

      // 清除旧的blob URL缓存（如果存在）
      if (imageInfo.displayUrl && imageInfo.displayUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(imageInfo.displayUrl);
          console.log(`🗑️ [refreshImageDisplayUrl] 已清除旧的blob URL缓存`);
        } catch (revokeError) {
          console.warn('清除blob URL失败:', revokeError);
        }
      }

      // 重新生成显示URL
      const newDisplayUrl = await this.getLocalImageDisplayUrl(imageId);

      if (newDisplayUrl) {
        console.log(`✅ [refreshImageDisplayUrl] 图片显示URL已刷新: ${imageId}`);
        return newDisplayUrl;
      } else {
        console.log(`❌ [refreshImageDisplayUrl] 刷新显示URL失败: ${imageId}`);
        return null;
      }

    } catch (error) {
      console.error(`❌ [refreshImageDisplayUrl] 刷新显示URL出错:`, error);
      return null;
    }
  }

  /**
   * 标记图片为已完成状态
   * 当用户在PS中修改图片并关闭文档时调用此方法
   * @param {string} imageId - 图片ID
   * @returns {Promise<boolean>} - 标记是否成功
   */
  async markImageAsCompleted(imageId) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`✅ [markImageAsCompleted] 标记图片为已完成状态: ${imageId}`);

      // 遍历产品数组查找并更新图片状态
      let imageFound = false;

      for (const product of this.indexData) {
        // 检查原始图片
        if (product.originalImages) {
          for (const img of product.originalImages) {
            if (img.imageUrl === imageId || img.localPath === imageId) {
              img.status = 'completed';
              img.completedTimestamp = Date.now();
              imageFound = true;
              console.log(`✅ [markImageAsCompleted] 原始图片 ${imageId} 已标记为已完成`);
              break;
            }
          }
        }

        // 检查SKU图片（如果原始图片中未找到）
        if (!imageFound && product.publishSkus) {
          for (const sku of product.publishSkus) {
            if (sku.skuImages) {
              for (const img of sku.skuImages) {
                if (img.imageUrl === imageId || img.localPath === imageId) {
                  img.status = 'completed';
                  img.completedTimestamp = Date.now();
                  imageFound = true;
                  console.log(`✅ [markImageAsCompleted] SKU图片 ${imageId} 已标记为已完成`);
                  break;
                }
              }
            }
            if (imageFound) break;
          }
        }

        // 检查场景图片（如果前面都未找到）
        if (!imageFound && product.senceImages) {
          for (const img of product.senceImages) {
            if (img.imageUrl === imageId || img.localPath === imageId) {
              img.status = 'completed';
              img.completedTimestamp = Date.now();
              imageFound = true;
              console.log(`✅ [markImageAsCompleted] 场景图片 ${imageId} 已标记为已完成`);
              break;
            }
          }
        }

        if (imageFound) break;
      }

      if (!imageFound) {
        console.warn(`⚠️ [markImageAsCompleted] 尝试标记不存在的图片为已完成: ${imageId}`);
        return false;
      }

      // 保存索引数据
      await this.saveIndexData();
      console.log(`💾 [markImageAsCompleted] 图片 ${imageId} 已完成状态已保存到索引`);

      return true;

    } catch (error) {
      console.error(`❌ [markImageAsCompleted] 标记图片已完成失败:`, error);
      return false;
    }
  }

  /**
   * 切换图片的完成状态
   * @param {string} imageId - 图片ID
   * @returns {Promise<{success: boolean, newStatus: string}>} - 操作结果和新状态
   */
  async toggleImageCompletedStatus(imageId) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🔄 [toggleImageCompletedStatus] 切换图片完成状态: ${imageId}`);

      // 查找图片信息
      const imageInfo = this.getImageInfo(imageId);
      if (!imageInfo) {
        console.warn(`⚠️ [toggleImageCompletedStatus] 未找到图片: ${imageId}`);
        return { success: false, newStatus: 'unknown' };
      }

      const currentStatus = imageInfo.status;
      let newStatus;

      // 根据当前状态切换
      if (currentStatus === 'completed') {
        // 如果当前是已完成，恢复到之前的状态（通常是modified或downloaded）
        newStatus = imageInfo.previousStatus || 'modified';
        console.log(`🔄 [toggleImageCompletedStatus] 从已完成状态恢复到: ${newStatus}`);
      } else {
        // 如果当前不是已完成，保存当前状态并标记为已完成
        imageInfo.previousStatus = currentStatus;
        newStatus = 'completed';
        imageInfo.completedTimestamp = Date.now();
        console.log(`🔄 [toggleImageCompletedStatus] 标记为已完成，原状态: ${currentStatus}`);
      }

      // 更新状态
      imageInfo.status = newStatus;

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [toggleImageCompletedStatus] 图片 ${imageId} 状态已切换: ${currentStatus} -> ${newStatus}`);
      return { success: true, newStatus: newStatus };

    } catch (error) {
      console.error(`❌ [toggleImageCompletedStatus] 切换图片完成状态失败:`, error);
      return { success: false, newStatus: 'error' };
    }
  }

  /**
   * 统一的图片状态设置方法
   * @param {string} imageId - 图片ID
   * @param {string} status - 新状态 ('pending_edit', 'editing', 'completed')
   * @returns {Promise<boolean>} - 设置是否成功
   */
  async setImageStatus(imageId, status) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🔄 [setImageStatus] 设置图片状态: ${imageId} → ${status}`);

      let imageFound = false;

      for (const product of this.indexData) {
        // 检查原始图片
        if (product.originalImages) {
          for (const img of product.originalImages) {
            if (img.imageUrl === imageId || img.localPath === imageId) {
              const oldStatus = img.status;
              img.status = status;
              img.statusUpdateTime = Date.now();

              // 根据状态设置相应的时间戳
              if (status === 'editing') {
                img.editingStartTime = Date.now();
              } else if (status === 'completed') {
                img.completedTimestamp = Date.now();
              }

              imageFound = true;
              console.log(`✅ [setImageStatus] 原始图片状态更新: ${imageId} (${oldStatus} → ${status})`);
              break;
            }
          }
        }

        // 检查SKU图片
        if (!imageFound && product.publishSkus) {
          for (const sku of product.publishSkus) {
            if (sku.skuImages) {
              for (const img of sku.skuImages) {
                if (img.imageUrl === imageId || img.localPath === imageId) {
                  const oldStatus = img.status;
                  img.status = status;
                  img.statusUpdateTime = Date.now();

                  if (status === 'editing') {
                    img.editingStartTime = Date.now();
                  } else if (status === 'completed') {
                    img.completedTimestamp = Date.now();
                  }

                  imageFound = true;
                  console.log(`✅ [setImageStatus] SKU图片状态更新: ${imageId} (${oldStatus} → ${status})`);
                  break;
                }
              }
            }
            if (imageFound) break;
          }
        }

        // 检查场景图片
        if (!imageFound && product.senceImages) {
          for (const img of product.senceImages) {
            if (img.imageUrl === imageId || img.localPath === imageId) {
              const oldStatus = img.status;
              img.status = status;
              img.statusUpdateTime = Date.now();

              if (status === 'editing') {
                img.editingStartTime = Date.now();
              } else if (status === 'completed') {
                img.completedTimestamp = Date.now();
              }

              imageFound = true;
              console.log(`✅ [setImageStatus] 场景图片状态更新: ${imageId} (${oldStatus} → ${status})`);
              break;
            }
          }
        }

        if (imageFound) break;
      }

      if (!imageFound) {
        console.warn(`⚠️ [setImageStatus] 未找到图片: ${imageId}`);
        return false;
      }

      // 保存索引数据
      await this.saveIndexData();
      return true;

    } catch (error) {
      console.error(`❌ [setImageStatus] 设置图片状态失败:`, error);
      return false;
    }
  }

  /**
   * 重置图片为编辑中状态
   * 用于已完成的图片再次在PS中打开时
   * @param {string} imageId - 图片ID
   * @returns {Promise<boolean>} - 重置是否成功
   */
  async resetImageToEditing(imageId) {
    try {
      console.log(`🔄 [resetImageToEditing] 重置图片为编辑中状态: ${imageId}`);

      const result = await this.setImageStatus(imageId, 'editing');

      if (result) {
        console.log(`✅ [resetImageToEditing] 图片已重置为编辑中状态: ${imageId}`);
      }

      return result;

    } catch (error) {
      console.error(`❌ [resetImageToEditing] 重置图片状态失败:`, error);
      return false;
    }
  }

  /**
   * 获取图片的当前状态
   * @param {string} imageId - 图片ID
   * @returns {string|null} - 当前状态
   */
  getImageStatus(imageId) {
    const imageInfo = this.getImageInfo(imageId);
    return imageInfo ? imageInfo.status : null;
  }

  /**
   * 检查图片是否处于某个状态
   * @param {string} imageId - 图片ID
   * @param {string} status - 要检查的状态
   * @returns {boolean} - 是否处于指定状态
   */
  isImageInStatus(imageId, status) {
    return this.getImageStatus(imageId) === status;
  }

  /**
   * 获取处于指定状态的所有图片
   * @param {string} status - 状态名称
   * @returns {Array} - 图片信息数组
   */
  getImagesByStatus(status) {
    const images = [];

    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.status === status) {
            images.push({
              imageId: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              type: 'original',
              ...img
            });
          }
        }
      }

      // 检查SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.status === status) {
                images.push({
                  imageId: img.imageUrl || img.localPath,
                  applyCode: product.applyCode,
                  type: 'sku',
                  skuIndex: sku.skuIndex,
                  ...img
                });
              }
            }
          }
        }
      }

      // 检查场景图片
      if (product.senceImages) {
        for (const img of product.senceImages) {
          if (img.status === status) {
            images.push({
              imageId: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              type: 'scene',
              ...img
            });
          }
        }
      }
    }

    return images;
  }

  /**
   * 获取所有已完成的图片列表
   * @returns {Array} 已完成的图片信息数组
   */
  getCompletedImages() {
    return this.getImagesByStatus('completed');
  }

  /**
   * 获取所有编辑中的图片列表
   * @returns {Array} 编辑中的图片信息数组
   */
  getEditingImages() {
    return this.getImagesByStatus('editing');
  }

  /**
   * 获取所有待编辑的图片列表
   * @returns {Array} 待编辑的图片信息数组
   */
  getPendingEditImages() {
    return this.getImagesByStatus('pending_edit');
  }

  /**
   * 检查图片状态是否表示图片可用
   * @param {string} status - 图片状态
   * @returns {boolean} - 是否可用
   */
  isImageStatusAvailable(status) {
    return status === 'pending_edit' ||
           status === 'editing' ||
           status === 'completed' ||
           // 保持向后兼容
           status === 'downloaded' ||
           status === 'local_added' ||
           status === 'synced' ||
           status === 'modified';
  }

  /**
   * 将旧状态迁移到新的三状态系统
   * @param {string} oldStatus - 旧状态
   * @returns {string} - 新状态
   */
  migrateToThreeStateSystem(oldStatus) {
    switch (oldStatus) {
      case 'downloaded':
      case 'local_added':
        return 'pending_edit';
      case 'modified':
      case 'synced':
        return 'editing';
      case 'completed':
        return 'completed';
      case 'pending_edit':
      case 'editing':
        return oldStatus; // 已经是新状态
      default:
        return 'pending_edit'; // 默认为待编辑状态
    }
  }

  /**
   * 批量迁移产品图片状态到三状态系统
   * @param {string} applyCode - 产品申请码
   * @returns {Promise<{migrated: number, total: number}>} - 迁移结果
   */
  async migrateProductToThreeStateSystem(applyCode) {
    if (!this.initialized) {
      await this.initialize();
    }

    let migratedCount = 0;
    let totalCount = 0;

    console.log(`🔄 [状态迁移] 开始迁移产品 ${applyCode} 的图片状态`);

    for (const product of this.indexData.products) {
      if (product.applyCode !== applyCode) continue;

      // 迁移原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          totalCount++;
          const newStatus = this.migrateToThreeStateSystem(img.status);
          if (newStatus !== img.status) {
            img.status = newStatus;
            migratedCount++;
            console.log(`✅ [状态迁移] 原始图片: ${img.imageUrl?.substring(0, 30)}... (${img.status} → ${newStatus})`);
          }
        }
      }

      // 迁移SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              totalCount++;
              const newStatus = this.migrateToThreeStateSystem(img.status);
              if (newStatus !== img.status) {
                img.status = newStatus;
                migratedCount++;
                console.log(`✅ [状态迁移] SKU图片: ${img.imageUrl?.substring(0, 30)}... (${img.status} → ${newStatus})`);
              }
            }
          }
        }
      }

      // 迁移场景图片
      if (product.senceImages) {
        for (const img of product.senceImages) {
          totalCount++;
          const newStatus = this.migrateToThreeStateSystem(img.status);
          if (newStatus !== img.status) {
            img.status = newStatus;
            migratedCount++;
            console.log(`✅ [状态迁移] 场景图片: ${img.imageUrl?.substring(0, 30)}... (${img.status} → ${newStatus})`);
          }
        }
      }
    }

    if (migratedCount > 0) {
      await this.saveIndexData();
      console.log(`🎉 [状态迁移] 完成迁移: ${migratedCount}/${totalCount} 张图片状态已更新`);
    } else {
      console.log(`ℹ️ [状态迁移] 无需迁移: 所有图片状态都是最新的`);
    }

    return { migrated: migratedCount, total: totalCount };
  }

  /**
   * 获取图片状态的统计信息
   * @returns {Object} 状态统计
   */
  getStatusStats() {
    const stats = {
      pending_edit: 0,
      editing: 0,
      completed: 0,
      other: 0
    };

    for (const product of this.indexData) {
      // 统计原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (stats.hasOwnProperty(img.status)) {
            stats[img.status]++;
          } else {
            stats.other++;
          }
        }
      }

      // 统计SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (stats.hasOwnProperty(img.status)) {
                stats[img.status]++;
              } else {
                stats.other++;
              }
            }
          }
        }
      }

      // 统计场景图片
      if (product.senceImages) {
        for (const img of product.senceImages) {
          if (stats.hasOwnProperty(img.status)) {
            stats[img.status]++;
          } else {
            stats.other++;
          }
        }
      }
    }

    return stats;
  }

  /**
   * 旧版获取已完成图片的方法（保持向后兼容）
   * @returns {Array} 已完成的图片信息数组
   */
  getCompletedImagesLegacy() {
    const completedImages = [];

    // 遍历所有产品查找状态为completed的图片
    for (const product of this.indexData) {
      // 检查原始图片
      if (product.originalImages) {
        for (const img of product.originalImages) {
          if (img.status === 'completed') {
            completedImages.push({
              imageId: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              type: 'original',
              completedTimestamp: img.completedTimestamp,
              ...img
            });
          }
        }
      }

      // 检查SKU图片
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              if (img.status === 'completed') {
                completedImages.push({
                  imageId: img.imageUrl || img.localPath,
                  applyCode: product.applyCode,
                  type: 'sku',
                  skuIndex: sku.skuIndex,
                  completedTimestamp: img.completedTimestamp,
                  ...img
                });
              }
            }
          }
        }
      }

      // 检查场景图片
      if (product.senceImages) {
        for (const img of product.senceImages) {
          if (img.status === 'completed') {
            completedImages.push({
              imageId: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              type: 'scene',
              completedTimestamp: img.completedTimestamp,
              ...img
            });
          }
        }
      }
    }

    // 按完成时间排序（最新的在前）
    completedImages.sort((a, b) => (b.completedTimestamp || 0) - (a.completedTimestamp || 0));

    console.log(`📊 [getCompletedImages] 找到 ${completedImages.length} 张已完成的图片`);
    return completedImages;
  }

  /**
   * 清除指定图片的显示URL缓存
   * @param {string} imageId - 图片ID
   */
  /**
   * 基于索引删除图片（高效版本 - 仅从索引中移除，保留本地文件）
   * @param {string} applyCode 产品申请码
   * @param {string} imageType 图片类型：'original', 'sku', 'scene'（保持兼容性）
   * @param {number} imageIndex 图片在对应数组中的索引
   * @param {number} skuIndex SKU索引（仅对sku类型图片）
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteImageByIndex(applyCode, imageType, imageIndex, skuIndex = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🗑️ [deleteImageByIndex] 通过索引删除图片: 产品=${applyCode}, 类型=${imageType}, 索引=${imageIndex}, SKU索引=${skuIndex}`);

      // 查找产品
      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        console.warn(`❌ [deleteImageByIndex] 未找到产品: ${applyCode}`);
        return false;
      }

      let imageInfo = null;
      let deletedSuccessfully = false;

      // 根据类型通过索引直接删除
      if (imageType === 'original') {
        if (product.originalImages && imageIndex >= 0 && imageIndex < product.originalImages.length) {
          imageInfo = product.originalImages[imageIndex];
          product.originalImages.splice(imageIndex, 1);
          deletedSuccessfully = true;
          console.log(`✅ [deleteImageByIndex] 从原始图片索引中移除: 索引=${imageIndex}`);
        }
      } else if (imageType === 'sku') {
        if (product.publishSkus) {
          const sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
          if (sku && sku.skuImages && imageIndex >= 0 && imageIndex < sku.skuImages.length) {
            imageInfo = sku.skuImages[imageIndex];
            sku.skuImages.splice(imageIndex, 1);
            deletedSuccessfully = true;
            console.log(`✅ [deleteImageByIndex] 从SKU图片索引中移除: SKU=${skuIndex}, 索引=${imageIndex}`);
          }
        }
      } else if (imageType === 'scene') {
        if (product.senceImages && imageIndex >= 0 && imageIndex < product.senceImages.length) {
          imageInfo = product.senceImages[imageIndex];
          product.senceImages.splice(imageIndex, 1);
          deletedSuccessfully = true;
          console.log(`✅ [deleteImageByIndex] 从场景图片索引中移除: 索引=${imageIndex}`);
        }
      }

      if (!deletedSuccessfully) {
        console.warn(`❌ [deleteImageByIndex] 删除失败: 无效的索引或数据不存在`);
        return false;
      }

      // 注意：仅从索引中移除记录，保留本地文件
      if (imageInfo && imageInfo.localPath) {
        console.log(`📝 [deleteImageByIndex] 从索引中移除图片记录，保留本地文件: ${imageInfo.localPath}`);
      }


      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [deleteImageByIndex] 图片记录已从索引中移除（本地文件保留）`);
      return true;

    } catch (error) {
      console.error(`❌ [deleteImageByIndex] 删除图片失败: ${error.message}`, error);
      return false;
    }
  }

  /**
   * 删除图片（仅从索引中移除，保留本地文件）- 兼容旧版本
   * @param {string} imageUrl 图片URL
   * @param {string} applyCode 产品申请码
   * @param {string} imageType 图片类型（保持兼容性，内部自动判断）
   * @param {number} skuIndex SKU索引（仅对sku类型图片）
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteImage(imageUrl, applyCode, imageType, skuIndex = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`📝 [deleteImage] 开始从索引中移除图片记录: ${imageUrl}, 类型: ${imageType}, 产品: ${applyCode}`);

      // 查找产品
      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        console.warn(`❌ [deleteImage] 未找到产品: ${applyCode}`);
        return false;
      }

      let imageFound = false;
      let imageInfo = null;

      // 根据类型从不同位置移除图片记录
      if (imageType === 'original') {
        // 从原始图片索引中移除
        if (product.originalImages) {
          const imageIndex = product.originalImages.findIndex(img => img.imageUrl === imageUrl);
          if (imageIndex !== -1) {
            imageInfo = product.originalImages[imageIndex];
            product.originalImages.splice(imageIndex, 1);
            imageFound = true;
            console.log(`✅ [deleteImage] 从原始图片索引中移除: ${imageUrl}`);
          }
        }
      } else if (imageType === 'sku') {
        // 从SKU图片索引中移除
        if (product.publishSkus) {
          for (const sku of product.publishSkus) {
            if ((skuIndex !== null && sku.skuIndex === skuIndex) || skuIndex === null) {
              if (sku.skuImages) {
                const imageIndex = sku.skuImages.findIndex(img => img.imageUrl === imageUrl);
                if (imageIndex !== -1) {
                  imageInfo = sku.skuImages[imageIndex];
                  sku.skuImages.splice(imageIndex, 1);
                  imageFound = true;
                  console.log(`✅ [deleteImage] 从SKU图片索引中移除: ${imageUrl}, SKU: ${sku.skuIndex}`);
                  break;
                }
              }
            }
          }
        }
      } else if (imageType === 'scene') {
        // 从场景图片索引中移除
        if (product.senceImages) {
          const imageIndex = product.senceImages.findIndex(img => img.imageUrl === imageUrl);
          if (imageIndex !== -1) {
            imageInfo = product.senceImages[imageIndex];
            product.senceImages.splice(imageIndex, 1);
            imageFound = true;
            console.log(`✅ [deleteImage] 从场景图片索引中移除: ${imageUrl}`);
          }
        }
      }

      if (!imageFound) {
        console.warn(`❌ [deleteImage] 未找到要删除的图片记录: ${imageUrl}`);
        return false;
      }

      // 注意：仅从索引中移除记录，保留本地文件
      if (imageInfo && imageInfo.localPath) {
        console.log(`📝 [deleteImage] 从索引中移除图片记录，保留本地文件: ${imageInfo.localPath}`);
        // 不删除本地文件，只是从索引中移除记录
        // 这样用户仍然可以在文件系统中找到原始文件
      }

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [deleteImage] 图片记录已从索引中移除（本地文件保留）: ${imageUrl}`);
      return true;

    } catch (error) {
      console.error(`❌ [deleteImage] 删除图片失败: ${error.message}`, error);
      return false;
    }
  }

}

// 创建单例实例
export const localImageManager = new LocalImageManager();

// 默认导出单例
export default localImageManager;