// FileSystemUtils.js - UXP文件系统工具类
// 提供高级的文件操作、目录管理和存储优化功能

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
 * UXP文件系统工具类
 * 提供目录管理、文件操作、缓存和清理等功能
 */
export class FileSystemUtils {
  static instance = null;

  constructor() {
    if (FileSystemUtils.instance) {
      return FileSystemUtils.instance;
    }

    this.pluginDataFolder = null; // 插件数据根目录
    this.tempFolder = null; // 临时文件目录
    this.initialized = false;

    FileSystemUtils.instance = this;
  }

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!FileSystemUtils.instance) {
      FileSystemUtils.instance = new FileSystemUtils();
    }
    return FileSystemUtils.instance;
  }

  /**
   * 初始化文件系统工具
   */
  async initialize() {
    if (!isUXPEnvironment()) {
      throw new Error('文件系统工具仅在UXP环境中可用');
    }

    if (this.initialized) {
      return;
    }

    try {
      console.log('正在初始化文件系统工具...');

      // 获取用户数据目录
      const dataFolder = await fs.getDataFolder();

      // 创建插件专用数据目录
      try {
        this.pluginDataFolder = await dataFolder.createFolder('tvcmall-plugin', { overwrite: false });
      } catch (error) {
        if (error.message.includes('exists')) {
          console.log('插件数据目录已存在，使用现有目录');
          this.pluginDataFolder = await dataFolder.getEntry('tvcmall-plugin');
        } else {
          throw error;
        }
      }

      // 创建临时文件目录
      try {
        this.tempFolder = await this.pluginDataFolder.createFolder('temp', { overwrite: false });
      } catch (error) {
        if (error.message.includes('exists')) {
          console.log('临时文件目录已存在，使用现有目录');
          this.tempFolder = await this.pluginDataFolder.getEntry('temp');
        } else {
          throw error;
        }
      }

      this.initialized = true;
      console.log('✅ 文件系统工具初始化成功');
    } catch (error) {
      console.error('❌ 文件系统工具初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保目录存在，如果不存在则创建
   * @param {string} folderPath 目录路径（相对于插件数据目录）
   * @returns {Promise<Folder>} 目录对象
   */
  async ensureDirectory(folderPath) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const parts = folderPath.split('/').filter(part => part.length > 0);
      let currentFolder = this.pluginDataFolder;

      for (const part of parts) {
        try {
          currentFolder = await currentFolder.createFolder(part, { overwrite: false });
        } catch (error) {
          if (error.message.includes('exists')) {
            console.log(`目录 ${part} 已存在，使用现有目录`);
            currentFolder = await currentFolder.getEntry(part);
          } else {
            throw error;
          }
        }
      }

      return currentFolder;
    } catch (error) {
      console.error(`创建目录失败 ${folderPath}:`, error);
      throw new Error(`无法创建目录: ${error.message}`);
    }
  }

  /**
   * 获取目录信息
   * @param {string} folderPath 目录路径
   * @returns {Promise<Object>} 目录信息
   */
  async getDirectoryInfo(folderPath) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const folder = await this.getFolder(folderPath);
      if (!folder) {
        return null;
      }

      const entries = await folder.getEntries();
      const info = {
        path: folderPath,
        nativePath: folder.nativePath,
        exists: true,
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
        files: [],
        folders: []
      };

      for (const entry of entries) {
        if (entry.isFile) {
          info.fileCount++;
          const metadata = await entry.getMetadata();
          info.totalSize += metadata.size || 0;
          info.files.push({
            name: entry.name,
            size: metadata.size || 0,
            dateModified: metadata.dateModified,
            dateCreated: metadata.dateCreated
          });
        } else if (entry.isFolder) {
          info.folderCount++;
          info.folders.push({
            name: entry.name
          });
        }
      }

      return info;
    } catch (error) {
      console.error(`获取目录信息失败 ${folderPath}:`, error);
      return {
        path: folderPath,
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * 获取文件夹对象
   * @param {string} folderPath 相对路径
   * @returns {Promise<Folder|null>} 文件夹对象
   */
  async getFolder(folderPath) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const parts = folderPath.split('/').filter(part => part.length > 0);
      let currentFolder = this.pluginDataFolder;

      for (const part of parts) {
        currentFolder = await currentFolder.getEntry(part);
        if (!currentFolder || !currentFolder.isFolder) {
          return null;
        }
      }

      return currentFolder;
    } catch (error) {
      return null;
    }
  }

  /**
   * 复制文件
   * @param {File} sourceFile 源文件
   * @param {string} targetPath 目标路径（相对于插件数据目录）
   * @param {string} targetName 目标文件名
   * @returns {Promise<File>} 复制后的文件
   */
  async copyFile(sourceFile, targetPath, targetName) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const targetFolder = await this.ensureDirectory(targetPath);

      // 读取源文件
      const sourceBuffer = await sourceFile.read({ format: formats.binary });

      // 创建目标文件
      const targetFile = await targetFolder.createFile(targetName, { overwrite: true });
      await targetFile.write(sourceBuffer, { format: formats.binary });

      console.log(`文件复制成功: ${sourceFile.name} -> ${targetPath}/${targetName}`);
      return targetFile;
    } catch (error) {
      console.error('文件复制失败:', error);
      throw new Error(`文件复制失败: ${error.message}`);
    }
  }

  /**
   * 移动文件
   * @param {File} sourceFile 源文件
   * @param {string} targetPath 目标路径
   * @param {string} targetName 目标文件名
   * @returns {Promise<File>} 移动后的文件
   */
  async moveFile(sourceFile, targetPath, targetName) {
    try {
      // 先复制
      const newFile = await this.copyFile(sourceFile, targetPath, targetName);

      // 再删除源文件
      await sourceFile.delete();

      console.log(`文件移动成功: ${sourceFile.name} -> ${targetPath}/${targetName}`);
      return newFile;
    } catch (error) {
      console.error('文件移动失败:', error);
      throw new Error(`文件移动失败: ${error.message}`);
    }
  }

  /**
   * 删除目录及其所有内容
   * @param {string} folderPath 目录路径
   * @returns {Promise<Object>} 删除统计
   */
  async deleteDirectory(folderPath) {
    if (!this.initialized) {
      await this.initialize();
    }

    const stats = { deletedFiles: 0, deletedFolders: 0, errors: [] };

    try {
      const folder = await this.getFolder(folderPath);
      if (!folder) {
        console.log(`目录不存在: ${folderPath}`);
        return stats;
      }

      await this.deleteDirectoryRecursive(folder, stats);

      console.log(`目录删除完成: ${folderPath}`, stats);
      return stats;
    } catch (error) {
      console.error(`删除目录失败 ${folderPath}:`, error);
      stats.errors.push({ path: folderPath, error: error.message });
      return stats;
    }
  }

  /**
   * 递归删除目录内容
   * @param {Folder} folder 目录对象
   * @param {Object} stats 统计对象
   */
  async deleteDirectoryRecursive(folder, stats) {
    try {
      const entries = await folder.getEntries();

      for (const entry of entries) {
        try {
          if (entry.isFile) {
            await entry.delete();
            stats.deletedFiles++;
          } else if (entry.isFolder) {
            await this.deleteDirectoryRecursive(entry, stats);
            await entry.delete();
            stats.deletedFolders++;
          }
        } catch (error) {
          stats.errors.push({ path: entry.name, error: error.message });
        }
      }
    } catch (error) {
      stats.errors.push({ path: folder.name, error: error.message });
    }
  }

  /**
   * 清理临时文件
   * @param {number} maxAge 最大保留时间（毫秒）
   * @returns {Promise<Object>} 清理统计
   */
  async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 默认24小时
    if (!this.initialized) {
      await this.initialize();
    }

    const stats = { deletedFiles: 0, errors: [] };
    const currentTime = Date.now();

    try {
      if (!this.tempFolder) {
        return stats;
      }

      const entries = await this.tempFolder.getEntries();

      for (const entry of entries) {
        try {
          if (entry.isFile) {
            const metadata = await entry.getMetadata();
            const fileAge = currentTime - metadata.dateCreated.getTime();

            if (fileAge > maxAge) {
              await entry.delete();
              stats.deletedFiles++;
              console.log(`已清理临时文件: ${entry.name}`);
            }
          }
        } catch (error) {
          stats.errors.push({ file: entry.name, error: error.message });
        }
      }
    } catch (error) {
      console.error('清理临时文件失败:', error);
      stats.errors.push({ operation: 'cleanup', error: error.message });
    }

    console.log(`临时文件清理完成: 删除了 ${stats.deletedFiles} 个文件`);
    return stats;
  }

  /**
   * 获取存储使用情况
   * @returns {Promise<Object>} 存储统计信息
   */
  async getStorageUsage() {
    if (!this.initialized) {
      await this.initialize();
    }

    const usage = {
      totalSize: 0,
      fileCount: 0,
      folderCount: 0,
      breakdown: {}
    };

    try {
      if (!this.pluginDataFolder) {
        return usage;
      }

      await this.calculateDirectorySize(this.pluginDataFolder, usage, '');

      // 格式化大小显示
      usage.formattedSize = this.formatFileSize(usage.totalSize);

      return usage;
    } catch (error) {
      console.error('获取存储使用情况失败:', error);
      usage.error = error.message;
      return usage;
    }
  }

  /**
   * 递归计算目录大小
   * @param {Folder} folder 目录对象
   * @param {Object} usage 使用统计对象
   * @param {string} path 当前路径
   */
  async calculateDirectorySize(folder, usage, path) {
    try {
      const entries = await folder.getEntries();
      const folderStats = { size: 0, files: 0, folders: 0 };

      for (const entry of entries) {
        if (entry.isFile) {
          const metadata = await entry.getMetadata();
          const fileSize = metadata.size || 0;

          folderStats.size += fileSize;
          folderStats.files++;
          usage.totalSize += fileSize;
          usage.fileCount++;
        } else if (entry.isFolder) {
          folderStats.folders++;
          usage.folderCount++;

          const subPath = path ? `${path}/${entry.name}` : entry.name;
          await this.calculateDirectorySize(entry, usage, subPath);
        }
      }

      if (path) {
        usage.breakdown[path] = folderStats;
      }
    } catch (error) {
      console.error(`计算目录大小失败 ${path}:`, error);
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 创建临时文件
   * @param {string} filename 文件名
   * @param {ArrayBuffer|string} content 文件内容
   * @param {string} format 文件格式 ('binary' | 'utf8')
   * @returns {Promise<File>} 临时文件对象
   */
  async createTempFile(filename, content, format = 'binary') {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const tempFile = await this.tempFolder.createFile(filename, { overwrite: true });

      const writeFormat = format === 'utf8' ? formats.utf8 : formats.binary;
      await tempFile.write(content, { format: writeFormat });

      console.log(`临时文件创建成功: ${filename}`);
      return tempFile;
    } catch (error) {
      console.error(`创建临时文件失败 ${filename}:`, error);
      throw new Error(`创建临时文件失败: ${error.message}`);
    }
  }

  /**
   * 备份文件
   * @param {File} sourceFile 源文件
   * @param {string} backupPath 备份目录路径
   * @returns {Promise<File>} 备份文件
   */
  async backupFile(sourceFile, backupPath = 'backups') {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${sourceFile.name}.backup.${timestamp}`;

      return await this.copyFile(sourceFile, backupPath, backupName);
    } catch (error) {
      console.error('文件备份失败:', error);
      throw new Error(`文件备份失败: ${error.message}`);
    }
  }

  /**
   * 验证文件完整性
   * @param {File} file 文件对象
   * @param {number} expectedSize 预期文件大小
   * @returns {Promise<Object>} 验证结果
   */
  async validateFile(file, expectedSize = null) {
    try {
      const metadata = await file.getMetadata();
      const result = {
        valid: true,
        exists: true,
        size: metadata.size || 0,
        dateModified: metadata.dateModified,
        dateCreated: metadata.dateCreated,
        issues: []
      };

      // 检查文件大小
      if (result.size === 0) {
        result.valid = false;
        result.issues.push('文件为空');
      }

      if (expectedSize !== null && result.size !== expectedSize) {
        result.valid = false;
        result.issues.push(`文件大小不匹配: 预期 ${expectedSize}, 实际 ${result.size}`);
      }

      // 尝试读取文件头部来验证文件是否损坏
      try {
        const buffer = await file.read({ format: formats.binary });
        if (buffer.byteLength !== result.size) {
          result.valid = false;
          result.issues.push('文件读取大小与元数据不匹配');
        }
      } catch (readError) {
        result.valid = false;
        result.issues.push(`文件读取失败: ${readError.message}`);
      }

      return result;
    } catch (error) {
      return {
        valid: false,
        exists: false,
        error: error.message,
        issues: ['文件不存在或无法访问']
      };
    }
  }

  /**
   * 获取插件数据目录路径
   * @returns {string} 插件数据目录路径
   */
  getPluginDataPath() {
    return this.pluginDataFolder?.nativePath || '';
  }

  /**
   * 获取临时目录路径
   * @returns {string} 临时目录路径
   */
  getTempPath() {
    return this.tempFolder?.nativePath || '';
  }

  /**
   * 检查是否有足够的存储空间
   * @param {number} requiredBytes 需要的字节数
   * @returns {Promise<boolean>} 是否有足够空间
   */
  async hasEnoughSpace(requiredBytes) {
    try {
      // UXP目前没有直接获取磁盘空间的API
      // 这里做一个简单的检查：尝试创建一个小文件
      const testFile = await this.createTempFile('space_test.tmp', new ArrayBuffer(1024));
      await testFile.delete();

      // 如果能创建文件，假设有足够空间
      // 实际项目中可能需要更精确的检查
      return true;
    } catch (error) {
      console.warn('存储空间检查失败:', error);
      return false;
    }
  }
}

// 创建并导出单例实例
export const fileSystemUtils = FileSystemUtils.getInstance();

// 默认导出类
export default FileSystemUtils;