/**
 * API演示面板
 * 集成所有API相关功能的演示面板
 * 包括配置、数据展示、错误处理等功能
 */

import React, { useState } from 'react';
import ApiConfig from '../components/ApiConfig.jsx';
import ApiDataDisplay from '../components/ApiDataDisplay.jsx';
import ErrorNotificationContainer from '../components/ErrorNotificationContainer.jsx';
import { useApiConfig } from '../hooks/useApiConfig.js';
import { useApiManager } from '../hooks/useApiManager.js';
import { httpClient } from '../services/index.js';
import './ApiDemos.css';

export const ApiDemos = () => {
  const [activeTab, setActiveTab] = useState('config');
  const [selectedEndpoint, setSelectedEndpoint] = useState('/users');

  // API配置管理
  const {
    config,
    isLoading: configLoading,
    testResult,
    error: configError,
    updateConfig,
    applyConfig,
    testConnection,
    resetConfig
  } = useApiConfig();

  // API管理器
  const apiManager = useApiManager({
    showNotifications: true,
    autoRetry: true,
    maxRetries: 2
  });

  // 预定义的API端点
  const endpoints = [
    { value: '/users', label: '用户数据', description: '获取用户列表' },
    { value: '/posts', label: '文章数据', description: '获取文章列表' },
    { value: '/comments', label: '评论数据', description: '获取评论列表' },
    { value: '/albums', label: '相册数据', description: '获取相册列表' },
    { value: '/todos', label: '待办事项', description: '获取待办事项列表' }
  ];

  /**
   * 处理配置变化
   */
  const handleConfigChange = (newConfig) => {
    updateConfig(newConfig);
  };

  /**
   * 测试API连接
   */
  const handleTestConnection = async (configToTest) => {
    await testConnection(configToTest);
  };

  /**
   * 应用配置
   */
  const handleApplyConfig = async () => {
    const success = await applyConfig();
    if (success) {
      apiManager.showSuccess('API配置已成功应用');
    }
  };

  /**
   * 获取数据
   */
  const handleFetchData = async () => {
    if (!config.isValid) {
      apiManager.showError(new Error('请先配置有效的API设置'));
      return;
    }

    const request = apiManager.get(selectedEndpoint, {
      showSuccessNotification: true,
      successMessage: '数据获取成功！'
    });

    try {
      await request.execute();
    } catch (error) {
      console.error('数据获取失败:', error);
    }
  };

  /**
   * 渲染标签页
   */
  const renderTabs = () => {
    const tabs = [
      { key: 'config', label: 'API配置', icon: 'ui:SettingsSmall' },
      { key: 'data', label: '数据展示', icon: 'ui:DataSmall' },
      { key: 'status', label: '状态监控', icon: 'ui:InfoSmall' }
    ];

    return (
      <div className="api-demos-tabs">
        {tabs.map(({ key, label, icon }) => (
          <sp-button
            key={key}
            variant={activeTab === key ? 'primary' : 'secondary'}
            size="s"
            onClick={() => setActiveTab(key)}
            className="tab-button"
          >
            <sp-icon name={icon} size="s" slot="icon"></sp-icon>
            {label}
          </sp-button>
        ))}
      </div>
    );
  };

  /**
   * 渲染配置标签页
   */
  const renderConfigTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>API配置</h3>
        <p>配置API服务器地址和访问凭据</p>
        
        <ApiConfig
          initialConfig={config}
          onConfigChange={handleConfigChange}
          onTestConnection={handleTestConnection}
          isTestingConnection={configLoading}
        />

        {/* 测试结果 */}
        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            <sp-icon 
              name={testResult.success ? 'ui:CheckmarkSmall' : 'ui:AlertSmall'} 
              size="s"
            ></sp-icon>
            <div className="result-content">
              <strong>{testResult.message}</strong>
              {testResult.responseTime && (
                <span className="response-time">响应时间: {testResult.responseTime}ms</span>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="config-actions">
          <sp-button
            variant="primary"
            onClick={handleApplyConfig}
            disabled={!config.isValid || configLoading}
          >
            <sp-icon name="ui:CheckmarkSmall" size="s" slot="icon"></sp-icon>
            应用配置
          </sp-button>
          
          <sp-button
            variant="secondary"
            onClick={resetConfig}
            disabled={configLoading}
          >
            <sp-icon name="ui:RefreshSmall" size="s" slot="icon"></sp-icon>
            重置配置
          </sp-button>
        </div>
      </div>
    </div>
  );

  /**
   * 渲染数据标签页
   */
  const renderDataTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>数据获取与展示</h3>
        <p>选择API端点并获取数据</p>

        {/* 端点选择 */}
        <div className="endpoint-selector">
          <sp-picker 
            label="选择API端点" 
            value={selectedEndpoint}
            onChange={(event) => setSelectedEndpoint(event.target.value)}
          >
            {endpoints.map(({ value, label, description }) => (
              <sp-menu-item key={value} value={value}>
                <div className="endpoint-item">
                  <strong>{label}</strong>
                  <span className="endpoint-description">{description}</span>
                </div>
              </sp-menu-item>
            ))}
          </sp-picker>
        </div>

        {/* 操作按钮 */}
        <div className="data-actions">
          <sp-button
            variant="primary"
            onClick={handleFetchData}
            disabled={!config.isValid || apiManager.globalLoading}
          >
            <sp-icon name="ui:DataSmall" size="s" slot="icon"></sp-icon>
            {apiManager.globalLoading ? '获取中...' : '获取数据'}
          </sp-button>
        </div>

        {/* 数据展示 */}
        {config.isValid && (
          <div className="data-display-container">
            <ApiDataDisplay
              endpoint={selectedEndpoint}
              httpClient={httpClient}
              showMetadata={true}
              onDataReceived={(data) => {
                console.log('数据接收成功:', data);
              }}
              onError={(error) => {
                console.error('数据获取失败:', error);
              }}
            />
          </div>
        )}

        {!config.isValid && (
          <div className="config-warning">
            <sp-icon name="ui:AlertSmall" size="m"></sp-icon>
            <div className="warning-content">
              <h4>需要配置API</h4>
              <p>请先在"API配置"标签页中配置有效的API设置</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /**
   * 渲染状态标签页
   */
  const renderStatusTab = () => {
    const stats = apiManager.getRequestStats();
    
    return (
      <div className="tab-content">
        <div className="section">
          <h3>状态监控</h3>
          <p>查看API请求状态和统计信息</p>

          {/* 统计信息 */}
          <div className="stats-grid">
            <div className="stat-item">
              <sp-icon name="ui:PlaySmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.active}</span>
                <span className="stat-label">活跃请求</span>
              </div>
            </div>
            
            <div className="stat-item">
              <sp-icon name="ui:DataSmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">总请求数</span>
              </div>
            </div>
            
            <div className="stat-item">
              <sp-icon name="ui:CheckmarkSmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.success}</span>
                <span className="stat-label">成功请求</span>
              </div>
            </div>
            
            <div className="stat-item">
              <sp-icon name="ui:AlertSmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.error}</span>
                <span className="stat-label">失败请求</span>
              </div>
            </div>
            
            <div className="stat-item">
              <sp-icon name="ui:SpeedSmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.successRate}%</span>
                <span className="stat-label">成功率</span>
              </div>
            </div>
            
            <div className="stat-item">
              <sp-icon name="ui:InfoSmall" size="m"></sp-icon>
              <div className="stat-content">
                <span className="stat-value">{stats.notifications}</span>
                <span className="stat-label">通知数量</span>
              </div>
            </div>
          </div>

          {/* 活跃请求 */}
          {apiManager.activeRequests.length > 0 && (
            <div className="active-requests">
              <h4>活跃请求</h4>
              {apiManager.activeRequests.map(request => (
                <div key={request.id} className="request-item">
                  <div className="request-info">
                    <span className="request-method">{request.method}</span>
                    <span className="request-endpoint">{request.endpoint}</span>
                    <span className="request-time">
                      {Math.round((Date.now() - request.startTime) / 1000)}s
                    </span>
                  </div>
                  <sp-button
                    variant="secondary"
                    size="s"
                    onClick={() => apiManager.cancelRequest(request.id)}
                  >
                    <sp-icon name="ui:CrossSmall" size="s"></sp-icon>
                    取消
                  </sp-button>
                </div>
              ))}
            </div>
          )}

          {/* 请求历史 */}
          {apiManager.requestHistory.length > 0 && (
            <div className="request-history">
              <div className="history-header">
                <h4>请求历史</h4>
                <sp-button
                  variant="secondary"
                  size="s"
                  onClick={apiManager.clearHistory}
                >
                  <sp-icon name="ui:CrossSmall" size="s"></sp-icon>
                  清除历史
                </sp-button>
              </div>
              
              <div className="history-list">
                {apiManager.requestHistory.slice(0, 10).map(request => (
                  <div key={request.id} className="history-item">
                    <div className="history-info">
                      <span className="history-method">{request.method}</span>
                      <span className="history-endpoint">{request.endpoint}</span>
                      <span className={`history-status ${request.status}`}>
                        {request.status}
                      </span>
                    </div>
                    <span className="history-time">
                      {new Date(request.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="status-actions">
            <sp-button
              variant="secondary"
              onClick={apiManager.cancelAllRequests}
              disabled={apiManager.activeRequests.length === 0}
            >
              <sp-icon name="ui:StopSmall" size="s" slot="icon"></sp-icon>
              取消所有请求
            </sp-button>
            
            <sp-button
              variant="secondary"
              onClick={apiManager.clearAllNotifications}
              disabled={apiManager.notifications.length === 0}
            >
              <sp-icon name="ui:CrossSmall" size="s" slot="icon"></sp-icon>
              清除所有通知
            </sp-button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="api-demos">
      <div className="api-demos-header">
        <h2>API功能演示</h2>
        <p>配置API连接、获取数据并监控请求状态</p>
      </div>

      {/* 标签页导航 */}
      {renderTabs()}

      {/* 标签页内容 */}
      <div className="api-demos-content">
        {activeTab === 'config' && renderConfigTab()}
        {activeTab === 'data' && renderDataTab()}
        {activeTab === 'status' && renderStatusTab()}
      </div>

      {/* 错误通知容器 */}
      <ErrorNotificationContainer
        notifications={apiManager.notifications}
        position="top-right"
        onClose={apiManager.removeNotification}
        onRetry={(id) => {
          const notification = apiManager.notifications.find(n => n.id === id);
          if (notification?.onRetry) {
            notification.onRetry();
          }
          apiManager.removeNotification(id);
        }}
        onAction={(id, action) => {
          console.log('通知操作:', id, action);
          apiManager.removeNotification(id);
        }}
      />
    </div>
  );
};