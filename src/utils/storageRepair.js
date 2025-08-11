/**
 * 存储修复工具
 * 用于修复和清理损坏的安全存储数据
 */

import secureStorage from './SecureStorage.js';

/**
 * 存储修复工具类
 */
class StorageRepair {
  constructor() {
    this.repairLog = [];
  }

  /**
   * 执行完整的存储修复
   * @returns {Promise<Object>} 修复结果
   */
  async performFullRepair() {
    console.log('🔧 开始执行存储修复...');
    
    const repairResult = {
      success: false,
      healthCheck: null,
      repairActions: [],
      summary: {
        totalIssues: 0,
        fixedIssues: 0,
        remainingIssues: 0
      }
    };

    try {
      // 1. 执行健康检查
      console.log('📋 执行存储健康检查...');
      repairResult.healthCheck = await secureStorage.checkStorageHealth();
      
      if (repairResult.healthCheck.healthy) {
        console.log('✅ 存储状态良好，无需修复');
        repairResult.success = true;
        return repairResult;
      }

      console.log(`⚠️ 发现 ${repairResult.healthCheck.issues.length} 个问题`);
      repairResult.summary.totalIssues = repairResult.healthCheck.issues.length;

      // 2. 清理损坏的数据
      if (repairResult.healthCheck.corruptedKeys && repairResult.healthCheck.corruptedKeys.length > 0) {
        console.log(`🧹 清理 ${repairResult.healthCheck.corruptedKeys.length} 个损坏的数据项...`);
        
        const cleanupResult = await secureStorage.cleanupCorruptedData(repairResult.healthCheck.corruptedKeys);
        repairResult.repairActions.push({
          action: 'cleanup_corrupted_data',
          result: cleanupResult
        });

        if (cleanupResult.success) {
          repairResult.summary.fixedIssues += cleanupResult.cleanedCount;
          console.log(`✅ 成功清理 ${cleanupResult.cleanedCount} 个损坏的数据项`);
        } else {
          console.log(`❌ 清理失败，剩余 ${cleanupResult.failedKeys.length} 个问题`);
        }
      }

      // 3. 重新检查存储健康状态
      console.log('🔍 重新检查存储健康状态...');
      const finalHealthCheck = await secureStorage.checkStorageHealth();
      repairResult.finalHealthCheck = finalHealthCheck;

      if (finalHealthCheck.healthy) {
        console.log('✅ 存储修复完成，状态良好');
        repairResult.success = true;
      } else {
        console.log(`⚠️ 修复后仍有 ${finalHealthCheck.issues.length} 个问题`);
        repairResult.summary.remainingIssues = finalHealthCheck.issues.length;
      }

      // 4. 生成修复报告
      this.generateRepairReport(repairResult);

      return repairResult;
    } catch (error) {
      console.error('❌ 存储修复失败:', error);
      repairResult.repairActions.push({
        action: 'repair_failed',
        error: error.message
      });
      return repairResult;
    }
  }

  /**
   * 快速修复（仅清理损坏数据）
   * @returns {Promise<Object>} 修复结果
   */
  async quickFix() {
    console.log('⚡ 执行快速修复...');
    
    try {
      // 获取所有安全存储的键
      const keys = Object.keys(localStorage);
      const secureKeys = keys.filter(key => key.startsWith('uxp_secure_'));
      
      console.log(`检查 ${secureKeys.length} 个安全存储项...`);
      
      const corruptedKeys = [];
      
      // 检查每个键的数据完整性
      for (const key of secureKeys) {
        try {
          const encrypted = localStorage.getItem(key);
          if (encrypted) {
            // 尝试解密
            const decrypted = secureStorage.crypto.decrypt(encrypted);
            if (!decrypted) {
              corruptedKeys.push(key);
            }
          }
        } catch (error) {
          corruptedKeys.push(key);
        }
      }

      if (corruptedKeys.length === 0) {
        console.log('✅ 未发现损坏的数据');
        return { success: true, cleanedCount: 0 };
      }

      console.log(`🧹 清理 ${corruptedKeys.length} 个损坏的数据项...`);
      
      // 清理损坏的数据
      const cleanupResult = await secureStorage.cleanupCorruptedData(corruptedKeys);
      
      if (cleanupResult.success) {
        console.log(`✅ 快速修复完成，清理了 ${cleanupResult.cleanedCount} 个数据项`);
      } else {
        console.log(`⚠️ 部分清理失败，剩余 ${cleanupResult.failedKeys.length} 个问题`);
      }

      return cleanupResult;
    } catch (error) {
      console.error('❌ 快速修复失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 重置所有安全存储
   * @returns {Promise<Object>} 重置结果
   */
  async resetAllStorage() {
    console.log('🔄 重置所有安全存储...');
    
    try {
      const result = await secureStorage.clearAll();
      
      if (result.success) {
        console.log(`✅ 成功重置，清理了 ${result.clearedCount} 个数据项`);
      } else {
        console.log(`⚠️ 重置过程中出现 ${result.errors.length} 个错误`);
      }

      return result;
    } catch (error) {
      console.error('❌ 重置失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 生成修复报告
   * @param {Object} repairResult - 修复结果
   */
  generateRepairReport(repairResult) {
    console.group('📊 存储修复报告');
    
    console.log('修复状态:', repairResult.success ? '✅ 成功' : '❌ 失败');
    console.log('总问题数:', repairResult.summary.totalIssues);
    console.log('已修复:', repairResult.summary.fixedIssues);
    console.log('剩余问题:', repairResult.summary.remainingIssues);
    
    if (repairResult.repairActions.length > 0) {
      console.log('修复操作:');
      repairResult.repairActions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action.action}:`, action.result || action.error);
      });
    }
    
    if (repairResult.healthCheck && repairResult.healthCheck.issues.length > 0) {
      console.log('发现的问题:');
      repairResult.healthCheck.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }
    
    console.groupEnd();
  }

  /**
   * 获取存储状态概览
   * @returns {Promise<Object>} 状态概览
   */
  async getStorageOverview() {
    try {
      const keys = Object.keys(localStorage);
      const secureKeys = keys.filter(key => key.startsWith('uxp_secure_'));
      
      let totalSize = 0;
      let validItems = 0;
      let corruptedItems = 0;
      
      for (const key of secureKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
          
          try {
            const decrypted = secureStorage.crypto.decrypt(value);
            if (decrypted) {
              validItems++;
            } else {
              corruptedItems++;
            }
          } catch (error) {
            corruptedItems++;
          }
        }
      }
      
      return {
        totalItems: secureKeys.length,
        validItems,
        corruptedItems,
        totalSize,
        averageSize: secureKeys.length > 0 ? Math.round(totalSize / secureKeys.length) : 0
      };
    } catch (error) {
      console.error('获取存储概览失败:', error);
      return null;
    }
  }
}

// 创建全局实例
const storageRepair = new StorageRepair();

// 导出便捷方法
export const repairStorage = () => storageRepair.performFullRepair();
export const quickFixStorage = () => storageRepair.quickFix();
export const resetStorage = () => storageRepair.resetAllStorage();
export const getStorageOverview = () => storageRepair.getStorageOverview();

export default storageRepair;