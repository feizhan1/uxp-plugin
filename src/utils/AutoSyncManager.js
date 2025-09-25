/**
 * 自动同步管理器
 * 负责在工作日中午1点自动执行图片同步
 */
export class AutoSyncManager {
  constructor() {
    this.intervalId = null;
    this.onSyncCallback = null;
    this.isEnabled = false;
    this.lastSyncDate = null;

    // 存储键名
    this.STORAGE_KEY = 'autoSyncLastDate';

    // 初始化时加载上次同步日期
    this.loadLastSyncDate();
  }

  /**
   * 从本地存储加载上次同步日期
   */
  async loadLastSyncDate() {
    try {
      console.log('AutoSyncManager: 加载上次同步日期...');

      // 尝试使用localStorage
      if (typeof localStorage !== 'undefined') {
        const lastDateString = localStorage.getItem(this.STORAGE_KEY);
        console.log('AutoSyncManager: localStorage获取到的值:', lastDateString);

        if (lastDateString) {
          this.lastSyncDate = new Date(lastDateString);
          console.log('AutoSyncManager: 解析的上次同步日期:', this.lastSyncDate);
        }
      } else {
        console.warn('AutoSyncManager: localStorage不可用');
        this.lastSyncDate = null;
      }
    } catch (error) {
      console.warn('AutoSyncManager: 加载上次同步日期失败:', error);
      this.lastSyncDate = null;
    }
  }

  /**
   * 保存上次同步日期到本地存储
   */
  async saveLastSyncDate(date) {
    try {
      console.log('AutoSyncManager: 保存同步日期:', date);

      // 尝试使用localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, date.toISOString());
        this.lastSyncDate = date;
        console.log('AutoSyncManager: 同步日期已保存到localStorage');
      } else {
        console.warn('AutoSyncManager: localStorage不可用，无法保存同步日期');
        this.lastSyncDate = date; // 至少在内存中保存
      }
    } catch (error) {
      console.error('AutoSyncManager: 保存同步日期失败:', error);
      this.lastSyncDate = date; // 至少在内存中保存
    }
  }

  /**
   * 判断是否为工作日（周一到周五）
   */
  isWorkday(date = new Date()) {
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5; // 1=周一, 5=周五
  }

  /**
   * 判断是否为中午1点（12:00-13:00之间）
   */
  isLunchTime(date = new Date()) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    return hour === 12 && minute >= 0 && minute <= 59;
  }

  /**
   * 判断今天是否已经同步过
   */
  isSyncedToday(date = new Date()) {
    if (!this.lastSyncDate) {
      return false;
    }

    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const lastSync = new Date(this.lastSyncDate.getFullYear(), this.lastSyncDate.getMonth(), this.lastSyncDate.getDate());

    return today.getTime() === lastSync.getTime();
  }

  /**
   * 检查是否应该执行自动同步
   */
  shouldSync(date = new Date()) {
    // 检查是否启用
    if (!this.isEnabled) {
      return false;
    }

    // 检查是否为工作日
    if (!this.isWorkday(date)) {
      return false;
    }

    // 检查是否为中午1点
    if (!this.isLunchTime(date)) {
      return false;
    }

    // 检查今天是否已经同步过
    if (this.isSyncedToday(date)) {
      return false;
    }

    return true;
  }

  /**
   * 定时检查函数
   */
  checkAndSync = async () => {
    try {
      const now = new Date();

      if (this.shouldSync(now)) {
        console.log('触发自动同步:', now.toLocaleString());

        // 执行同步回调
        if (this.onSyncCallback && typeof this.onSyncCallback === 'function') {
          await this.onSyncCallback('auto');

          // 记录同步时间
          await this.saveLastSyncDate(now);
          console.log('自动同步完成:', now.toLocaleString());
        }
      }
    } catch (error) {
      console.error('自动同步检查失败:', error);
    }
  };

  /**
   * 启动自动同步定时任务
   * @param {Function} onSyncCallback - 同步回调函数
   */
  start(onSyncCallback) {
    if (this.intervalId) {
      this.stop();
    }

    this.onSyncCallback = onSyncCallback;
    this.isEnabled = true;

    // 每分钟检查一次
    this.intervalId = setInterval(this.checkAndSync, 60 * 1000);

    console.log('自动同步管理器已启动');

    // 立即检查一次
    this.checkAndSync();
  }

  /**
   * 停止自动同步定时任务
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isEnabled = false;
    this.onSyncCallback = null;

    console.log('自动同步管理器已停止');
  }

  /**
   * 手动触发同步（用于测试）
   */
  async triggerSync() {
    if (this.onSyncCallback) {
      await this.onSyncCallback('manual');
    }
  }

  /**
   * 获取下次同步时间文本
   */
  getNextSyncInfo() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

    // 如果今天已经过了中午1点，计算明天的同步时间
    let nextSync = today;
    if (now.getTime() > today.getTime()) {
      nextSync = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    }

    // 找到下一个工作日
    while (!this.isWorkday(nextSync)) {
      nextSync = new Date(nextSync.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      nextSyncDate: nextSync,
      nextSyncText: `下次自动同步: ${nextSync.toLocaleDateString()} 12:00`,
      isSyncedToday: this.isSyncedToday(now),
      lastSyncDate: this.lastSyncDate
    };
  }

  /**
   * 重置同步记录（用于调试）
   */
  async resetSyncRecord() {
    try {
      console.log('AutoSyncManager: 重置同步记录...');

      // 尝试使用localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.STORAGE_KEY);
        console.log('AutoSyncManager: localStorage中的同步记录已删除');
      } else {
        console.warn('AutoSyncManager: localStorage不可用');
      }

      this.lastSyncDate = null;
      console.log('AutoSyncManager: 同步记录已重置');
    } catch (error) {
      console.error('AutoSyncManager: 重置同步记录失败:', error);
    }
  }
}

// 导出单例实例
export const autoSyncManager = new AutoSyncManager();