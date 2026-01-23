// LocalImageManager.js - 本地图片管理器
// 负责产品图片的本地存储、下载、索引和同步管理

import { get } from './http.js';
import { storageLocationManager } from './StorageLocationManager.js';

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
 * 根据文件扩展名获取MIME类型（仅支持PNG和JPG格式）
 * @param {string} filename - 文件名
 * @returns {string} MIME类型
 */
const getMimeTypeFromExtension = (filename) => {
  if (!filename) return 'image/jpeg'; // 默认值

  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.') + 1);

  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png'
  };

  return mimeTypes[extension] || 'image/jpeg'; // 默认返回jpeg
};

/**
 * 验证文件是否为支持的图片格式
 * @param {string} filename - 文件名
 * @returns {boolean} 是否为支持的格式
 */
const isValidImageFormat = (filename) => {
  if (!filename) return false;

  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.') + 1);
  const supportedFormats = ['jpg', 'jpeg', 'png'];

  return supportedFormats.includes(extension);
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
    this.productFolderCache = new Map(); // 产品文件夹缓存 {applyCode: folderObject}
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

        // 🔥 自动修复索引数据：检测文件系统与索引的一致性
        console.log('🔧 [LocalImageManager] 执行自动索引修复...');
        // 临时标记为已初始化，以便 repairIndexData 可以执行
        this.initialized = true;
        const repairedCount = await this.repairIndexData();
        if (repairedCount > 0) {
          console.log(`✅ [LocalImageManager] 自动修复了 ${repairedCount} 条索引记录`);
        } else {
          console.log('✅ [LocalImageManager] 索引数据完整，无需修复');
        }
      } else {
        this.initialized = true;
      }

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
      // 使用存储位置管理器获取用户选择的本地文件夹
      console.log('🚀 [LocalImageManager] 获取存储位置...');
      const baseFolder = await storageLocationManager.getStorageFolder();
      console.log('✅ [LocalImageManager] 基础文件夹:', baseFolder.nativePath);

      // 在用户选择的文件夹下创建插件专用目录
      let pluginFolder;
      try {
        pluginFolder = await baseFolder.createFolder('tvcmall-plugin', { overwrite: false });
      } catch (error) {
        if (error.message.includes('exists')) {
          pluginFolder = await baseFolder.getEntry('tvcmall-plugin');
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

      console.log('✅ [LocalImageManager] 图片存储目录:', this.imageFolder.nativePath);
    } catch (error) {
      console.error('❌ [LocalImageManager] 创建图片存储目录失败:', error);
      throw new Error(`无法创建图片存储目录: ${error.message}`);
    }
  }

  /**
   * 获取或创建产品文件夹
   * @param {string} applyCode - 产品申请码
   * @returns {Promise<Folder>} 产品文件夹对象
   */
  async getOrCreateProductFolder(applyCode) {
    if (!applyCode) {
      throw new Error('产品申请码不能为空');
    }

    // 检查缓存
    if (this.productFolderCache.has(applyCode)) {
      return this.productFolderCache.get(applyCode);
    }

    try {
      let productFolder;
      try {
        // 尝试创建产品文件夹
        productFolder = await this.imageFolder.createFolder(applyCode, { overwrite: false });
        console.log(`✅ [getOrCreateProductFolder] 创建产品文件夹: ${applyCode}`);
      } catch (error) {
        if (error.message.includes('exists')) {
          // 文件夹已存在，直接获取
          productFolder = await this.imageFolder.getEntry(applyCode);
          console.log(`📁 [getOrCreateProductFolder] 产品文件夹已存在: ${applyCode}`);
        } else {
          throw error;
        }
      }

      // 缓存文件夹引用
      this.productFolderCache.set(applyCode, productFolder);
      return productFolder;
    } catch (error) {
      console.error(`❌ [getOrCreateProductFolder] 创建/获取产品文件夹失败: ${applyCode}`, error);
      throw new Error(`无法创建产品文件夹 ${applyCode}: ${error.message}`);
    }
  }

  /**
   * 根据路径获取文件（支持产品子文件夹）
   * @param {string} localPath - 本地路径（格式：applyCode/filename.jpg）
   * @returns {Promise<File>} 文件对象
   */
  async getFileByPath(localPath) {
    if (!localPath) {
      throw new Error('文件路径不能为空');
    }

    try {
      // 解析路径：applyCode/filename.jpg
      const pathParts = localPath.split('/');

      if (pathParts.length !== 2) {
        throw new Error(`无效的文件路径格式: ${localPath}，期望格式：applyCode/filename.jpg`);
      }

      const [folderName, fileName] = pathParts;

      // 获取产品文件夹
      const productFolder = await this.getOrCreateProductFolder(folderName);

      // 获取文件
      const file = await productFolder.getEntry(fileName);
      return file;
    } catch (error) {
      console.error(`❌ [getFileByPath] 获取文件失败: ${localPath}`, error);
      throw error;
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

        // 数据完整性检查和自动修复
        const fixedCount = this.validateAndFixImageData();
        if (fixedCount > 0) {
          console.log(`🔧 [loadIndexData] 修复了 ${fixedCount} 个缺失localPath的图片记录，已自动保存`);
          // 异步保存修复后的数据，不阻塞加载流程
          this.saveIndexData().catch(error => {
            console.error('❌ [loadIndexData] 保存修复后的数据失败:', error);
          });
        }

        // 自动修复 hasLocal 字段
        let hasLocalFixedCount = 0;
        this.indexData.forEach(product => {
          // 修复原始图片
          if (product.originalImages) {
            product.originalImages.forEach(img => {
              if (img.localPath && img.hasLocal === undefined) {
                img.hasLocal = true;
                hasLocalFixedCount++;
              } else if (!img.localPath && img.hasLocal === true) {
                img.hasLocal = false;
                hasLocalFixedCount++;
              }
            });
          }

          // 修复场景图片
          if (product.senceImages) {
            product.senceImages.forEach(img => {
              if (img.localPath && img.hasLocal === undefined) {
                img.hasLocal = true;
                hasLocalFixedCount++;
              } else if (!img.localPath && img.hasLocal === true) {
                img.hasLocal = false;
                hasLocalFixedCount++;
              }
            });
          }

          // 修复SKU图片
          if (product.publishSkus) {
            product.publishSkus.forEach(sku => {
              if (sku.skuImages) {
                sku.skuImages.forEach(img => {
                  if (img.localPath && img.hasLocal === undefined) {
                    img.hasLocal = true;
                    hasLocalFixedCount++;
                  } else if (!img.localPath && img.hasLocal === true) {
                    img.hasLocal = false;
                    hasLocalFixedCount++;
                  }
                });
              }
            });
          }
        });

        if (hasLocalFixedCount > 0) {
          console.log(`✅ [loadIndexData] 自动修复了 ${hasLocalFixedCount} 个图片的 hasLocal 字段`);
          // 异步保存修复后的数据
          this.saveIndexData().catch(error => {
            console.error('❌ [loadIndexData] 保存 hasLocal 修复后的数据失败:', error);
          });
        }
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
   * 验证并修复图片数据的完整性
   * 检查所有图片是否缺少 localPath 字段，如果缺少则重置状态为 not_downloaded
   * @returns {number} 修复的图片数量
   */
  validateAndFixImageData() {
    let fixedCount = 0;

    console.log('🔍 [validateAndFixImageData] 开始检查图片数据完整性...');

    this.indexData.forEach((product) => {
      // 检查原始图片
      if (Array.isArray(product.originalImages)) {
        product.originalImages.forEach((img, index) => {
          if (this.needsFixing(img)) {
            console.log(`🔧 [validateAndFixImageData] 修复原始图片: ${product.applyCode} - ${index}`);
            img.status = 'not_downloaded';
            img.timestamp = Date.now();
            fixedCount++;
          }
        });
      }

      // 检查SKU图片
      if (Array.isArray(product.publishSkus)) {
        product.publishSkus.forEach((sku, skuIndex) => {
          if (Array.isArray(sku.skuImages)) {
            sku.skuImages.forEach((img, imgIndex) => {
              if (this.needsFixing(img)) {
                console.log(`🔧 [validateAndFixImageData] 修复SKU图片: ${product.applyCode} - SKU${skuIndex} - ${imgIndex}`);
                img.status = 'not_downloaded';
                img.timestamp = Date.now();
                fixedCount++;
              }
            });
          }
        });
      }

      // 检查场景图片
      if (Array.isArray(product.senceImages)) {
        product.senceImages.forEach((img, index) => {
          if (this.needsFixing(img)) {
            console.log(`🔧 [validateAndFixImageData] 修复场景图片: ${product.applyCode} - ${index}`);
            img.status = 'not_downloaded';
            img.timestamp = Date.now();
            fixedCount++;
          }
        });
      }
    });

    if (fixedCount > 0) {
      console.log(`✅ [validateAndFixImageData] 共修复了 ${fixedCount} 个缺失localPath的图片记录`);
    } else {
      console.log(`✅ [validateAndFixImageData] 图片数据完整性检查通过，无需修复`);
    }

    return fixedCount;
  }

  /**
   * 判断图片是否需要修复
   * 如果图片缺少 localPath 但状态不是 'not_downloaded' 或 'download_failed'，则需要修复
   * @param {Object} img 图片对象
   * @returns {boolean} 是否需要修复
   */
  needsFixing(img) {
    // 如果没有 localPath 字段（或为空字符串）
    const hasNoLocalPath = !img.localPath || img.localPath === '';

    // 如果状态不是 'not_downloaded' 或 'download_failed'
    const hasInvalidStatus = img.status &&
                            img.status !== 'not_downloaded' &&
                            img.status !== 'download_failed';

    return hasNoLocalPath && hasInvalidStatus;
  }

  /**
   * 保存产品索引数据
   */
  async saveIndexData() {
    try {
      if (!this.imageFolder) {
        throw new Error('图片存储目录未初始化');
      }

      console.log(`💾 [saveIndexData] 准备保存 ${this.indexData.length} 个产品的索引数据`);

      // 验证数据完整性
      let totalImages = 0;
      let imagesWithLocalPath = 0;
      let imagesWithoutLocalPath = 0;

      this.indexData.forEach((product, index) => {
        let productImageCount = 0;
        let productImagesWithPath = 0;

        // 统计原始图片
        if (product.originalImages) {
          product.originalImages.forEach(img => {
            productImageCount++;
            totalImages++;
            if (img.localPath) {
              productImagesWithPath++;
              imagesWithLocalPath++;
            } else if (img.status !== 'not_downloaded' && img.status !== 'download_failed') {
              imagesWithoutLocalPath++;
              console.warn(`⚠️ [saveIndexData] 产品${product.applyCode} 原始图片缺少localPath但status=${img.status}:`, img.imageUrl);
            }
          });
        }

        // 统计SKU图片
        if (product.publishSkus) {
          product.publishSkus.forEach(sku => {
            if (sku.skuImages) {
              sku.skuImages.forEach(img => {
                productImageCount++;
                totalImages++;
                if (img.localPath) {
                  productImagesWithPath++;
                  imagesWithLocalPath++;
                } else if (img.status !== 'not_downloaded' && img.status !== 'download_failed') {
                  imagesWithoutLocalPath++;
                  console.warn(`⚠️ [saveIndexData] 产品${product.applyCode} SKU${sku.skuIndex}图片缺少localPath但status=${img.status}:`, img.imageUrl);
                }
              });
            }
          });
        }

        // 统计场景图片
        if (product.senceImages) {
          product.senceImages.forEach(img => {
            productImageCount++;
            totalImages++;
            if (img.localPath) {
              productImagesWithPath++;
              imagesWithLocalPath++;
            } else if (img.status !== 'not_downloaded' && img.status !== 'download_failed') {
              imagesWithoutLocalPath++;
              console.warn(`⚠️ [saveIndexData] 产品${product.applyCode} 场景图片缺少localPath但status=${img.status}:`, img.imageUrl);
            }
          });
        }

        if (index < 3 || productImageCount > 0) {
          console.log(`📊 [saveIndexData] 产品${index + 1} (${product.applyCode}): ${productImageCount}张图片, ${productImagesWithPath}张有localPath`);
        }
      });

      console.log(`📊 [saveIndexData] 统计汇总: 总图片=${totalImages}, 有localPath=${imagesWithLocalPath}, 缺少localPath=${imagesWithoutLocalPath}`);

      if (imagesWithoutLocalPath > 0) {
        console.warn(`⚠️ [saveIndexData] 发现 ${imagesWithoutLocalPath} 张图片缺少localPath但状态不是not_downloaded/download_failed`);
      }

      const indexFile = await this.imageFolder.createFile('index.json', { overwrite: true });

      // 直接保存产品数组格式
      await indexFile.write(JSON.stringify(this.indexData, null, 2), { format: formats.utf8 });
      console.log(`✅ [saveIndexData] 产品索引数据已成功保存: ${this.indexData.length} 个产品`);
    } catch (error) {
      console.error('❌ [saveIndexData] 保存索引数据失败:', error);
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
   * 跳过失败的图片（标记为失败状态，不再重试下载）
   * @param {Array} failedErrors 失败的错误列表 [{imageInfo, error}]
   * @returns {number} 跳过的图片数量
   */
  async skipFailedImages(failedErrors) {
    console.log(`=== skipFailedImages 被调用，跳过 ${failedErrors.length} 张失败的图片 ===`);

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Array.isArray(failedErrors) || failedErrors.length === 0) {
      console.log('没有需要跳过的图片');
      return 0;
    }

    let skippedCount = 0;

    for (const { imageInfo, error } of failedErrors) {
      try {
        const { imageUrl, applyCode, sourceIndex, skuIndex, imageType } = imageInfo;
        const url = imageUrl || imageInfo.url;

        if (!url || !applyCode) {
          console.warn(`跳过图片失败: 缺少必要信息`, imageInfo);
          continue;
        }

        console.log(`⏭️ 跳过图片: ${url}`);

        // 获取或创建产品
        const product = this.getOrCreateProduct(applyCode);

        // 创建失败状态的图片记录（imageUrl存在，localPath为空）
        const failedImageData = {
          imageUrl: url,
          localPath: '', // 空的localPath表示未下载
          status: 'download_failed', // 标记为下载失败
          timestamp: Date.now(),
          error: error || '下载失败',
          fileSize: 0,
          hasLocal: false
        };

        // 根据imageType和skuIndex判断图片类型，添加到相应位置
        if (imageType === 'scene') {
          // 处理场景图片
          let sceneImage = product.senceImages.find(img => img.imageUrl === url);
          if (!sceneImage) {
            sceneImage = { ...failedImageData, index: sourceIndex };
            product.senceImages.push(sceneImage);
          } else {
            Object.assign(sceneImage, failedImageData, { index: sourceIndex });
          }
        } else if (skuIndex !== undefined && skuIndex !== null) {
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

          let skuImage = sku.skuImages.find(img => img.imageUrl === url);
          if (!skuImage) {
            skuImage = { ...failedImageData, index: sourceIndex };
            sku.skuImages.push(skuImage);
          } else {
            Object.assign(skuImage, failedImageData, { index: sourceIndex });
          }
        } else {
          // 处理原始图片
          let originalImage = product.originalImages.find(img => img.imageUrl === url);
          if (!originalImage) {
            originalImage = { ...failedImageData };
            product.originalImages.push(originalImage);
          } else {
            Object.assign(originalImage, failedImageData);
          }
        }

        skippedCount++;
        console.log(`✅ 已标记图片为失败状态: ${url}`);
      } catch (err) {
        console.error(`标记失败图片时出错:`, err);
      }
    }

    // 保存索引数据
    console.log('=== 保存索引数据到本地存储 ===');
    await this.saveIndexData();

    console.log(`=== 跳过完成: 共标记 ${skippedCount} 张图片为失败状态 ===`);
    return skippedCount;
  }

  /**
   * 检查是否需要下载图片
   * 支持同一imageUrl在多个位置（SKU、场景图）出现的情况
   * @param {Object} imageInfo 图片信息
   * @returns {boolean} 是否需要下载
   */
  async shouldDownloadImage(imageInfo) {
    const { id, url, imageUrl, applyCode, skuIndex, sourceIndex } = imageInfo;
    // 🔧 兼容 imageType 和 type 字段
    const imageType = imageInfo.imageType || imageInfo.type;
    const actualUrl = url || imageUrl;

    console.log(`🤔 [shouldDownloadImage] 检查图片是否需要下载:`, {
      id: id,
      urlPreview: actualUrl ? actualUrl.substring(0, 50) + '...' : null,
      applyCode: applyCode,
      imageType: imageType,
      skuIndex: skuIndex,
      sourceIndex: sourceIndex
    });

    if (!id || !actualUrl || !applyCode) {
      console.log(`❌ [shouldDownloadImage] 缺少必要信息，跳过下载`);
      return false;
    }

    // 查找产品
    const product = this.findProductByApplyCode(applyCode);
    if (!product) {
      console.log(`✅ [shouldDownloadImage] 产品不存在，需要下载并创建: ${applyCode}`);
      return true;
    }

    // 根据 imageType 和 skuIndex 找到特定位置的图片记录
    let targetImage = null;
    let locationDesc = '';

    if (imageType === 'scene') {
      // 查找场景图片（兼容 imageUrl 和 url 字段）
      locationDesc = `场景图片[${sourceIndex}]`;
      if (product.senceImages) {
        targetImage = product.senceImages.find(img =>
          img.imageUrl === actualUrl || img.url === actualUrl
        );
      }
    } else if (skuIndex !== undefined && skuIndex !== null) {
      // 查找SKU图片（兼容 imageUrl 和 url 字段）
      locationDesc = `SKU[${skuIndex}]图片[${sourceIndex}]`;
      const sku = product.publishSkus?.find(s => s.skuIndex === skuIndex);
      if (sku && sku.skuImages) {
        targetImage = sku.skuImages.find(img =>
          img.imageUrl === actualUrl || img.url === actualUrl
        );
      }
    } else {
      // 查找原始图片（兼容 imageUrl 和 url 字段）
      locationDesc = `原始图片[${sourceIndex}]`;
      if (product.originalImages) {
        targetImage = product.originalImages.find(img =>
          img.imageUrl === actualUrl || img.url === actualUrl
        );
      }
    }

    console.log(`🔍 [shouldDownloadImage] ${locationDesc} 索引状态:`, {
      found: !!targetImage,
      status: targetImage?.status,
      hasLocalPath: !!targetImage?.localPath,
      localPath: targetImage?.localPath
    });

    // 如果该位置的记录不存在或没有localPath，需要下载
    if (!targetImage || !targetImage.localPath) {
      console.log(`✅ [shouldDownloadImage] ${locationDesc} 索引未更新，需要下载/更新`);
      return true;
    }

    // 检查是否已标记为下载失败（用户已跳过）
    if (targetImage.status === 'download_failed') {
      console.log(`⏭️ [shouldDownloadImage] ${locationDesc} 已标记为下载失败，跳过下载`);
      return false;
    }

    // 检查本地文件是否存在
    try {
      console.log(`🔍 [shouldDownloadImage] 检查本地文件: ${targetImage.localPath}`);
      const localFile = await this.getFileByPath(targetImage.localPath);
      if (!localFile) {
        console.log(`✅ [shouldDownloadImage] ${locationDesc} 本地文件不存在，需要重新下载`);
        return true;
      }

      // 检查URL是否发生变化
      if (targetImage.imageUrl !== actualUrl) {
        console.log(`✅ [shouldDownloadImage] ${locationDesc} URL已变化，需要重新下载`);
        return true;
      }

      // 检查文件是否过期（可选：7天）
      const fileAge = Date.now() - (targetImage.timestamp || 0);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
      if (fileAge > maxAge) {
        console.log(`✅ [shouldDownloadImage] ${locationDesc} 已过期，需要重新下载 (年龄: ${Math.round(fileAge / (24 * 60 * 60 * 1000))} 天)`);
        return true;
      }

      console.log(`❌ [shouldDownloadImage] ${locationDesc} 本地文件存在且有效，跳过下载`);
      return false;
    } catch (error) {
      console.warn(`✅ [shouldDownloadImage] ${locationDesc} 文件检查失败:`, error);
      console.log(`✅ [shouldDownloadImage] 因为文件检查失败，将重新下载`);
      return true;
    }
  }

  /**
   * 下载单张图片
   * @param {Object} imageInfo 图片信息
   */
  async downloadSingleImage(imageInfo) {
    // 🔍 调试：记录接收到的完整 imageInfo
    console.log(`🔍 [DEBUG-downloadSingleImage] 接收到的 imageInfo:`, {
      id: imageInfo.id,
      imageType: imageInfo.imageType,
      imageTypeType: typeof imageInfo.imageType,
      applyCode: imageInfo.applyCode,
      sourceIndex: imageInfo.sourceIndex,
      skuIndex: imageInfo.skuIndex,
      hasImageUrl: !!imageInfo.imageUrl,
      hasUrl: !!imageInfo.url,
      urlPreview: (imageInfo.imageUrl || imageInfo.url)?.substring(0, 60) + '...',
      allKeys: Object.keys(imageInfo)
    });

    // 提取参数
    let { imageUrl, applyCode, sourceIndex, skuIndex } = imageInfo;

    // 🔧 兼容 imageType 和 type 字段（修复字段名不统一问题）
    const imageType = imageInfo.imageType || imageInfo.type;

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

        // 解析路径
        const pathParts = localFilename.split('/');
        if (pathParts.length !== 2) {
          throw new Error(`无效的文件路径格式: ${localFilename}`);
        }
        const [folderName, fileName] = pathParts;

        // 获取或创建产品文件夹
        const productFolder = await this.getOrCreateProductFolder(folderName);

        // 检查文件是否已存在
        let arrayBuffer;
        let localFile;
        try {
          localFile = await productFolder.getEntry(fileName);
          if (localFile && localFile.isFile) {
            // 文件已存在，读取文件大小
            arrayBuffer = await localFile.read({ format: formats.binary });
            console.log(`📂 [downloadSingleImage] 文件已存在，跳过下载: ${localFilename} (大小: ${arrayBuffer.byteLength} bytes)`);
          } else {
            localFile = null;
          }
        } catch (err) {
          // 文件不存在，需要下载
          localFile = null;
        }

        // 如果文件不存在，下载图片
        if (!localFile) {
          console.log(`⬇️ [downloadSingleImage] 开始下载图片: ${url}`);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
          }

          arrayBuffer = await response.arrayBuffer();

          // 在产品文件夹中创建文件
          localFile = await productFolder.createFile(fileName, { overwrite: true });
          await localFile.write(arrayBuffer, { format: formats.binary });
          console.log(`✅ [downloadSingleImage] 文件下载完成: ${localFilename} (大小: ${arrayBuffer.byteLength} bytes)`);
        }

        // 更新产品数据中的图片信息
        const product = this.getOrCreateProduct(applyCode);
        console.log(`📝 [downloadSingleImage] 准备更新索引 - 产品: ${applyCode}, imageType: ${imageType}, skuIndex: ${skuIndex}, sourceIndex: ${sourceIndex}`);

        // 🔍 调试：显式检查 imageType 条件
        console.log(`🔍 [DEBUG-imageType判断] imageType 详细检查:`, {
          imageType: imageType,
          imageTypeType: typeof imageType,
          原始imageType: imageInfo.imageType,
          原始type: imageInfo.type,
          isScene: imageType === 'scene',
          isSceneStrict: imageType === 'scene' && typeof imageType === 'string',
          equalsSence: imageType === 'sence',
          productHasSenceImages: !!product.senceImages,
          senceImagesType: Array.isArray(product.senceImages) ? 'array' : typeof product.senceImages,
          senceImagesLength: product.senceImages?.length || 0
        });

        // 🔧 根据 imageType 和 skuIndex 判断图片类型（使用兼容后的 imageType 变量）
        if (imageType === 'scene') {
          // 处理场景图片 - 支持同一imageUrl多次出现
          console.log(`🔍 [downloadSingleImage] 查找场景图片: ${url}`);
          console.log(`🔍 [downloadSingleImage] 当前场景图片数组:`, product.senceImages);
          console.log(`🔍 [downloadSingleImage] 场景图片字段检查:`, product.senceImages.map((img, i) => ({
            index: i,
            hasImageUrl: !!img.imageUrl,
            hasUrl: !!img.url,
            imageUrl: img.imageUrl,
            url: img.url,
            allKeys: Object.keys(img)
          })));

          // 收集所有匹配的场景图片（支持重复imageUrl，兼容url和imageUrl两种字段名）
          const matchedSceneImages = product.senceImages.filter(img =>
            img.imageUrl === url || img.url === url
          );

          // 🔍 调试：记录匹配结果
          console.log(`🔍 [DEBUG-filter结果] 场景图片匹配结果:`, {
            查找的url: url,
            urlLength: url.length,
            匹配数量: matchedSceneImages.length,
            索引中总场景图片数: product.senceImages.length
          });

          if (matchedSceneImages.length === 0) {
            console.log(`⚠️ [DEBUG-filter结果] 未找到匹配的场景图片！索引中的所有场景图片URL:`,
              product.senceImages.map((img, i) => ({
                index: i,
                imageUrl: img.imageUrl,
                imageUrlLength: img.imageUrl?.length,
                url: img.url,
                urlLength: img.url?.length,
                imageUrl匹配: img.imageUrl === url,
                url匹配: img.url === url,
                status: img.status,
                hasLocalPath: !!img.localPath
              }))
            );
          }

          if (matchedSceneImages.length > 0) {
            console.log(`📝 [downloadSingleImage] 找到 ${matchedSceneImages.length} 个匹配的场景图片，准备全部更新`);

            matchedSceneImages.forEach((sceneImage, idx) => {
              console.log(`📝 [downloadSingleImage] 更新前的场景图片 ${idx + 1}:`, JSON.stringify(sceneImage));

              // 更新图片信息（确保imageUrl字段存在，以便后续查找）
              Object.assign(sceneImage, {
                imageUrl: url,  // 统一字段名称为 imageUrl
                localPath: localFilename,
                status: 'pending_edit',
                timestamp: Date.now(),
                fileSize: arrayBuffer.byteLength,
                index: sourceIndex,
                hasLocal: true
              });

              console.log(`✅ [downloadSingleImage] 更新后的场景图片 ${idx + 1}:`, JSON.stringify(sceneImage));

              // 验证更新
              if (!sceneImage.localPath || !sceneImage.fileSize) {
                console.error(`❌ [downloadSingleImage] 场景图片 ${idx + 1} 更新失败！缺少必要字段`);
              } else {
                console.log(`✅ [downloadSingleImage] 场景图片 ${idx + 1} 更新成功: localPath=${sceneImage.localPath}, fileSize=${sceneImage.fileSize}`);
              }
            });
          } else {
            console.log(`⚠️ [downloadSingleImage] 场景图片不存在，创建新记录`);
            const sceneImage = { imageUrl: url };
            product.senceImages.push(sceneImage);

            console.log(`📝 [downloadSingleImage] 更新前的场景图片:`, JSON.stringify(sceneImage));

            // 更新图片信息
            Object.assign(sceneImage, {
              localPath: localFilename,
              status: 'pending_edit',
              timestamp: Date.now(),
              fileSize: arrayBuffer.byteLength,
              index: sourceIndex,
              hasLocal: true
            });

            console.log(`✅ [downloadSingleImage] 更新后的场景图片:`, JSON.stringify(sceneImage));

            // 验证更新
            if (!sceneImage.localPath || !sceneImage.fileSize) {
              console.error(`❌ [downloadSingleImage] 场景图片更新失败！缺少必要字段`);
            } else {
              console.log(`✅ [downloadSingleImage] 场景图片更新成功: localPath=${sceneImage.localPath}, fileSize=${sceneImage.fileSize}`);
            }
          }
        } else if (skuIndex !== undefined && skuIndex !== null) {
          // 处理SKU图片 - 支持同一imageUrl在多个SKU中出现
          console.log(`🔍 [downloadSingleImage] 查找SKU图片: skuIndex=${skuIndex}, url=${url}`);
          console.log(`🔍 [downloadSingleImage] 当前publishSkus数组长度:`, product.publishSkus.length);

          // 收集所有包含该imageUrl的SKU图片（支持重复imageUrl）
          const matchedSkuImages = [];
          for (const s of product.publishSkus) {
            if (s.skuImages) {
              s.skuImages.forEach(img => {
                if (img.imageUrl === url) {
                  matchedSkuImages.push({ sku: s, image: img });
                  console.log(`🔍 [downloadSingleImage] 在SKU ${s.skuIndex} 中找到匹配图片`);
                }
              });
            }
          }

          // 如果找到匹配的图片，更新所有匹配项
          if (matchedSkuImages.length > 0) {
            console.log(`📝 [downloadSingleImage] 找到 ${matchedSkuImages.length} 个匹配的SKU图片，准备全部更新`);

            matchedSkuImages.forEach(({ sku, image }, idx) => {
              console.log(`📝 [downloadSingleImage] 更新前的SKU ${sku.skuIndex} 图片 ${idx + 1}:`, JSON.stringify(image));

              // 更新图片信息
              Object.assign(image, {
                localPath: localFilename,
                status: 'pending_edit',
                timestamp: Date.now(),
                fileSize: arrayBuffer.byteLength,
                index: sourceIndex,
                hasLocal: true
              });

              console.log(`✅ [downloadSingleImage] 更新后的SKU ${sku.skuIndex} 图片 ${idx + 1}:`, JSON.stringify(image));

              // 验证更新
              if (!image.localPath || !image.fileSize) {
                console.error(`❌ [downloadSingleImage] SKU ${sku.skuIndex} 图片 ${idx + 1} 更新失败！缺少必要字段`);
              } else {
                console.log(`✅ [downloadSingleImage] SKU ${sku.skuIndex} 图片 ${idx + 1} 更新成功: localPath=${image.localPath}, fileSize=${image.fileSize}`);
              }
            });
          } else {
            // 如果没找到图片，则按 skuIndex 查找或创建SKU
            console.log(`🔍 [downloadSingleImage] 图片不存在，按skuIndex查找SKU: ${skuIndex}`);
            let sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
            if (!sku) {
              console.log(`⚠️ [downloadSingleImage] SKU ${skuIndex} 不存在，创建新SKU`);
              sku = {
                skuIndex: skuIndex,
                attrClasses: [],
                skuImages: []
              };
              product.publishSkus.push(sku);
            }

            console.log(`🔍 [downloadSingleImage] 使用的SKU:`, { skuIndex: sku.skuIndex, skuImagesCount: sku.skuImages?.length });

            // 查找或创建skuImage
            let skuImage = sku.skuImages.find(img => img.imageUrl === url);
            console.log(`🔍 [downloadSingleImage] SKU中查找图片结果:`, skuImage ? '找到' : '未找到');

            if (!skuImage) {
              console.log(`⚠️ [downloadSingleImage] SKU图片不存在，创建新记录`);
              skuImage = { imageUrl: url };
              sku.skuImages.push(skuImage);
            }

            console.log(`📝 [downloadSingleImage] 更新前的SKU图片:`, JSON.stringify(skuImage));

            // 更新图片信息
            Object.assign(skuImage, {
              localPath: localFilename,
              status: 'pending_edit',
              timestamp: Date.now(),
              fileSize: arrayBuffer.byteLength,
              index: sourceIndex,
              hasLocal: true
            });

            console.log(`✅ [downloadSingleImage] 更新后的SKU图片:`, JSON.stringify(skuImage));

            // 验证更新
            if (!skuImage.localPath || !skuImage.fileSize) {
              console.error(`❌ [downloadSingleImage] SKU图片更新失败！缺少必要字段`);
            } else {
              console.log(`✅ [downloadSingleImage] SKU图片更新成功: localPath=${skuImage.localPath}, fileSize=${skuImage.fileSize}`);
            }
          }
        } else {
          // 处理原始图片
          console.log(`🔍 [downloadSingleImage] 查找原始图片: ${url}`);
          console.log(`🔍 [downloadSingleImage] 当前原始图片数组长度:`, product.originalImages.length);

          let originalImage = product.originalImages.find(img => img.imageUrl === url);
          console.log(`🔍 [downloadSingleImage] 查找结果:`, originalImage ? '找到' : '未找到');

          if (!originalImage) {
            console.log(`⚠️ [downloadSingleImage] 原始图片不存在，创建新记录`);
            originalImage = { imageUrl: url };
            product.originalImages.push(originalImage);
          }

          console.log(`📝 [downloadSingleImage] 更新前的原始图片:`, JSON.stringify(originalImage));

          // 更新图片信息
          Object.assign(originalImage, {
            localPath: localFilename,
            status: 'pending_edit',
            timestamp: Date.now(),
            fileSize: arrayBuffer.byteLength,
            hasLocal: true
          });

          console.log(`✅ [downloadSingleImage] 更新后的原始图片:`, JSON.stringify(originalImage));

          // 验证更新
          if (!originalImage.localPath || !originalImage.fileSize) {
            console.error(`❌ [downloadSingleImage] 原始图片更新失败！缺少必要字段`);
          } else {
            console.log(`✅ [downloadSingleImage] 原始图片更新成功: localPath=${originalImage.localPath}, fileSize=${originalImage.fileSize}`);
          }
        }

        console.log(`✅ 图片下载完成: ${url} -> ${localFilename}`);
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
   * 生成本地文件路径（包含产品文件夹）
   * 统一使用简单的命名规则：{申请码}/{原始文件名}
   * @param {Object} imageInfo 图片信息
   * @param {string} imageInfo.url 图片URL
   * @param {string} imageInfo.applyCode 申请码
   * @param {string} [imageInfo.imageType] 图片类型（可选，不影响命名）
   * @returns {string} 本地文件路径（格式：applyCode/filename.jpg）
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

      // 生成统一格式：{申请码}/{原始文件名}（包含产品文件夹）
      const localFilePath = `${applyCode}/${originalFilename}`;

      console.log(`✅ [generateLocalFilename] 生成本地文件路径: ${actualUrl} -> ${localFilePath}`);
      return localFilePath;

    } catch (error) {
      console.error('❌ [generateLocalFilename] 生成本地文件路径失败:', error);

      // 备用方案：使用时间戳避免冲突
      const fallbackPath = `${applyCode}/fallback_${Date.now()}.jpg`;
      console.warn(`⚠️ [generateLocalFilename] 使用备用方案: ${fallbackPath}`);
      return fallbackPath;
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
      const localFile = await this.getFileByPath(imageInfo.localPath);
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
              const localFile = await this.getFileByPath(img.localPath);
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
                  const localFile = await this.getFileByPath(img.localPath);
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
              const localFile = await this.getFileByPath(img.localPath);
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

      const localFile = await this.getFileByPath(imageInfo.localPath);
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
   * 获取指定产品的所有图片
   * @param {string} applyCode 产品代码
   * @returns {Array} 图片列表
   */
  getAllImagesByProduct(applyCode) {
    const productImages = [];
    const product = this.findProductByApplyCode(applyCode);

    if (!product) {
      console.log(`⚠️ [getAllImagesByProduct] 未找到产品: ${applyCode}`);
      return productImages;
    }

    // 添加原始图片
    if (product.originalImages) {
      for (const img of product.originalImages) {
        productImages.push({
          id: img.imageUrl || img.localPath,
          applyCode: product.applyCode,
          imageType: 'original',
          ...img
        });
      }
    }

    // 添加SKU图片
    if (product.publishSkus) {
      for (const sku of product.publishSkus) {
        if (sku.skuImages) {
          for (const img of sku.skuImages) {
            productImages.push({
              id: img.imageUrl || img.localPath,
              applyCode: product.applyCode,
              imageType: 'sku',
              skuIndex: sku.skuIndex,
              ...img
            });
          }
        }
      }
    }

    // 添加场景图片
    if (product.senceImages) {
      for (const img of product.senceImages) {
        productImages.push({
          id: img.imageUrl || img.localPath,
          applyCode: product.applyCode,
          imageType: 'scene',
          ...img
        });
      }
    }

    console.log(`📊 [getAllImagesByProduct] 产品 ${applyCode} 共有 ${productImages.length} 张图片`);
    return productImages;
  }

  /**
   * 获取或创建产品
   * @param {string} applyCode 申请码
   * @param {Object} productData 产品数据（可选），包含 chineseName, chinesePackageList, status 等字段
   * @returns {Object} 产品信息
   */
  getOrCreateProduct(applyCode, productData = {}) {
    let product = this.findProductByApplyCode(applyCode);
    if (!product) {
      product = {
        applyCode: applyCode,
        chineseName: productData.chineseName || '',
        chinesePackageList: productData.chinesePackageList || [],
        applyBrandList: productData.applyBrandList || [],
        devPurchaserName: productData.devPurchaserName || '',
        status: productData.status || 3,
        originalImages: [],
        publishSkus: [],
        senceImages: [],
        userId: 0,
        userCode: null
      };
      this.indexData.push(product);
      console.log(`📦 [getOrCreateProduct] 创建新产品: ${applyCode}`, {
        chineseName: product.chineseName,
        chinesePackageList: product.chinesePackageList,
        applyBrandList: product.applyBrandList,
        devPurchaserName: product.devPurchaserName,
        status: product.status
      });
    } else {
      // 更新已存在产品的元数据字段
      if (productData.chineseName !== undefined) {
        product.chineseName = productData.chineseName;
      }
      if (productData.chinesePackageList !== undefined) {
        product.chinesePackageList = productData.chinesePackageList;
      }
      if (productData.applyBrandList !== undefined) {
        product.applyBrandList = productData.applyBrandList;
      }
      if (productData.devPurchaserName !== undefined) {
        product.devPurchaserName = productData.devPurchaserName;
      }
      if (productData.status !== undefined) {
        product.status = productData.status;
      }
      console.log(`🔄 [getOrCreateProduct] 更新产品元数据: ${applyCode}`, {
        chineseName: product.chineseName,
        devPurchaserName: product.devPurchaserName,
        applyBrandList: product.applyBrandList
      });
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

      // 查找senceImages (场景图片)
      if (product.senceImages) {
        const found = product.senceImages.find(img =>
          img.imageUrl === imageId || img.localPath === imageId
        );
        if (found) {
          return {
            ...found,
            applyCode: product.applyCode,
            imageType: 'scene'
          };
        }
      }
    }

    return null;
  }

  /**
   * 精确获取图片信息（支持多条件匹配）
   * 用于解决拖拽后图片ID冲突的问题
   *
   * @param {string} imageId 图片ID（通常是imageUrl）
   * @param {Object} options 可选的精确查找条件
   * @param {string} options.imageType 图片类型：'original', 'sku', 'scene'
   * @param {number} options.skuIndex SKU索引（仅sku类型需要）
   * @param {number} options.index 图片在数组中的索引
   * @param {string} options.applyCode 产品申请码
   * @returns {Object|null} 图片信息
   */
  getImageInfoPrecise(imageId, options = {}) {
    const { imageType, skuIndex, index, applyCode } = options;

    console.log('🔍 [getImageInfoPrecise] 精确查找图片:', {
      imageId: imageId?.substring(0, 50) + '...',
      imageType,
      skuIndex,
      index,
      applyCode
    });

    // 如果指定了applyCode，只在该产品中查找
    const productsToSearch = applyCode
      ? this.indexData.filter(p => p.applyCode === applyCode)
      : this.indexData;

    for (const product of productsToSearch) {
      // 如果指定了imageType，只在对应类型中查找
      if (!imageType || imageType === 'original') {
        if (product.originalImages) {
          const found = product.originalImages.find((img, idx) => {
            const urlMatch = img.imageUrl === imageId || img.localPath === imageId;
            const indexMatch = index === undefined || idx === index;
            const typeMatch = !imageType || imageType === 'original';
            return urlMatch && indexMatch && typeMatch;
          });
          if (found) {
            console.log('✅ [getImageInfoPrecise] 在原始图片中找到匹配');
            return {
              ...found,
              applyCode: product.applyCode,
              imageType: 'original'
            };
          }
        }
      }

      // 查找SKU图片
      if (!imageType || imageType === 'sku') {
        if (product.publishSkus) {
          for (const sku of product.publishSkus) {
            // 如果指定了skuIndex，只在该SKU中查找
            if (skuIndex !== undefined && sku.skuIndex !== skuIndex) {
              continue;
            }

            if (sku.skuImages) {
              const found = sku.skuImages.find((img, idx) => {
                const urlMatch = img.imageUrl === imageId || img.localPath === imageId;
                const indexMatch = index === undefined || idx === index;
                return urlMatch && indexMatch;
              });
              if (found) {
                console.log('✅ [getImageInfoPrecise] 在SKU图片中找到匹配, skuIndex:', sku.skuIndex);
                return {
                  ...found,
                  applyCode: product.applyCode,
                  skuIndex: sku.skuIndex,
                  imageType: 'sku'
                };
              }
            }
          }
        }
      }

      // 查找场景图片
      if (!imageType || imageType === 'scene') {
        if (product.senceImages) {
          const found = product.senceImages.find((img, idx) => {
            const urlMatch = img.imageUrl === imageId || img.localPath === imageId;
            const indexMatch = index === undefined || idx === index;
            const typeMatch = !imageType || imageType === 'scene';
            return urlMatch && indexMatch && typeMatch;
          });
          if (found) {
            console.log('✅ [getImageInfoPrecise] 在场景图片中找到匹配');
            return {
              ...found,
              applyCode: product.applyCode,
              imageType: 'scene'
            };
          }
        }
      }
    }

    console.warn('⚠️ [getImageInfoPrecise] 未找到匹配的图片');
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

      // 验证文件格式
      if (!isValidImageFormat(file.name)) {
        throw new Error(`不支持的图片格式: ${file.name}，仅支持PNG和JPG格式`);
      }

      // 生成规范文件名（包含产品文件夹）
      const originalExtension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
      const baseFileName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
      const standardFileName = `${baseFileName}${originalExtension}`;

      // 检查文件名是否已存在，如果存在则添加序号
      let finalFileName = standardFileName;
      let finalFilePath = `${applyCode}/${finalFileName}`;
      let counter = 1;
      while (await this.fileExists(finalFilePath)) {
        const nameWithoutExt = standardFileName.substring(0, standardFileName.lastIndexOf('.'));
        finalFileName = `${nameWithoutExt}_${counter}${originalExtension}`;
        finalFilePath = `${applyCode}/${finalFileName}`;
        counter++;
      }

      console.log(`📝 [addLocalImage] 生成文件路径: ${file.name} -> ${finalFilePath}`);

      // 读取文件内容 - 使用UXP兼容的方式
      const arrayBuffer = await file.read({ format: formats.binary });

      // 获取或创建产品文件夹
      const productFolder = await this.getOrCreateProductFolder(applyCode);

      // 在产品文件夹中保存文件
      const localFile = await productFolder.createFile(finalFileName, { overwrite: false });
      await localFile.write(arrayBuffer, { format: formats.binary });

      console.log(`💾 [addLocalImage] 文件已保存: ${finalFileName}`);

      // 更新索引数据
      const product = this.getOrCreateProduct(applyCode);

      // 创建图片记录
      const imageRecord = {
        imageUrl: `local://${finalFilePath}`, // 使用特殊URL标记为本地添加的图片
        localPath: finalFilePath,
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
          // 验证文件格式
          if (!isValidImageFormat(file.name)) {
            console.warn(`❌ [addLocalImages] 跳过不支持的格式: ${file.name}`);
            results.push({
              fileName: file.name,
              success: false,
              error: '不支持的图片格式，仅支持PNG和JPG格式'
            });
            continue;
          }

          // 生成规范文件名（包含产品文件夹）
          const originalExtension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
          const baseFileName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
          const standardFileName = `${baseFileName}${originalExtension}`;

          // 检查文件名是否已存在，如果存在则添加序号
          let finalFileName = standardFileName;
          let finalFilePath = `${applyCode}/${finalFileName}`;
          let counter = 1;
          while (await this.fileExists(finalFilePath)) {
            const nameWithoutExt = standardFileName.substring(0, standardFileName.lastIndexOf('.'));
            finalFileName = `${nameWithoutExt}_${counter}${originalExtension}`;
            finalFilePath = `${applyCode}/${finalFileName}`;
            counter++;
          }

          console.log(`📝 [addLocalImages] 生成文件路径: ${file.name} -> ${finalFilePath}`);

          // 读取文件内容 - 使用UXP兼容的方式
          const arrayBuffer = await file.read({ format: formats.binary });

          // 获取或创建产品文件夹
          const productFolder = await this.getOrCreateProductFolder(applyCode);

          // 在产品文件夹中保存文件
          const localFile = await productFolder.createFile(finalFileName, { overwrite: false });
          await localFile.write(arrayBuffer, { format: formats.binary });

          console.log(`💾 [addLocalImages] 文件已保存: ${finalFilePath}`);

          // 创建图片记录
          const imageRecord = {
            imageUrl: `local://${finalFilePath}`, // 使用特殊URL标记为本地添加的图片
            localPath: finalFilePath,
            status: 'pending_edit',
            timestamp: Date.now(),
            fileSize: arrayBuffer.byteLength,
            addedLocally: true, // 标记为本地添加的图片
            hasLocal: true
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
   * 跨类型图片引用插入 - 用于从原始图片区域拖拽到SKU/场景图片位置
   * @param {string} applyCode 产品申请码
   * @param {string} sourceImageUrl 源图片URL
   * @param {string} sourceType 源图片类型
   * @param {string} targetType 目标图片类型
   * @param {number} targetIndex 目标插入位置
   * @param {number|null} sourceSkuIndex 源SKU索引
   * @param {number|null} targetSkuIndex 目标SKU索引
   * @returns {Object} 操作结果
   */
  async insertImageReferenceAt(applyCode, sourceImageUrl, sourceType, targetType, targetIndex, sourceSkuIndex = null, targetSkuIndex = null) {
    try {
      console.log(`🔄 [insertImageReferenceAt] 开始跨类型插入图片引用:`, {
        applyCode,
        sourceImageUrl: sourceImageUrl.substring(0, 50) + '...',
        sourceType,
        targetType,
        targetIndex,
        sourceSkuIndex,
        targetSkuIndex
      });

      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        throw new Error(`产品不存在: ${applyCode}`);
      }

      // 查找源图片
      let sourceImage = null;

      if (sourceType === 'original') {
        sourceImage = product.originalImages?.find(img => img.imageUrl === sourceImageUrl);
      } else if (sourceType === 'sku') {
        const sourceSku = product.publishSkus?.find(s => s.skuIndex === sourceSkuIndex);
        sourceImage = sourceSku?.skuImages?.find(img => img.imageUrl === sourceImageUrl);
      } else if (sourceType === 'scene') {
        sourceImage = product.senceImages?.find(img => img.imageUrl === sourceImageUrl);
      }

      if (!sourceImage) {
        throw new Error(`源图片不存在: ${sourceImageUrl}`);
      }

      console.log(`✅ [insertImageReferenceAt] 找到源图片:`, sourceImage.imageUrl.substring(0, 50) + '...');

      // 获取目标数组
      let targetArray;

      if (targetType === 'original') {
        if (!product.originalImages) product.originalImages = [];
        targetArray = product.originalImages;
      } else if (targetType === 'sku') {
        if (!product.publishSkus) {
          throw new Error('产品没有SKU信息');
        }

        const targetSku = product.publishSkus.find(s => s.skuIndex === targetSkuIndex);
        if (!targetSku) {
          throw new Error(`目标SKU不存在: ${targetSkuIndex}`);
        }

        if (!targetSku.skuImages) targetSku.skuImages = [];
        targetArray = targetSku.skuImages;
      } else if (targetType === 'scene') {
        if (!product.senceImages) product.senceImages = [];
        targetArray = product.senceImages;
      } else {
        throw new Error(`无效的目标类型: ${targetType}`);
      }

      // 检查目标位置索引有效性
      if (targetIndex < 0 || targetIndex > targetArray.length) {
        throw new Error(`目标索引 ${targetIndex} 超出范围 [0, ${targetArray.length}]`);
      }

      // 检查目标位置是否已存在相同的图片
      const existingImage = targetArray.find(img => img.imageUrl === sourceImageUrl);
      if (existingImage) {
        console.log(`ℹ️ [insertImageReferenceAt] 目标位置已存在相同图片，跳过插入`);
        return {
          success: false,
          error: '目标位置已存在相同的图片'
        };
      }

      // 创建新的图片引用对象
      const newImageRef = {
        ...sourceImage, // 复制所有属性
        id: sourceImage.imageUrl, // 保持相同的ID以复用本地文件
        imageUrl: sourceImage.imageUrl, // 保持相同的URL
        // 重置状态相关字段，让插入的图片从待编辑状态开始
        status: sourceImage.hasLocal ? 'pending_edit' : 'not_downloaded',
        index: targetIndex, // 设置目标索引
        modifiedPath: undefined, // 清除修改路径
        modifiedTimestamp: undefined, // 清除修改时间戳
        localPath: sourceImage.localPath, // 保持相同的本地路径以复用文件
        hasLocal: sourceImage.hasLocal, // 保持本地文件状态
        type: targetType, // 设置新的类型
        skuIndex: targetType === 'sku' ? targetSkuIndex : undefined // 设置SKU索引（如果需要）
      };

      // 在目标位置插入新图片引用
      targetArray.splice(targetIndex, 0, newImageRef);

      // 重新计算目标数组的索引
      targetArray.forEach((img, index) => {
        img.index = index;
      });

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [insertImageReferenceAt] 图片引用插入成功: ${sourceType} -> ${targetType}, 插入位置: ${targetIndex}`);

      return {
        success: true,
        newImage: newImageRef,
        targetArray: targetArray
      };

    } catch (error) {
      console.error('❌ [insertImageReferenceAt] 跨类型插入失败:', error);
      return {
        success: false,
        error: error.message
      };
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
              // 解析路径：applyCode/filename.jpg
              const pathParts = img.localPath.split('/');
              if (pathParts.length !== 2) {
                throw new Error(`无效的文件路径格式: ${img.localPath}`);
              }
              const [folderName, fileName] = pathParts;
              const modifiedFilename = `modified_${fileName}`;
              const modifiedFilePath = `${folderName}/${modifiedFilename}`;

              // 获取产品文件夹并保存修改后的文件
              const productFolder = await this.getOrCreateProductFolder(folderName);
              const newFile = await productFolder.createFile(modifiedFilename, { overwrite: true });
              const buffer = await modifiedFile.read({ format: formats.binary });
              await newFile.write(buffer, { format: formats.binary });
              img.modifiedPath = modifiedFilePath;
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
                  // 解析路径：applyCode/filename.jpg
                  const pathParts = img.localPath.split('/');
                  if (pathParts.length !== 2) {
                    throw new Error(`无效的文件路径格式: ${img.localPath}`);
                  }
                  const [folderName, fileName] = pathParts;
                  const modifiedFilename = `modified_${fileName}`;
                  const modifiedFilePath = `${folderName}/${modifiedFilename}`;

                  // 获取产品文件夹并保存修改后的文件
                  const productFolder = await this.getOrCreateProductFolder(folderName);
                  const newFile = await productFolder.createFile(modifiedFilename, { overwrite: true });
                  const buffer = await modifiedFile.read({ format: formats.binary });
                  await newFile.write(buffer, { format: formats.binary });
                  img.modifiedPath = modifiedFilePath;
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
   * @param {string} applyCode 产品编号，如果提供则只获取该产品的图片
   * @returns {Array} 需要上传的图片信息数组
   */
  getModifiedImages(applyCode = null) {
    const modifiedImages = [];

    // 遍历所有产品或指定产品查找需要上传的图片
    for (const product of this.indexData) {
      // 如果指定了产品编号，只处理该产品
      if (applyCode && product.applyCode !== applyCode) {
        continue;
      }

      // 检查原始图片 - 所有原始图片都需要上传，不检查状态
      if (product.originalImages) {
        for (let index = 0; index < product.originalImages.length; index++) {
          const img = product.originalImages[index];
          const uniqueImageId = `${product.applyCode}_original_${index}`;
          modifiedImages.push({
            imageId: uniqueImageId,
            originalImageId: img.imageUrl || img.localPath, // 保留原始ID用于兼容
            applyCode: product.applyCode,
            imageType: 'original',
            imageIndex: index,
            ...img
          });
        }
      }

      // 检查SKU图片 - 所有SKU图片都需要上传，不检查状态
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (let imageIndex = 0; imageIndex < sku.skuImages.length; imageIndex++) {
              const img = sku.skuImages[imageIndex];
              const uniqueImageId = `${product.applyCode}_sku_${sku.skuIndex}_${imageIndex}`;
              modifiedImages.push({
                imageId: uniqueImageId,
                originalImageId: img.imageUrl || img.localPath, // 保留原始ID用于兼容
                applyCode: product.applyCode,
                imageType: 'sku',
                skuIndex: sku.skuIndex,
                imageIndex: imageIndex,
                ...img
              });
            }
          }
        }
      }

      // 检查场景图片 - 所有场景图片都需要上传，不检查状态
      if (product.senceImages) {
        for (let index = 0; index < product.senceImages.length; index++) {
          const img = product.senceImages[index];
          const uniqueImageId = `${product.applyCode}_scene_${index}`;
          modifiedImages.push({
            imageId: uniqueImageId,
            originalImageId: img.imageUrl || img.localPath, // 保留原始ID用于兼容
            applyCode: product.applyCode,
            imageType: 'scene',
            imageIndex: index,
            ...img
          });
        }
      }
    }

    console.log(`🔍 [getModifiedImages] ${applyCode ? `产品${applyCode}` : '所有产品'}需要上传的图片: ${modifiedImages.length} 张`);

    // 添加详细的图片分组统计
    const imageStats = modifiedImages.reduce((stats, img) => {
      const key = `${img.imageType}`;
      stats[key] = (stats[key] || 0) + 1;
      return stats;
    }, {});

    console.log(`📊 [getModifiedImages] 图片类型统计:`, imageStats);

    // 输出每个图片的唯一ID用于调试验证
    if (modifiedImages.length > 0) {
      console.log(`🆔 [getModifiedImages] 生成的唯一图片ID列表:`);
      modifiedImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.imageId} (${img.imageType})`);
        console.log(`      - localPath: ${img.localPath}`);
        console.log(`      - currentUrl: ${img.imageUrl}`);
        console.log(`      - originalImageId: ${img.originalImageId}`);
      });
    }

    return modifiedImages;
  }

  /**
   * 标记图片上传完成
   * @param {string} imageId 图片ID
   * @param {string} newUrl 新的云端URL
   * @param {string} imageType 图片类型 ('original', 'sku', 'scene')
   * @param {number} skuIndex SKU索引（仅sku类型需要）
   */
  async markImageAsUploaded(imageId, newUrl, imageType = null, skuIndex = null) {
    console.log(`🔄 [markImageAsUploaded] 开始更新图片URL: ${imageId} -> ${newUrl}`);

    // 解析唯一图片ID
    const parsedId = this.parseUniqueImageId(imageId);
    if (!parsedId) {
      console.warn(`⚠️ [markImageAsUploaded] 无法解析图片ID格式: ${imageId}`);
      return false;
    }

    console.log(`📋 [markImageAsUploaded] 解析图片信息:`, parsedId);

    // 查找对应的产品
    const product = this.indexData.find(p => p.applyCode === parsedId.applyCode);
    if (!product) {
      console.warn(`⚠️ [markImageAsUploaded] 找不到产品: ${parsedId.applyCode}`);
      return false;
    }

    // 清理修改文件的通用方法
    const cleanupModifiedFile = async (img) => {
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
    };

    // 根据图片类型精确定位图片
    let targetImage = null;
    let imageLocation = '';

    try {
      if (parsedId.imageType === 'original') {
        if (product.originalImages && product.originalImages[parsedId.imageIndex]) {
          targetImage = product.originalImages[parsedId.imageIndex];
          imageLocation = `原图[${parsedId.imageIndex}]`;
        }
      } else if (parsedId.imageType === 'sku') {
        // 改进SKU查找逻辑，支持多种匹配方式
        let sku = null;

        // 方法1: 精确的skuIndex匹配
        sku = product.publishSkus?.find(s => s.skuIndex === parsedId.skuIndex);

        // 方法2: 如果skuIndex匹配失败，尝试数组索引匹配
        if (!sku && typeof parsedId.skuIndex === 'number' && product.publishSkus && parsedId.skuIndex < product.publishSkus.length) {
          sku = product.publishSkus[parsedId.skuIndex];
          console.log(`🔍 [markImageAsUploaded] SKU按数组索引匹配: [${parsedId.skuIndex}]`);
        }

        if (sku?.skuImages && sku.skuImages[parsedId.imageIndex]) {
          targetImage = sku.skuImages[parsedId.imageIndex];
          imageLocation = `SKU[${parsedId.skuIndex}]图片[${parsedId.imageIndex}]`;
          console.log(`🎯 [markImageAsUploaded] 找到SKU图片:`, {
            skuIndex: parsedId.skuIndex,
            imageIndex: parsedId.imageIndex,
            currentUrl: targetImage.imageUrl,
            hasAttrClasses: Array.isArray(sku.attrClasses),
            attrClasses: sku.attrClasses
          });
        } else {
          console.warn(`⚠️ [markImageAsUploaded] SKU图片查找失败:`, {
            skuIndex: parsedId.skuIndex,
            imageIndex: parsedId.imageIndex,
            skuFound: !!sku,
            skuImagesCount: sku?.skuImages?.length || 0,
            totalSkus: product.publishSkus?.length || 0
          });
        }
      } else if (parsedId.imageType === 'scene') {
        if (product.senceImages && product.senceImages[parsedId.imageIndex]) {
          targetImage = product.senceImages[parsedId.imageIndex];
          imageLocation = `场景图[${parsedId.imageIndex}]`;
        }
      }

      if (!targetImage) {
        console.warn(`⚠️ [markImageAsUploaded] 找不到目标图片: ${imageId} (${imageLocation})`);
        return false;
      }

      // 验证图片匹配（可选的额外验证）
      const originalImageId = targetImage.imageUrl || targetImage.localPath;
      console.log(`🔍 [markImageAsUploaded] 验证图片匹配:`, {
        uniqueId: imageId,
        targetLocation: imageLocation,
        originalImageId: originalImageId,
        currentUrl: targetImage.imageUrl,
        localPath: targetImage.localPath,
        status: targetImage.status
      });

      // 添加更详细的匹配前数据记录
      console.log(`📋 [markImageAsUploaded] 更新前的完整图片信息:`, {
        imageLocation,
        targetImage: {
          imageUrl: targetImage.imageUrl,
          localPath: targetImage.localPath,
          status: targetImage.status,
          index: targetImage.index,
          id: targetImage.id
        },
        updateInfo: {
          newUrl,
          imageType: parsedId.imageType,
          imageIndex: parsedId.imageIndex,
          skuIndex: parsedId.skuIndex
        }
      });

      // 更新图片信息
      const oldUrl = targetImage.imageUrl;
      targetImage.status = 'completed';
      targetImage.imageUrl = newUrl;
      targetImage.uploadedTimestamp = Date.now();

      console.log(`🔄 [markImageAsUploaded] 即将更新图片信息:`);
      console.log(`   位置: ${imageLocation}`);
      console.log(`   旧URL: ${oldUrl}`);
      console.log(`   新URL: ${newUrl}`);
      console.log(`   更新后的targetImage.imageUrl: ${targetImage.imageUrl}`);

      // 验证更新是否生效
      if (targetImage.imageUrl !== newUrl) {
        console.error(`❌ [markImageAsUploaded] URL更新失败! targetImage.imageUrl = ${targetImage.imageUrl}, 期望值 = ${newUrl}`);
        return false;
      }

      // 清理修改文件
      await cleanupModifiedFile(targetImage);

      console.log(`✅ [markImageAsUploaded] ${imageLocation} 更新成功:`);
      console.log(`   最终URL: ${targetImage.imageUrl}`);
      console.log(`   状态: ${targetImage.status}`);

      // 验证在 indexData 中的更新
      console.log(`🔍 [markImageAsUploaded] 验证索引数据中的更新:`);
      const productInIndex = this.indexData.find(p => p.applyCode === parsedId.applyCode);
      let verifyImage = null;

      if (parsedId.imageType === 'original') {
        verifyImage = productInIndex.originalImages?.[parsedId.imageIndex];
      } else if (parsedId.imageType === 'sku') {
        const verifySkus = productInIndex.publishSkus?.find(s => s.skuIndex === parsedId.skuIndex);
        verifyImage = verifySkus?.skuImages?.[parsedId.imageIndex];
      } else if (parsedId.imageType === 'scene') {
        verifyImage = productInIndex.senceImages?.[parsedId.imageIndex];
      }

      if (verifyImage && verifyImage.imageUrl === newUrl) {
        console.log(`✅ [markImageAsUploaded] 索引数据验证成功: ${verifyImage.imageUrl}`);
      } else {
        console.error(`❌ [markImageAsUploaded] 索引数据验证失败! 索引中的URL: ${verifyImage?.imageUrl}, 期望: ${newUrl}`);
        return false;
      }

      // 保存索引数据
      console.log(`💾 [markImageAsUploaded] 准备保存索引数据...`);
      await this.saveIndexData();
      console.log(`💾 [markImageAsUploaded] 索引数据已保存`);

      // 保存后再次验证数据是否正确写入
      console.log(`🔍 [markImageAsUploaded] 保存后最终验证:`);
      const finalProduct = this.indexData.find(p => p.applyCode === parsedId.applyCode);
      let finalImage = null;

      if (parsedId.imageType === 'original') {
        finalImage = finalProduct?.originalImages?.[parsedId.imageIndex];
      } else if (parsedId.imageType === 'sku') {
        const finalSku = finalProduct?.publishSkus?.find(s => s.skuIndex === parsedId.skuIndex) ||
                         finalProduct?.publishSkus?.[parsedId.skuIndex];
        finalImage = finalSku?.skuImages?.[parsedId.imageIndex];
      } else if (parsedId.imageType === 'scene') {
        finalImage = finalProduct?.senceImages?.[parsedId.imageIndex];
      }

      if (finalImage && finalImage.imageUrl === newUrl) {
        console.log(`✅ [markImageAsUploaded] 最终验证成功: ${imageLocation} URL = ${finalImage.imageUrl}`);
      } else {
        console.error(`❌ [markImageAsUploaded] 最终验证失败: ${imageLocation}`, {
          expected: newUrl,
          actual: finalImage?.imageUrl,
          finalImageExists: !!finalImage
        });
        return false;
      }

      return true;

    } catch (error) {
      console.error(`❌ [markImageAsUploaded] 更新失败: ${imageId}`, error);
      return false;
    }
  }

  /**
   * 验证图片上传后的URL更新结果
   * @param {string} applyCode 产品编号
   * @param {Array} uploadedImageIds 已上传的图片ID列表
   * @returns {Object} 验证结果
   */
  async validateUploadResults(applyCode, uploadedImageIds) {
    console.log(`🔍 [validateUploadResults] 开始验证产品 ${applyCode} 的上传结果`);

    const product = this.indexData.find(p => p.applyCode === applyCode);
    if (!product) {
      return { success: false, error: '产品不存在' };
    }

    const results = {
      success: true,
      totalUpdated: 0,
      errors: [],
      details: {
        original: { total: 0, updated: 0, failed: [] },
        sku: { total: 0, updated: 0, failed: [] },
        scene: { total: 0, updated: 0, failed: [] }
      }
    };

    // 验证原图
    if (product.originalImages) {
      results.details.original.total = product.originalImages.length;
      for (let i = 0; i < product.originalImages.length; i++) {
        const img = product.originalImages[i];
        const expectedId = `${applyCode}_original_${i}`;

        if (uploadedImageIds.includes(expectedId)) {
          if (img.imageUrl && img.imageUrl.startsWith('http') && img.status === 'completed') {
            results.details.original.updated++;
            results.totalUpdated++;
            console.log(`✅ [validateUploadResults] 原图[${i}] URL已更新: ${img.imageUrl}`);
          } else {
            results.details.original.failed.push(`原图[${i}] URL未正确更新`);
            results.errors.push(`原图[${i}] URL未正确更新: ${img.imageUrl}`);
            results.success = false;
          }
        }
      }
    }

    // 验证SKU图
    if (product.publishSkus) {
      for (const sku of product.publishSkus) {
        if (sku.skuImages) {
          results.details.sku.total += sku.skuImages.length;
          for (let i = 0; i < sku.skuImages.length; i++) {
            const img = sku.skuImages[i];
            const expectedId = `${applyCode}_sku_${sku.skuIndex}_${i}`;

            if (uploadedImageIds.includes(expectedId)) {
              if (img.imageUrl && img.imageUrl.startsWith('http') && img.status === 'completed') {
                results.details.sku.updated++;
                results.totalUpdated++;
                console.log(`✅ [validateUploadResults] SKU[${sku.skuIndex}]图片[${i}] URL已更新: ${img.imageUrl}`);
              } else {
                const errorMsg = `SKU[${sku.skuIndex}]图片[${i}] URL未正确更新`;
                results.details.sku.failed.push(errorMsg);
                results.errors.push(`${errorMsg}: ${img.imageUrl}`);
                results.success = false;
              }
            }
          }
        }
      }
    }

    // 验证场景图
    if (product.senceImages) {
      results.details.scene.total = product.senceImages.length;
      for (let i = 0; i < product.senceImages.length; i++) {
        const img = product.senceImages[i];
        const expectedId = `${applyCode}_scene_${i}`;

        if (uploadedImageIds.includes(expectedId)) {
          if (img.imageUrl && img.imageUrl.startsWith('http') && img.status === 'completed') {
            results.details.scene.updated++;
            results.totalUpdated++;
            console.log(`✅ [validateUploadResults] 场景图[${i}] URL已更新: ${img.imageUrl}`);
          } else {
            results.details.scene.failed.push(`场景图[${i}] URL未正确更新`);
            results.errors.push(`场景图[${i}] URL未正确更新: ${img.imageUrl}`);
            results.success = false;
          }
        }
      }
    }

    console.log(`📊 [validateUploadResults] 验证完成:`, {
      success: results.success,
      totalUpdated: results.totalUpdated,
      errorCount: results.errors.length
    });

    if (!results.success) {
      console.warn(`⚠️ [validateUploadResults] 发现 ${results.errors.length} 个问题:`, results.errors);
    }

    return results;
  }

  /**
   * 重置产品的所有图片状态
   * @param {string} applyCode - 产品编号
   * @param {string} newStatus - 新状态，默认为 'pending_edit'
   * @returns {Promise<{success: boolean, resetCount: number, error?: string}>}
   */
  async resetProductImagesStatus(applyCode, newStatus = 'pending_edit') {
    console.log(`🔄 [resetProductImagesStatus] 开始重置产品 ${applyCode} 的所有图片状态为 ${newStatus}`);

    try {
      // 查找产品
      const product = this.indexData.find(p => p.applyCode === applyCode);
      if (!product) {
        console.warn(`⚠️ [resetProductImagesStatus] 找不到产品: ${applyCode}`);
        return { success: false, resetCount: 0, error: '产品不存在' };
      }

      let resetCount = 0;

      // 重置原图状态
      if (Array.isArray(product.originalImages)) {
        product.originalImages.forEach((img, index) => {
          if (img.status !== newStatus) {
            console.log(`  重置原图[${index}]: ${img.status} -> ${newStatus}`);
            img.status = newStatus;
            resetCount++;
          }
        });
      }

      // 重置 SKU 图片状态
      if (Array.isArray(product.publishSkus)) {
        product.publishSkus.forEach((sku, skuIndex) => {
          if (Array.isArray(sku.skuImages)) {
            sku.skuImages.forEach((img, imgIndex) => {
              if (img.status !== newStatus) {
                console.log(`  重置SKU[${skuIndex}]图片[${imgIndex}]: ${img.status} -> ${newStatus}`);
                img.status = newStatus;
                resetCount++;
              }
            });
          }
        });
      }

      // 重置场景图状态
      if (Array.isArray(product.senceImages)) {
        product.senceImages.forEach((img, index) => {
          if (img.status !== newStatus) {
            console.log(`  重置场景图[${index}]: ${img.status} -> ${newStatus}`);
            img.status = newStatus;
            resetCount++;
          }
        });
      }

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [resetProductImagesStatus] 成功重置 ${resetCount} 张图片的状态`);
      return { success: true, resetCount };

    } catch (error) {
      console.error(`❌ [resetProductImagesStatus] 重置失败:`, error);
      return { success: false, resetCount: 0, error: error.message };
    }
  }

  /**
   * 更新产品的状态
   * @param {string} applyCode - 产品编号
   * @param {number} newStatus - 新状态值
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateProductStatus(applyCode, newStatus) {
    console.log(`🔄 [updateProductStatus] 更新产品 ${applyCode} 状态为 ${newStatus}`);

    try {
      // 查找产品
      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        console.warn(`⚠️ [updateProductStatus] 找不到产品: ${applyCode}`);
        return { success: false, error: '产品不存在' };
      }

      // 更新状态
      const oldStatus = product.status;
      product.status = newStatus;

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [updateProductStatus] 产品状态已更新: ${oldStatus} -> ${newStatus}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ [updateProductStatus] 更新失败:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 根据 localPath 更新产品的所有图片 imageUrl
   * @param {string} applyCode - 产品编号
   * @returns {Promise<{success: boolean, updateCount: number, error?: string}>}
   */
  async updateProductImageUrlsByLocalPath(applyCode) {
    console.log(`🔄 [updateProductImageUrlsByLocalPath] 开始更新产品 ${applyCode} 的所有图片 URL`);

    try {
      // 查找产品
      const product = this.indexData.find(p => p.applyCode === applyCode);
      if (!product) {
        console.warn(`⚠️ [updateProductImageUrlsByLocalPath] 找不到产品: ${applyCode}`);
        return { success: false, updateCount: 0, error: '产品不存在' };
      }

      const baseUrl = 'https://openapi.sjlpj.cn:5002/publishoriginapath/';
      let updateCount = 0;

      // 更新原图 URL
      if (Array.isArray(product.originalImages)) {
        product.originalImages.forEach((img, index) => {
          if (img.localPath) {
            const newUrl = `${baseUrl}${img.localPath}`;
            if (img.imageUrl !== newUrl) {
              console.log(`  更新原图[${index}] URL: ${img.imageUrl} -> ${newUrl}`);
              img.imageUrl = newUrl;
              updateCount++;
            }
          }
        });
      }

      // 更新 SKU 图片 URL
      if (Array.isArray(product.publishSkus)) {
        product.publishSkus.forEach((sku, skuIndex) => {
          if (Array.isArray(sku.skuImages)) {
            sku.skuImages.forEach((img, imgIndex) => {
              if (img.localPath) {
                const newUrl = `${baseUrl}${img.localPath}`;
                if (img.imageUrl !== newUrl) {
                  console.log(`  更新SKU[${skuIndex}]图片[${imgIndex}] URL: ${img.imageUrl} -> ${newUrl}`);
                  img.imageUrl = newUrl;
                  updateCount++;
                }
              }
            });
          }
        });
      }

      // 更新场景图 URL
      if (Array.isArray(product.senceImages)) {
        product.senceImages.forEach((img, index) => {
          if (img.localPath) {
            const newUrl = `${baseUrl}${img.localPath}`;
            if (img.imageUrl !== newUrl) {
              console.log(`  更新场景图[${index}] URL: ${img.imageUrl} -> ${newUrl}`);
              img.imageUrl = newUrl;
              updateCount++;
            }
          }
        });
      }

      // 保存索引数据
      if (updateCount > 0) {
        await this.saveIndexData();
        console.log(`✅ [updateProductImageUrlsByLocalPath] 成功更新 ${updateCount} 张图片的 URL`);
      } else {
        console.log(`ℹ️ [updateProductImageUrlsByLocalPath] 没有需要更新的图片 URL`);
      }

      return { success: true, updateCount };

    } catch (error) {
      console.error(`❌ [updateProductImageUrlsByLocalPath] 更新失败:`, error);
      return { success: false, updateCount: 0, error: error.message };
    }
  }

  /**
   * 解析唯一图片ID
   * @param {string} uniqueImageId 唯一图片ID，格式: applyCode_imageType_index 或 applyCode_sku_skuIndex_imageIndex
   * @returns {Object|null} 解析结果
   */
  parseUniqueImageId(uniqueImageId) {
    if (!uniqueImageId || typeof uniqueImageId !== 'string') {
      return null;
    }

    const parts = uniqueImageId.split('_');
    if (parts.length < 3) {
      return null;
    }

    // 处理 applyCode 可能包含下划线的情况
    // 格式1: applyCode_original_index
    // 格式2: applyCode_scene_index
    // 格式3: applyCode_sku_skuIndex_imageIndex

    if (parts.length >= 4 && parts[parts.length - 3] === 'sku') {
      // SKU图片格式: applyCode_sku_skuIndex_imageIndex
      const imageIndex = parseInt(parts[parts.length - 1]);
      const skuIndex = parseInt(parts[parts.length - 2]);
      const applyCode = parts.slice(0, -3).join('_');

      if (isNaN(imageIndex) || isNaN(skuIndex)) {
        return null;
      }

      return {
        applyCode,
        imageType: 'sku',
        skuIndex,
        imageIndex
      };
    } else {
      // 原图或场景图格式: applyCode_imageType_index
      const imageIndex = parseInt(parts[parts.length - 1]);
      const imageType = parts[parts.length - 2];
      const applyCode = parts.slice(0, -2).join('_');

      if (isNaN(imageIndex) || !['original', 'scene'].includes(imageType)) {
        return null;
      }

      return {
        applyCode,
        imageType,
        imageIndex
      };
    }
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
                this.getFileByPath(img.localPath).then(localFile => {
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
                    this.getFileByPath(img.localPath).then(localFile => {
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
   * 移除产品及其所有相关数据
   * @param {string} applyCode 产品编号
   * @returns {Promise<boolean>} 是否成功移除
   */
  async removeProduct(applyCode) {
    try {
      console.log(`🗑️ [removeProduct] 开始移除产品: ${applyCode}`);

      // 查找要删除的产品
      const productIndex = this.indexData.findIndex(p => p.applyCode === applyCode);
      if (productIndex === -1) {
        console.warn(`⚠️ [removeProduct] 产品不存在: ${applyCode}`);
        return false;
      }

      const product = this.indexData[productIndex];
      let deletedFilesCount = 0;
      let totalFilesCount = 0;

      // 收集所有需要删除的文件路径（使用Set自动去重）
      const filesToDelete = new Set();

      // 原始图片文件
      if (product.originalImages) {
        for (const img of product.originalImages) {
          totalFilesCount++;
          if (img.localPath) {
            filesToDelete.add(img.localPath);
          }
          if (img.modifiedPath) {
            filesToDelete.add(img.modifiedPath);
          }
        }
      }

      // SKU图片文件
      if (product.publishSkus) {
        for (const sku of product.publishSkus) {
          if (sku.skuImages) {
            for (const img of sku.skuImages) {
              totalFilesCount++;
              if (img.localPath) {
                filesToDelete.add(img.localPath);
              }
              if (img.modifiedPath) {
                filesToDelete.add(img.modifiedPath);
              }
            }
          }
        }
      }

      // 场景图片文件
      if (product.senceImages) {
        for (const img of product.senceImages) {
          totalFilesCount++;
          if (img.localPath) {
            filesToDelete.add(img.localPath);
          }
          if (img.modifiedPath) {
            filesToDelete.add(img.modifiedPath);
          }
        }
      }

      console.log(`📁 [removeProduct] 需要删除 ${filesToDelete.size} 个唯一文件，共 ${totalFilesCount} 张图片引用`);

      // 删除本地文件
      for (const filePath of filesToDelete) {
        try {
          const file = await this.imageFolder.getEntry(filePath);
          if (file) {
            await file.delete();
            deletedFilesCount++;
            console.log(`🗂️ [removeProduct] 已删除文件: ${filePath}`);
          }
        } catch (error) {
          // 检查是否是"文件不存在"错误，这是正常情况（可能已被删除）
          if (error.message.includes('Could not find an entry')) {
            console.log(`📝 [removeProduct] 文件已不存在，跳过: ${filePath}`);
          } else {
            // 只对真正的文件系统错误输出警告
            console.warn(`⚠️ [removeProduct] 删除文件时发生错误 ${filePath}:`, error.message);
          }
          // 继续删除其他文件，不因单个文件失败而中断
        }
      }

      // 删除产品文件夹
      try {
        const productFolder = await this.imageFolder.getEntry(applyCode);
        if (productFolder && productFolder.isFolder) {
          await productFolder.delete();
          console.log(`🗑️ [removeProduct] 已删除产品文件夹: ${applyCode}`);

          // 从缓存中移除
          if (this.productFolderCache.has(applyCode)) {
            this.productFolderCache.delete(applyCode);
            console.log(`🗂️ [removeProduct] 已从缓存中移除文件夹: ${applyCode}`);
          }
        }
      } catch (error) {
        if (error.message.includes('Could not find an entry')) {
          console.log(`📝 [removeProduct] 产品文件夹已不存在，跳过: ${applyCode}`);
        } else {
          console.warn(`⚠️ [removeProduct] 删除产品文件夹时出错 ${applyCode}:`, error.message);
        }
      }

      // 从索引数据中移除产品
      this.indexData.splice(productIndex, 1);

      // 保存更新后的索引文件
      await this.saveIndexData();

      console.log(`✅ [removeProduct] 产品移除完成: ${applyCode}`);
      console.log(`📊 [removeProduct] 删除统计: ${deletedFilesCount}/${filesToDelete.size} 个文件成功删除`);

      return true;

    } catch (error) {
      console.error(`❌ [removeProduct] 移除产品失败: ${applyCode}`, error);
      throw new Error(`移除产品失败: ${error.message}`);
    }
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
      const currentSize = metadata.size || 0;
      const recordedSize = imageInfo.fileSize || 0;

      // 计算时间差（毫秒）
      const timeDifference = currentModified - recordedModified;
      const TIME_TOLERANCE_MS = 3000; // 3秒容忍度，避免PS读取操作造成的微小时间变化被误判

      // 检查是否有其他图片共享此文件
      let sharedImagesCount = 0;
      const sharedImageIds = [];
      for (const product of this.indexData) {
        // 检查所有图片类型
        const allImages = [
          ...(product.originalImages || []),
          ...(product.publishSkus?.flatMap(sku => sku.skuImages || []) || []),
          ...(product.senceImages || [])
        ];

        for (const img of allImages) {
          if (img.localPath === imageInfo.localPath) {
            sharedImagesCount++;
            sharedImageIds.push(img.imageUrl || img.localPath);
          }
        }
      }

      console.log(`📊 [checkFileModification] 详细检测信息:`, {
        imageId: imageId,
        localPath: imageInfo.localPath,
        currentModified: new Date(currentModified).toLocaleString(),
        recordedModified: new Date(recordedModified).toLocaleString(),
        timeDifferenceMs: timeDifference,
        timeDifferenceSeconds: (timeDifference / 1000).toFixed(1),
        timeToleranceMs: TIME_TOLERANCE_MS,
        currentSize: currentSize,
        recordedSize: recordedSize,
        sizeChanged: currentSize !== recordedSize,
        sharedImagesCount: sharedImagesCount,
        hasSharedImages: sharedImagesCount > 1,
        sharedImageIds: sharedImagesCount > 1 ? sharedImageIds.map(id => id.substring(0, 20) + '...') : []
      });

      // 增强的修改判断逻辑
      const hasSignificantTimeChange = timeDifference > TIME_TOLERANCE_MS;
      const hasSizeChange = currentSize !== recordedSize && recordedSize > 0; // 避免初始化时的误判
      const isModified = hasSignificantTimeChange || hasSizeChange;

      console.log(`🔍 [checkFileModification] 修改判断结果:`, {
        hasSignificantTimeChange,
        hasSizeChange,
        isModified,
        reason: isModified ?
          (hasSignificantTimeChange && hasSizeChange ? '时间和大小都发生变化' :
           hasSignificantTimeChange ? '时间发生显著变化' : '文件大小发生变化') :
          '未检测到修改'
      });

      // 如果文件已被修改，更新记录
      if (isModified) {
        console.log(`✅ [checkFileModification] 检测到文件修改: ${imageInfo.localPath}`);

        if (sharedImagesCount > 1) {
          console.log(`⚠️ [checkFileModification] 注意：此文件被 ${sharedImagesCount} 个图片共享，修改可能影响其他图片`);
        }

        // 更新图片信息
        imageInfo.lastModified = currentModified;
        imageInfo.status = 'modified';
        imageInfo.fileSize = metadata.size;

        // 保存更新的索引数据
        await this.saveIndexData();

        console.log(`💾 [checkFileModification] 已更新图片状态为 'modified': ${imageId}`);
        return true;
      }

      console.log(`ℹ️ [checkFileModification] 文件未修改: ${imageInfo.localPath} (时间差: ${(timeDifference / 1000).toFixed(1)}s, 在容忍范围内)`);
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
      let targetImage = null;
      let targetLocalPath = null;
      let updatedCount = 0;

      // 遍历所有产品，更新所有匹配的图片（支持引用图片）
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

              if (!targetImage) {
                targetImage = img;
                targetLocalPath = img.localPath;
              }
              imageFound = true;
              updatedCount++;
              console.log(`✅ [setImageStatus] 原始图片状态更新: ${imageId} (${oldStatus} → ${status})`);
            }
          }
        }

        // 检查SKU图片（移除 !imageFound 条件，确保所有引用都被更新）
        if (product.publishSkus) {
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

                  if (!targetImage) {
                    targetImage = img;
                    targetLocalPath = img.localPath;
                  }
                  imageFound = true;
                  updatedCount++;
                  console.log(`✅ [setImageStatus] SKU图片状态更新: ${imageId} (${oldStatus} → ${status})`);
                }
              }
            }
          }
        }

        // 检查场景图片（移除 !imageFound 条件，确保所有引用都被更新）
        if (product.senceImages) {
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

              if (!targetImage) {
                targetImage = img;
                targetLocalPath = img.localPath;
              }
              imageFound = true;
              updatedCount++;
              console.log(`✅ [setImageStatus] 场景图片状态更新: ${imageId} (${oldStatus} → ${status})`);
            }
          }
        }
      }

      console.log(`📊 [setImageStatus] 共更新了 ${updatedCount} 个图片实例的状态`);

      if (!imageFound) {
        console.warn(`⚠️ [setImageStatus] 未找到图片: ${imageId}`);
        return false;
      }

      // 关键修复：如果设置为'editing'状态，同步更新所有共享同一文件的图片的时间基准
      if (status === 'editing' && targetLocalPath && targetImage) {
        await this.syncFileTimeBaseline(targetLocalPath, imageId);
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
   * 同步共享文件的时间基准
   * 解决相同图片文件时间戳污染问题
   * @param {string} localPath - 文件路径
   * @param {string} currentImageId - 当前操作的图片ID
   * @returns {Promise<void>}
   */
  async syncFileTimeBaseline(localPath, currentImageId) {
    try {
      if (!localPath) {
        console.log(`⚠️ [syncFileTimeBaseline] localPath为空，跳过同步`);
        return;
      }

      console.log(`🔄 [syncFileTimeBaseline] 开始同步共享文件时间基准: ${localPath}`);

      // 获取文件的真实修改时间
      let currentFileTime = null;
      try {
        const file = await this.getFileByPath(localPath);
        const metadata = await file.getMetadata();
        currentFileTime = metadata.dateModified.getTime();
        console.log(`📁 [syncFileTimeBaseline] 文件真实修改时间: ${new Date(currentFileTime).toLocaleString()}`);
      } catch (fileError) {
        console.warn(`⚠️ [syncFileTimeBaseline] 无法获取文件时间，跳过同步:`, fileError.message);
        return;
      }

      // 收集所有使用相同localPath的图片
      const sharedImages = [];
      for (const product of this.indexData) {
        // 检查原始图片
        if (product.originalImages) {
          for (const img of product.originalImages) {
            if (img.localPath === localPath) {
              sharedImages.push({
                type: 'original',
                imageId: img.imageUrl || img.localPath,
                imageObject: img,
                applyCode: product.applyCode
              });
            }
          }
        }

        // 检查SKU图片
        if (product.publishSkus) {
          for (const sku of product.publishSkus) {
            if (sku.skuImages) {
              for (const img of sku.skuImages) {
                if (img.localPath === localPath) {
                  sharedImages.push({
                    type: 'sku',
                    imageId: img.imageUrl || img.localPath,
                    imageObject: img,
                    applyCode: product.applyCode,
                    skuIndex: sku.skuIndex
                  });
                }
              }
            }
          }
        }

        // 检查场景图片
        if (product.senceImages) {
          for (const img of product.senceImages) {
            if (img.localPath === localPath) {
              sharedImages.push({
                type: 'scene',
                imageId: img.imageUrl || img.localPath,
                imageObject: img,
                applyCode: product.applyCode
              });
            }
          }
        }
      }

      console.log(`🔍 [syncFileTimeBaseline] 找到 ${sharedImages.length} 个共享此文件的图片:`,
        sharedImages.map(img => ({
          id: img.imageId.substring(0, 30) + '...',
          type: img.type,
          applyCode: img.applyCode,
          isCurrentImage: img.imageId === currentImageId
        }))
      );

      if (sharedImages.length <= 1) {
        console.log(`ℹ️ [syncFileTimeBaseline] 只有一个图片使用此文件，无需同步`);
        return;
      }

      // 批量更新所有共享图片的时间基准
      let syncedCount = 0;
      for (const sharedImg of sharedImages) {
        const oldTime = sharedImg.imageObject.lastModified || sharedImg.imageObject.timestamp || 0;
        sharedImg.imageObject.lastModified = currentFileTime;

        if (oldTime !== currentFileTime) {
          syncedCount++;
          console.log(`✅ [syncFileTimeBaseline] 同步图片时间基准: ${sharedImg.imageId.substring(0, 30)}... (${new Date(oldTime).toLocaleString()} → ${new Date(currentFileTime).toLocaleString()})`);
        }
      }

      console.log(`🎉 [syncFileTimeBaseline] 时间基准同步完成: 共处理 ${sharedImages.length} 个图片，实际更新 ${syncedCount} 个`);

    } catch (error) {
      console.error(`❌ [syncFileTimeBaseline] 同步文件时间基准失败:`, error);
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

    // 安全检查：确保 indexData 是数组
    if (!Array.isArray(this.indexData)) {
      console.warn(`⚠️ [状态迁移] indexData 不是数组，类型: ${typeof this.indexData}, 值:`, this.indexData);
      this.indexData = [];
      return { migrated: 0, total: 0 };
    }

    let migratedCount = 0;
    let totalCount = 0;

    console.log(`🔄 [状态迁移] 开始迁移产品 ${applyCode} 的图片状态`);

    for (const product of this.indexData) {
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

          // 重新计算所有图片的index字段
          product.originalImages.forEach((img, idx) => {
            img.index = idx;
          });
          console.log(`🔄 [deleteImageByIndex] 已重新计算原始图片索引，当前数量: ${product.originalImages.length}`);
        }
      } else if (imageType === 'sku') {
        if (product.publishSkus) {
          const sku = product.publishSkus.find(s => s.skuIndex === skuIndex);
          if (sku && sku.skuImages) {
            // 对于SKU图片，imageIndex参数实际传入的是imageUrl
            const index = sku.skuImages.findIndex(img => img.imageUrl === imageIndex);
            if (index >= 0) {
              imageInfo = sku.skuImages[index];
              sku.skuImages.splice(index, 1);
              deletedSuccessfully = true;
              console.log(`✅ [deleteImageByIndex] 从SKU图片索引中移除: SKU=${skuIndex}, imageUrl=${imageIndex}`);

              // 重新计算所有图片的index字段
              sku.skuImages.forEach((img, idx) => {
                img.index = idx;
              });
              console.log(`🔄 [deleteImageByIndex] 已重新计算SKU图片索引，SKU=${skuIndex}，当前数量: ${sku.skuImages.length}`);
            }
          }
        }
      } else if (imageType === 'scene') {
        if (product.senceImages) {
          // 使用 findIndex 精确查找，支持 imageUrl 或 index
          const index = typeof imageIndex === 'number'
            ? product.senceImages.findIndex(img => img.index === imageIndex)
            : product.senceImages.findIndex(img => img.imageUrl === imageIndex);

          if (index >= 0) {
            imageInfo = product.senceImages[index];
            product.senceImages.splice(index, 1);
            deletedSuccessfully = true;
            console.log(`✅ [deleteImageByIndex] 从场景图片索引中移除: 索引=${imageIndex}`);

            // 重新计算所有图片的index字段
            product.senceImages.forEach((img, idx) => {
              img.index = idx;
            });
            console.log(`🔄 [deleteImageByIndex] 已重新计算场景图片索引，当前数量: ${product.senceImages.length}`);
          }
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
   * 根据localPath删除所有SKU中的匹配图片（跨SKU删除）
   * @param {string} applyCode - 产品申请码
   * @param {string} localPath - 本地路径（格式：applyCode_filename.jpg）
   * @returns {Promise<{success: boolean, deletedCount: number}>} 删除结果
   */
  async deleteImageByLocalPathAcrossSkus(applyCode, localPath) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`🗑️ [deleteImageByLocalPathAcrossSkus] 跨SKU删除图片: 产品=${applyCode}, localPath=${localPath}`);

      // 查找产品
      const product = this.findProductByApplyCode(applyCode);
      if (!product) {
        console.warn(`❌ 未找到产品: ${applyCode}`);
        return { success: false, deletedCount: 0 };
      }

      let deletedCount = 0;

      // 遍历所有SKU
      if (product.publishSkus && Array.isArray(product.publishSkus)) {
        product.publishSkus.forEach(sku => {
          if (sku.skuImages && Array.isArray(sku.skuImages)) {
            // 找到所有匹配的图片（倒序遍历以避免索引问题）
            for (let i = sku.skuImages.length - 1; i >= 0; i--) {
              const img = sku.skuImages[i];
              if (img.localPath === localPath) {
                console.log(`  🗑️ 删除 SKU${sku.skuIndex} 中的图片: index=${i}, url=${img.imageUrl}`);
                sku.skuImages.splice(i, 1);
                deletedCount++;
              }
            }

            // 重新计算该SKU的图片索引
            sku.skuImages.forEach((img, idx) => {
              img.index = idx;
            });

            console.log(`  🔄 SKU${sku.skuIndex} 重新计算索引，剩余图片: ${sku.skuImages.length}`);
          }
        });
      }

      // 遍历场景图片
      if (product.senceImages && Array.isArray(product.senceImages)) {
        // 倒序遍历避免索引问题
        for (let i = product.senceImages.length - 1; i >= 0; i--) {
          const img = product.senceImages[i];
          if (img.localPath === localPath) {
            console.log(`  🗑️ 删除场景图片: index=${i}, url=${img.imageUrl}`);
            product.senceImages.splice(i, 1);
            deletedCount++;
          }
        }

        // 重新计算场景图片索引
        product.senceImages.forEach((img, idx) => {
          img.index = idx;
        });

        console.log(`  🔄 场景图片重新计算索引，剩余图片: ${product.senceImages.length}`);
      }

      if (deletedCount === 0) {
        console.warn(`❌ 未找到匹配的图片: localPath=${localPath}`);
        return { success: false, deletedCount: 0 };
      }

      // 注意：仅从索引中移除记录，保留本地文件（与现有逻辑一致）
      console.log(`📝 从索引中移除 ${deletedCount} 条图片记录，保留本地文件: ${localPath}`);

      // 保存索引数据
      await this.saveIndexData();

      console.log(`✅ [deleteImageByLocalPathAcrossSkus] 跨SKU删除完成，共删除 ${deletedCount} 条记录`);
      return { success: true, deletedCount };

    } catch (error) {
      console.error(`❌ [deleteImageByLocalPathAcrossSkus] 删除失败: ${error.message}`, error);
      return { success: false, deletedCount: 0 };
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

  /**
   * 扫描本地文件夹，修复index.json中的状态不一致
   * 使用场景：图片已下载到本地但索引未更新
   * @returns {Promise<number>} 修复的图片数量
   */
  async repairIndexData() {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log('🔧 [repairIndexData] 开始扫描本地文件系统...');

    let repairedCount = 0;
    const entries = await this.imageFolder.getEntries();

    for (const product of this.indexData) {
      // 查找产品文件夹
      const productFolder = entries.find(
        entry => entry.isFolder && entry.name === product.applyCode
      );

      if (!productFolder) {
        console.log(`⏭️  [repairIndexData] 跳过产品 ${product.applyCode}：文件夹不存在`);
        continue;
      }

      // 获取产品文件夹中的所有文件
      const files = await productFolder.getEntries();
      const fileMap = new Map(files.map(f => [f.name, f]));

      console.log(`🔍 [repairIndexData] 检查产品 ${product.applyCode}，本地文件数: ${fileMap.size}`);

      // 收集所有需要检查的图片数组
      const imageArrays = [
        { array: product.originalImages || [], type: 'original' },
        { array: product.senceImages || [], type: 'scene' },
        ...((product.publishSkus || []).map(sku => ({
          array: sku.skuImages || [],
          type: `sku-${sku.skuIndex}`
        })))
      ];

      // 遍历所有图片类型进行修复
      for (const { array, type } of imageArrays) {
        for (const img of array) {
          // 修复所有缺少localPath但本地文件存在的情况
          if (!img.localPath && img.imageUrl) {
            try {
              // 从URL提取文件名
              const urlObj = new URL(img.imageUrl);
              const filename = urlObj.pathname.split('/').pop();

              // 检查文件是否存在
              const localFile = fileMap.get(filename);

              if (localFile && !localFile.isFolder) {
                // 文件存在，读取文件大小并修复索引数据（以二进制格式读取图片文件）
                const arrayBuffer = await localFile.read({ format: formats.binary });
                const oldStatus = img.status;

                img.status = 'pending_edit';
                img.localPath = `${product.applyCode}/${filename}`;
                img.fileSize = arrayBuffer.byteLength;
                img.hasLocal = true;
                img.timestamp = Date.now();

                console.log(`✅ [repairIndexData] 修复 [${type}]: ${filename}`, {
                  oldStatus,
                  newStatus: 'pending_edit',
                  fileSize: arrayBuffer.byteLength,
                  localPath: img.localPath
                });
                repairedCount++;
              }
            } catch (error) {
              console.warn(`⚠️ [repairIndexData] 处理图片失败: ${img.imageUrl}`, error);
              // 继续处理其他图片
            }
          }
        }
      }
    }

    // 如果有修复，保存索引数据
    if (repairedCount > 0) {
      await this.saveIndexData();
      console.log(`✅ [repairIndexData] 修复完成，共修复 ${repairedCount} 条记录`);
    } else {
      console.log('✅ [repairIndexData] 未发现需要修复的数据');
    }

    return repairedCount;
  }

  /**
   * 验证产品是否完全同步（索引 + 文件系统）
   * @param {string} applyCode - 产品申请码
   * @returns {Promise<boolean>} - 是否完全同步
   */
  async isProductFullySynced(applyCode) {
    // 1. 检查索引中是否有记录
    const product = this.findProductByApplyCode(applyCode);
    if (!product) {
      console.log(`📊 [isProductFullySynced] ${applyCode}: 索引中无记录 → false`);
      return false;
    }

    // 2. 检查产品文件夹是否存在
    try {
      const entries = await this.imageFolder.getEntries();
      const productFolder = entries.find(
        entry => entry.isFolder && entry.name === applyCode
      );

      if (!productFolder) {
        console.log(`📊 [isProductFullySynced] ${applyCode}: 文件夹不存在 → false`);
        return false;
      }

      // 3. 收集所有图片
      const allImages = [
        ...(product.originalImages || []),
        ...(product.senceImages || []),
        ...((product.publishSkus || []).flatMap(sku => sku.skuImages || []))
      ];

      // 如果索引中没有任何图片记录，认为未同步
      if (allImages.length === 0) {
        console.log(`📊 [isProductFullySynced] ${applyCode}: 索引中无图片记录 → false`);
        return false;
      }

      // 4. 抽查前3张有localPath的图片是否真实存在
      const imagesToCheck = allImages
        .filter(img => img.localPath)
        .slice(0, Math.min(3, allImages.length));

      if (imagesToCheck.length === 0) {
        console.log(`📊 [isProductFullySynced] ${applyCode}: 无有效localPath → false`);
        return false;
      }

      for (const img of imagesToCheck) {
        try {
          const file = await this.getFileByPath(img.localPath);
          if (!file) {
            console.log(`📊 [isProductFullySynced] ${applyCode}: 文件缺失 ${img.localPath} → false`);
            return false;
          }
        } catch (error) {
          console.log(`📊 [isProductFullySynced] ${applyCode}: 文件访问失败 ${img.localPath} → false`);
          return false;
        }
      }

      console.log(`📊 [isProductFullySynced] ${applyCode}: 完全同步 → true`);
      return true;

    } catch (error) {
      console.error(`❌ [isProductFullySynced] ${applyCode}: 验证失败`, error);
      return false;
    }
  }

}

// 创建单例实例
export const localImageManager = new LocalImageManager();

// 默认导出单例
export default localImageManager;