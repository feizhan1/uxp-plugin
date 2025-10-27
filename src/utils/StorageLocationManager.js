// StorageLocationManager.js - 存储位置管理器
// 负责管理用户自定义的本地存储位置

// 检测是否在UXP环境中
const isUXPEnvironment = () => {
  try {
    return typeof require !== 'undefined' && require('photoshop') && require('uxp');
  } catch {
    return false;
  }
};

// 仅在UXP环境中加载相关模块
let fs;
if (isUXPEnvironment()) {
  try {
    fs = require('uxp').storage.localFileSystem;
  } catch (error) {
    console.warn('无法加载UXP存储模块:', error);
  }
}

// localStorage 键名
const STORAGE_TOKEN_KEY = 'tvcmall_storage_token';
const STORAGE_PATH_KEY = 'tvcmall_storage_path';
const STORAGE_CONFIG_TIME_KEY = 'tvcmall_storage_configured_at';
const STORAGE_LAST_VALIDATED_KEY = 'tvcmall_storage_last_validated';

/**
 * 存储位置管理器类
 * 管理用户选择的本地文件夹作为图片存储位置
 */
export class StorageLocationManager {
  constructor() {
    if (!isUXPEnvironment()) {
      console.warn('StorageLocationManager: 仅在UXP环境中可用');
    }
  }

  /**
   * 检查是否已配置存储位置
   * @returns {boolean}
   */
  hasConfigured() {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const path = localStorage.getItem(STORAGE_PATH_KEY);
    return !!(token && path);
  }

  /**
   * 获取存储文件夹
   * 如果未配置或token失效，将抛出错误
   * @returns {Promise<Folder>}
   */
  async getStorageFolder() {
    if (!isUXPEnvironment()) {
      throw new Error('存储位置管理器仅在UXP环境中可用');
    }

    const token = localStorage.getItem(STORAGE_TOKEN_KEY);

    if (!token) {
      throw new Error('未配置存储位置，请先选择文件夹');
    }

    try {
      const folder = await fs.getEntryForPersistentToken(token);

      // 更新上次验证时间
      localStorage.setItem(STORAGE_LAST_VALIDATED_KEY, Date.now().toString());

      console.log('✅ [StorageLocationManager] 使用存储位置:', folder.nativePath);
      return folder;
    } catch (error) {
      console.error('❌ [StorageLocationManager] 存储位置失效:', error);

      // 清除失效的配置（但保留路径显示）
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_LAST_VALIDATED_KEY);

      throw new Error('存储位置失效，请重新选择文件夹');
    }
  }

  /**
   * 让用户选择文件夹并保存配置
   * @returns {Promise<Folder|null>} 选择的文件夹，如果用户取消则返回null
   */
  async selectFolder() {
    if (!isUXPEnvironment()) {
      throw new Error('存储位置管理器仅在UXP环境中可用');
    }

    try {
      console.log('📁 [StorageLocationManager] 打开文件夹选择器...');

      // 打开文件夹选择器（只允许本地文件夹）
      const folder = await fs.getFolder();

      if (!folder) {
        console.log('⚠️ [StorageLocationManager] 用户取消了文件夹选择');
        return null;
      }

      console.log('✅ [StorageLocationManager] 用户选择了文件夹:', folder.nativePath);

      // 创建持久化访问令牌
      const token = await fs.createPersistentToken(folder);

      // 保存配置
      const now = Date.now();
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      localStorage.setItem(STORAGE_PATH_KEY, folder.nativePath);
      localStorage.setItem(STORAGE_CONFIG_TIME_KEY, now.toString());
      localStorage.setItem(STORAGE_LAST_VALIDATED_KEY, now.toString());

      console.log('✅ [StorageLocationManager] 存储位置已配置');
      console.log('   路径:', folder.nativePath);
      console.log('   Token:', token.substring(0, 20) + '...');

      return folder;
    } catch (error) {
      console.error('❌ [StorageLocationManager] 选择文件夹失败:', error);
      throw error;
    }
  }

  /**
   * 验证已保存的存储位置是否有效
   * @returns {Promise<boolean>}
   */
  async validateSavedLocation() {
    if (!this.hasConfigured()) {
      return false;
    }

    try {
      await this.getStorageFolder();
      return true;
    } catch (error) {
      console.warn('⚠️ [StorageLocationManager] 存储位置验证失败:', error.message);
      return false;
    }
  }

  /**
   * 获取当前配置信息
   * @returns {Object} 配置信息对象
   */
  getConfig() {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const path = localStorage.getItem(STORAGE_PATH_KEY);
    const configuredAt = localStorage.getItem(STORAGE_CONFIG_TIME_KEY);
    const lastValidated = localStorage.getItem(STORAGE_LAST_VALIDATED_KEY);

    return {
      hasConfig: !!(token && path),
      token: token || null,
      path: path || null,
      configuredAt: configuredAt ? parseInt(configuredAt) : null,
      lastValidated: lastValidated ? parseInt(lastValidated) : null,
      isValid: !!token // token存在才认为是有效的
    };
  }

  /**
   * 清除所有存储配置
   */
  clearConfig() {
    console.log('🧹 [StorageLocationManager] 清除存储配置');

    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_PATH_KEY);
    localStorage.removeItem(STORAGE_CONFIG_TIME_KEY);
    localStorage.removeItem(STORAGE_LAST_VALIDATED_KEY);
  }

  /**
   * 获取存储位置的显示信息（用于UI显示）
   * @returns {Object}
   */
  getDisplayInfo() {
    const config = this.getConfig();

    if (!config.hasConfig) {
      return {
        status: 'unconfigured',
        statusText: '未配置',
        path: '尚未选择存储位置',
        configuredAt: null,
        lastValidated: null
      };
    }

    return {
      status: config.isValid ? 'valid' : 'invalid',
      statusText: config.isValid ? '✅ 正常' : '❌ 失效',
      path: config.path || '未知',
      configuredAt: config.configuredAt ? new Date(config.configuredAt) : null,
      lastValidated: config.lastValidated ? new Date(config.lastValidated) : null
    };
  }
}

// 导出单例实例
export const storageLocationManager = new StorageLocationManager();

// 默认导出类
export default StorageLocationManager;
