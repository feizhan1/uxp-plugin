// ProductDataProcessor.js - 产品数据处理器
// 负责将API返回的产品数据转换为LocalImageManager期望的标准格式

/**
 * 产品数据处理器
 * 将API数据转换为标准化的图片列表，用于LocalImageManager处理
 */
export class ProductDataProcessor {

  /**
   * 处理产品API数据，转换为标准化的图片列表
   * @param {Object} apiData API返回的产品数据
   * @returns {Array} 标准化的图片列表
   */
  static processProductData(apiData) {
    console.log('🔄 [ProductDataProcessor] 开始处理产品数据...');
    console.log('🔄 [ProductDataProcessor] 输入数据:', apiData);

    if (!apiData?.dataClass) {
      throw new Error('无效的API数据结构');
    }

    const { dataClass } = apiData;
    const { applyCode, originalImages = [], publishSkus = [], senceImages = [] } = dataClass;

    if (!applyCode) {
      throw new Error('缺少申请码(applyCode)');
    }

    const imageList = [];

    try {
      // 处理 originalImages
      console.log(`📸 [ProductDataProcessor] 处理 ${originalImages.length} 张原始图片...`);
      originalImages.forEach((imageItem, index) => {
        if (imageItem?.imageUrl) {
          const imageInfo = {
            id: this.generateImageId(imageItem.imageUrl),
            url: imageItem.imageUrl,
            applyCode: applyCode,
            sourceIndex: index,
            originalData: imageItem
          };

          imageList.push(imageInfo);
          console.log(`✅ [ProductDataProcessor] 原始图片 ${index}: ${imageInfo.id} -> ${imageItem.imageUrl}`);
        }
      });

      // 处理 publishSkus 中的 skuImages
      console.log(`📸 [ProductDataProcessor] 处理 ${publishSkus.length} 个SKU...`);
      publishSkus.forEach((sku, skuIndex) => {
        const skuImages = sku?.skuImages || [];
        console.log(`📸 [ProductDataProcessor] SKU ${skuIndex} 包含 ${skuImages.length} 张图片...`);

        skuImages.forEach((imageItem, imageIndex) => {
          if (imageItem?.imageUrl) {
            const imageInfo = {
              id: this.generateImageId(imageItem.imageUrl),
              url: imageItem.imageUrl,
              applyCode: applyCode,
              sourceIndex: imageIndex,
              skuIndex: skuIndex,
              originalData: imageItem
            };

            imageList.push(imageInfo);
            console.log(`✅ [ProductDataProcessor] SKU图片 ${skuIndex}-${imageIndex}: ${imageInfo.id} -> ${imageItem.imageUrl}`);
          }
        });
      });

      // 处理 senceImages (场景图片)
      console.log(`📸 [ProductDataProcessor] 处理 ${senceImages.length} 张场景图片...`);
      senceImages.forEach((imageItem, index) => {
        if (imageItem?.imageUrl) {
          const imageInfo = {
            id: this.generateImageId(imageItem.imageUrl),
            url: imageItem.imageUrl,
            applyCode: applyCode,
            sourceIndex: index,
            imageType: 'scene', // 标识为场景图片
            originalData: imageItem
          };

          imageList.push(imageInfo);
          console.log(`✅ [ProductDataProcessor] 场景图片 ${index}: ${imageInfo.id} -> ${imageItem.imageUrl}`);
        }
      });

      console.log(`🎉 [ProductDataProcessor] 处理完成，共生成 ${imageList.length} 个图片条目`);
      return imageList;

    } catch (error) {
      console.error('❌ [ProductDataProcessor] 处理产品数据失败:', error);
      throw new Error(`处理产品数据失败: ${error.message}`);
    }
  }

  /**
   * 生成简单的图片ID（使用URL作为ID）
   * @param {string} imageUrl 图片URL
   * @returns {string} 图片ID
   */
  static generateImageId(imageUrl) {
    return imageUrl; // 直接使用URL作为ID，最简单直接
  }

  /**
   * 验证处理后的图片列表
   * @param {Array} imageList 图片列表
   * @returns {Object} 验证结果
   */
  static validateImageList(imageList) {
    const result = {
      isValid: true,
      errors: [],
      stats: {
        total: imageList.length,
        original: 0,
        sku: 0,
        duplicateIds: []
      }
    };

    const idSet = new Set();

    imageList.forEach((item, index) => {
      // 检查必需字段
      const requiredFields = ['id', 'url', 'applyCode', 'sourceIndex'];
      for (const field of requiredFields) {
        if (!item[field] && item[field] !== 0) {
          result.errors.push(`图片 ${index}: 缺少必需字段 '${field}'`);
          result.isValid = false;
        }
      }

      // 检查ID重复
      if (idSet.has(item.id)) {
        result.stats.duplicateIds.push(item.id);
        result.errors.push(`图片 ${index}: ID重复 '${item.id}'`);
        result.isValid = false;
      } else {
        idSet.add(item.id);
      }

      // 统计数量（根据imageType和skuIndex区分）
      if (item.skuIndex !== undefined && item.skuIndex !== null) {
        result.stats.sku++;
      } else if (item.imageType === 'scene') {
        // 为场景图片添加统计（如果需要的话可以扩展stats结构）
        result.stats.original++; // 暂时计入原始图片统计
      } else {
        result.stats.original++;
      }
    });

    console.log('📊 [ProductDataProcessor] 验证结果:', result);
    return result;
  }

  /**
   * 处理多个产品数据
   * @param {Array} productDataList 产品数据列表
   * @returns {Array} 合并后的图片列表
   */
  static processMultipleProducts(productDataList) {
    console.log(`🔄 [ProductDataProcessor] 处理 ${productDataList.length} 个产品数据...`);

    const allImages = [];

    productDataList.forEach((productData, index) => {
      try {
        const images = this.processProductData(productData);
        allImages.push(...images);
        console.log(`✅ [ProductDataProcessor] 产品 ${index + 1} 处理完成，包含 ${images.length} 张图片`);
      } catch (error) {
        console.error(`❌ [ProductDataProcessor] 产品 ${index + 1} 处理失败:`, error);
        throw error;
      }
    });

    console.log(`🎉 [ProductDataProcessor] 多产品处理完成，共 ${allImages.length} 张图片`);

    // 验证最终结果
    const validation = this.validateImageList(allImages);
    if (!validation.isValid) {
      console.error('❌ [ProductDataProcessor] 图片列表验证失败:', validation.errors);
      throw new Error('图片列表验证失败');
    }

    return allImages;
  }
}

// 导出单例实例
export const productDataProcessor = new ProductDataProcessor();

// 默认导出
export default ProductDataProcessor;