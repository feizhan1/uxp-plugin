import { uploadImageToServer } from '../panels/photoshop-api.js';
import { localImageManager } from './LocalImageManager.js';

/**
 * 并发上传管理器
 * 支持智能并发控制、重试机制和详细进度反馈
 */
export class ConcurrentUploadManager {
  constructor(options = {}) {
    // 配置参数
    this.concurrency = options.concurrency || 3; // 并发数
    this.retryTimes = options.retryTimes || 3; // 重试次数
    this.retryDelay = options.retryDelay || 1000; // 重试延迟（毫秒）
    this.maxRetryDelay = options.maxRetryDelay || 10000; // 最大重试延迟

    // 状态管理
    this.queue = []; // 待上传队列
    this.running = new Set(); // 正在上传的任务
    this.completed = []; // 已完成的任务
    this.failed = []; // 失败的任务
    this.results = {
      total: 0,
      success: 0,
      failed: 0,
      newUrls: {}, // imageId -> newUrl
      errors: [] // {imageId, error, attempts}
    };

    // 回调函数
    this.onProgress = null;
    this.onSuccess = null;
    this.onError = null;
    this.onComplete = null;

    // 统计信息
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * 添加上传任务到队列
   * @param {Array} images 图片信息数组
   * @param {Object} uploadParams 上传参数 {applyCode, userId, userCode}
   */
  setQueue(images, uploadParams) {
    this.queue = images.map(imageInfo => ({
      ...imageInfo,
      uploadParams,
      attempts: 0,
      status: 'pending' // pending, uploading, success, failed
    }));

    this.results.total = images.length;
    console.log(`🚀 [ConcurrentUploadManager] 队列已设置，共 ${images.length} 个任务`);
  }

  /**
   * 开始批量上传
   * @param {Function} onProgress 进度回调
   * @param {Function} onSuccess 单个成功回调
   * @param {Function} onError 单个错误回调
   * @param {Function} onComplete 全部完成回调
   */
  async startUpload(onProgress, onSuccess, onError, onComplete) {
    this.onProgress = onProgress;
    this.onSuccess = onSuccess;
    this.onError = onError;
    this.onComplete = onComplete;

    this.startTime = Date.now();
    console.log(`🎯 [ConcurrentUploadManager] 开始上传，并发数: ${this.concurrency}`);

    // 启动并发工作线程
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.worker());
    }

    // 等待所有工作线程完成
    await Promise.all(workers);

    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;

    console.log(`🏁 [ConcurrentUploadManager] 上传完成，耗时: ${duration}ms`);
    console.log(`📊 成功: ${this.results.success}, 失败: ${this.results.failed}`);

    if (this.onComplete) {
      this.onComplete(this.results, duration);
    }

    return this.results;
  }

  /**
   * 工作线程 - 处理上传队列
   */
  async worker() {
    while (true) {
      // 从队列中获取下一个任务
      const task = this.getNextTask();
      if (!task) {
        break; // 队列为空，退出
      }

      try {
        task.status = 'uploading';
        this.running.add(task);

        // 执行上传
        const result = await this.uploadWithRetry(task);

        if (result.success) {
          // 上传成功
          task.status = 'success';
          task.newUrl = result.url;
          this.completed.push(task);
          this.results.success++;
          this.results.newUrls[task.imageId] = result.url;

          // 标记图片为已上传
          await localImageManager.markImageAsUploaded(
            task.imageId,
            result.url,
            task.imageType,
            task.skuIndex
          );

          console.log(`✅ [Worker] ${task.imageId} 上传成功: ${result.url}`);

          if (this.onSuccess) {
            this.onSuccess(task, result);
          }
        } else {
          // 上传失败
          throw new Error(result.error || '上传失败');
        }

      } catch (error) {
        // 处理上传错误
        task.status = 'failed';
        task.error = error.message;
        this.failed.push(task);
        this.results.failed++;
        this.results.errors.push({
          imageId: task.imageId,
          error: error.message,
          attempts: task.attempts
        });

        console.error(`❌ [Worker] ${task.imageId} 上传失败: ${error.message}`);

        if (this.onError) {
          this.onError(task, error);
        }
      } finally {
        this.running.delete(task);

        // 触发进度更新
        if (this.onProgress) {
          this.onProgress({
            total: this.results.total,
            completed: this.results.success + this.results.failed,
            success: this.results.success,
            failed: this.results.failed,
            running: this.running.size,
            currentTask: task
          });
        }
      }
    }
  }

  /**
   * 获取下一个待处理任务
   */
  getNextTask() {
    for (const task of this.queue) {
      if (task.status === 'pending') {
        return task;
      }
    }
    return null;
  }

  /**
   * 带重试的上传方法
   */
  async uploadWithRetry(task) {
    const maxAttempts = this.retryTimes + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      task.attempts = attempt;

      try {
        // 获取修改后的图片文件
        const modifiedFile = await this.getModifiedImageFile(task);
        if (!modifiedFile) {
          throw new Error('无法获取修改后的图片文件');
        }

        // 读取文件数据
        const imageBuffer = await modifiedFile.read({
          format: require('uxp').storage.formats.binary
        });

        // 生成唯一的文件名
        const timestamp = Date.now();
        const filename = `${task.imageId.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.png`;

        // 上传到服务器
        console.log(`📤 [Upload] 尝试第${attempt}次上传: ${task.imageId}`);

        const uploadResult = await uploadImageToServer(
          imageBuffer,
          { filename },
          task.uploadParams.applyCode,
          task.uploadParams.userId,
          task.uploadParams.userCode
        );

        // uploadImageToServer返回的是URL字符串（dataClass的值）
        if (uploadResult && typeof uploadResult === 'string' && uploadResult.startsWith('http')) {
          return {
            success: true,
            url: uploadResult,
            attempt
          };
        } else {
          throw new Error('服务器未返回有效的图片URL');
        }

      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;

        if (isLastAttempt) {
          return {
            success: false,
            error: `上传失败（${maxAttempts}次尝试）: ${error.message}`,
            attempt
          };
        } else {
          // 计算重试延迟（指数退避）
          const delay = Math.min(
            this.retryDelay * Math.pow(2, attempt - 1),
            this.maxRetryDelay
          );

          console.warn(`⚠️ [Upload] ${task.imageId} 第${attempt}次上传失败，${delay}ms后重试: ${error.message}`);

          // 等待重试延迟
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * 获取修改后的图片文件
   */
  async getModifiedImageFile(imageInfo) {
    try {
      // 如果有修改后的文件，使用修改后的文件
      if (imageInfo.modifiedPath) {
        return await localImageManager.imageFolder.getEntry(imageInfo.modifiedPath);
      }

      // 否则使用原始本地文件
      if (imageInfo.localPath) {
        return await localImageManager.imageFolder.getEntry(imageInfo.localPath);
      }

      throw new Error('未找到本地文件路径');
    } catch (error) {
      console.error(`获取图片文件失败: ${error.message}`, imageInfo);
      throw error;
    }
  }

  /**
   * 获取上传统计信息
   */
  getStats() {
    return {
      ...this.results,
      duration: this.endTime ? this.endTime - this.startTime : null,
      runningCount: this.running.size,
      queueLength: this.queue.filter(t => t.status === 'pending').length
    };
  }

  /**
   * 取消所有上传
   */
  cancel() {
    // 将所有pending任务标记为取消
    for (const task of this.queue) {
      if (task.status === 'pending') {
        task.status = 'cancelled';
      }
    }

    console.log('🛑 [ConcurrentUploadManager] 上传已取消');
  }
}

export default ConcurrentUploadManager;