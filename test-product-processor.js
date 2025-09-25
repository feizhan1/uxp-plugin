// 测试ProductDataProcessor的功能
const fs = require('fs');
const path = require('path');

// 导入ProductDataProcessor（需要适配Node.js环境）
class ProductDataProcessor {
  static processProductData(apiData) {
    console.log('🔄 [ProductDataProcessor] 开始处理产品数据...');

    if (!apiData?.dataClass) {
      throw new Error('无效的API数据结构');
    }

    const { dataClass } = apiData;
    const { applyCode, originalImages = [], publishSkus = [] } = dataClass;

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
            id: this.generateImageId('original', applyCode, index),
            url: imageItem.imageUrl,
            applyCode: applyCode,
            imageType: 'original',
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
              id: this.generateImageId('sku', applyCode, imageIndex, skuIndex),
              url: imageItem.imageUrl,
              applyCode: applyCode,
              imageType: 'sku',
              sourceIndex: imageIndex,
              skuIndex: skuIndex,
              originalData: imageItem
            };

            imageList.push(imageInfo);
            console.log(`✅ [ProductDataProcessor] SKU图片 ${skuIndex}-${imageIndex}: ${imageInfo.id} -> ${imageItem.imageUrl}`);
          }
        });
      });

      console.log(`🎉 [ProductDataProcessor] 处理完成，共生成 ${imageList.length} 个图片条目`);
      return imageList;

    } catch (error) {
      console.error('❌ [ProductDataProcessor] 处理产品数据失败:', error);
      throw new Error(`处理产品数据失败: ${error.message}`);
    }
  }

  static generateImageId(imageType, applyCode, imageIndex, skuIndex = null) {
    if (imageType === 'original') {
      return `${applyCode}_original_${imageIndex}`;
    } else if (imageType === 'sku') {
      if (skuIndex === null || skuIndex === undefined) {
        throw new Error('SKU类型图片必须提供skuIndex');
      }
      return `${applyCode}_sku${skuIndex}_${imageIndex}`;
    } else {
      throw new Error(`不支持的图片类型: ${imageType}`);
    }
  }
}

// 测试函数
function testProductDataProcessor() {
  console.log('=== 开始测试ProductDataProcessor ===\n');

  // 测试test_2508160028.json
  console.log('📁 测试文件: test_2508160028.json');
  try {
    const data1 = JSON.parse(fs.readFileSync('test_2508160028.json', 'utf8'));
    const result1 = ProductDataProcessor.processProductData(data1);

    console.log('\n📊 处理结果统计:');
    console.log(`- 总图片数: ${result1.length}`);
    console.log(`- 原始图片: ${result1.filter(img => img.imageType === 'original').length}`);
    console.log(`- SKU图片: ${result1.filter(img => img.imageType === 'sku').length}`);

    console.log('\n📋 生成的localPath预览:');
    result1.slice(0, 5).forEach(img => {
      const localPath = generateLocalPath(img);
      console.log(`- ${img.id} -> ${localPath}`);
    });

  } catch (error) {
    console.error('❌ 测试test_2508160028.json失败:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // 测试test_2508180013.json
  console.log('📁 测试文件: test_2508180013.json');
  try {
    const data2 = JSON.parse(fs.readFileSync('test_2508180013.json', 'utf8'));
    const result2 = ProductDataProcessor.processProductData(data2);

    console.log('\n📊 处理结果统计:');
    console.log(`- 总图片数: ${result2.length}`);
    console.log(`- 原始图片: ${result2.filter(img => img.imageType === 'original').length}`);
    console.log(`- SKU图片: ${result2.filter(img => img.imageType === 'sku').length}`);

    console.log('\n📋 生成的localPath预览:');
    result2.slice(0, 8).forEach(img => {
      const localPath = generateLocalPath(img);
      console.log(`- ${img.id} -> ${localPath}`);
    });

  } catch (error) {
    console.error('❌ 测试test_2508180013.json失败:', error.message);
  }

  console.log('\n=== 测试完成 ===');
}

// 模拟generateLocalFilename逻辑
function generateLocalPath(imageInfo) {
  const { url, applyCode, imageType, sourceIndex, skuIndex } = imageInfo;

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileExtension = pathname.substring(pathname.lastIndexOf('.')) || '.jpg';

    if (imageType === 'original') {
      return `${applyCode}_original_${sourceIndex}${fileExtension}`;
    } else if (imageType === 'sku') {
      return `${applyCode}_sku${skuIndex}_${sourceIndex}${fileExtension}`;
    }
  } catch (error) {
    return `${applyCode}_fallback_${Date.now()}.jpg`;
  }
}

// 运行测试
testProductDataProcessor();