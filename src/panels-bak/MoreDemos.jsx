import React, { useState } from "react";

import { Hello } from "../components/Hello.jsx";
import { PlayIcon } from "../components/Icons.jsx";
import { usePaginatedApi } from "../hooks/usePaginatedApi.js";
import { useApiManager } from "../hooks/useApiManager.js";
import ErrorNotificationContainer from "../components/ErrorNotificationContainer.jsx";

export const MoreDemos = () => {
    const [showAdvancedDemo, setShowAdvancedDemo] = useState(false);
    const [selectedDemo, setSelectedDemo] = useState('pagination');

    // 分页API演示
    const pagination = usePaginatedApi('/posts', {
        pageSize: 5,
        autoFetch: false,
        cachePages: true
    });

    // API管理器演示
    const apiManager = useApiManager({
        showNotifications: true,
        autoRetry: true,
        maxRetries: 2
    });

    const handleStartPagination = () => {
        pagination.goToPage(1);
    };

    const handleBatchRequest = async () => {
        const requests = [
            { endpoint: '/users', method: 'GET' },
            { endpoint: '/posts', method: 'GET' },
            { endpoint: '/comments', method: 'GET' }
        ];

        try {
            const result = await apiManager.batch(requests);
            console.log('批量请求结果:', result);
        } catch (error) {
            console.error('批量请求失败:', error);
        }
    };

    const stats = apiManager.getRequestStats();
    const paginationInfo = pagination.getPaginationInfo();

    return (
        <div style={{ padding: '16px' }}>
            {/* 原有组件 */}
            <div style={{ marginBottom: '20px' }}>
                <Hello message="Advanced Features"/>
                <sp-button variant="primary" style={{ marginTop: '8px' }}>
                    <span slot="icon"><PlayIcon /></span>
                    Play Demo
                </sp-button>
            </div>

            {/* 高级功能演示切换 */}
            <div style={{ marginBottom: '20px' }}>
                <sp-button
                    variant={showAdvancedDemo ? "primary" : "secondary"}
                    onClick={() => setShowAdvancedDemo(!showAdvancedDemo)}
                >
                    <sp-icon name="ui:SettingsSmall" size="s" slot="icon"></sp-icon>
                    {showAdvancedDemo ? '隐藏高级功能' : '显示高级功能'}
                </sp-button>
            </div>

            {/* 高级功能演示 */}
            {showAdvancedDemo && (
                <div style={{ 
                    border: '1px solid var(--spectrum-global-color-gray-200)',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'var(--spectrum-global-color-gray-50)'
                }}>
                    <h3 style={{ 
                        margin: '0 0 16px 0',
                        fontSize: '16px',
                        fontWeight: '600'
                    }}>
                        高级API功能
                    </h3>

                    {/* 功能选择 */}
                    <div style={{ marginBottom: '16px' }}>
                        <sp-picker 
                            label="选择演示功能" 
                            value={selectedDemo}
                            onChange={(event) => setSelectedDemo(event.target.value)}
                        >
                            <sp-menu-item value="pagination">分页API</sp-menu-item>
                            <sp-menu-item value="batch">批量请求</sp-menu-item>
                            <sp-menu-item value="stats">请求统计</sp-menu-item>
                        </sp-picker>
                    </div>

                    {/* 分页API演示 */}
                    {selectedDemo === 'pagination' && (
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ 
                                margin: '0 0 12px 0',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                分页API演示
                            </h4>

                            <div style={{ 
                                display: 'flex', 
                                gap: '12px', 
                                marginBottom: '12px',
                                alignItems: 'center'
                            }}>
                                <sp-button
                                    variant="primary"
                                    size="s"
                                    onClick={handleStartPagination}
                                    disabled={pagination.loading}
                                >
                                    <sp-icon name="ui:PlaySmall" size="s" slot="icon"></sp-icon>
                                    开始分页
                                </sp-button>

                                <sp-button
                                    variant="secondary"
                                    size="s"
                                    onClick={pagination.prevPage}
                                    disabled={pagination.loading || !paginationInfo.hasPrevPage}
                                >
                                    <sp-icon name="ui:ChevronLeftSmall" size="s" slot="icon"></sp-icon>
                                    上一页
                                </sp-button>

                                <span style={{ 
                                    padding: '4px 8px',
                                    backgroundColor: 'var(--spectrum-global-color-blue-100)',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}>
                                    {paginationInfo.currentPage} / {paginationInfo.totalPages}
                                </span>

                                <sp-button
                                    variant="secondary"
                                    size="s"
                                    onClick={pagination.nextPage}
                                    disabled={pagination.loading || !paginationInfo.hasNextPage}
                                >
                                    <sp-icon name="ui:ChevronRightSmall" size="s" slot="icon"></sp-icon>
                                    下一页
                                </sp-button>
                            </div>

                            {/* 分页信息 */}
                            <div style={{
                                padding: '8px',
                                backgroundColor: 'var(--spectrum-global-color-gray-75)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginBottom: '12px'
                            }}>
                                <div>总条目: {paginationInfo.totalItems}</div>
                                <div>页面大小: {paginationInfo.pageSize}</div>
                                <div>缓存页数: {paginationInfo.cacheSize}</div>
                            </div>

                            {/* 数据展示 */}
                            {pagination.data && pagination.data.length > 0 && (
                                <div style={{
                                    maxHeight: '200px',
                                    overflow: 'auto',
                                    border: '1px solid var(--spectrum-global-color-gray-200)',
                                    borderRadius: '4px'
                                }}>
                                    {pagination.data.map((item, index) => (
                                        <div key={item.id || index} style={{
                                            padding: '8px',
                                            borderBottom: '1px solid var(--spectrum-global-color-gray-200)',
                                            fontSize: '12px'
                                        }}>
                                            <strong>{item.title || `项目 ${index + 1}`}</strong>
                                            {item.body && (
                                                <p style={{ 
                                                    margin: '4px 0 0 0', 
                                                    color: 'var(--spectrum-global-color-gray-600)',
                                                    fontSize: '11px'
                                                }}>
                                                    {item.body.substring(0, 100)}...
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {pagination.loading && (
                                <div style={{ 
                                    textAlign: 'center', 
                                    padding: '20px',
                                    color: 'var(--spectrum-global-color-gray-600)',
                                    fontSize: '13px'
                                }}>
                                    正在加载数据...
                                </div>
                            )}
                        </div>
                    )}

                    {/* 批量请求演示 */}
                    {selectedDemo === 'batch' && (
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ 
                                margin: '0 0 12px 0',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                批量请求演示
                            </h4>

                            <div style={{ marginBottom: '12px' }}>
                                <sp-button
                                    variant="primary"
                                    size="s"
                                    onClick={handleBatchRequest}
                                    disabled={apiManager.globalLoading}
                                >
                                    <sp-icon name="ui:DataSmall" size="s" slot="icon"></sp-icon>
                                    {apiManager.globalLoading ? '请求中...' : '执行批量请求'}
                                </sp-button>
                            </div>

                            <div style={{
                                padding: '8px',
                                backgroundColor: 'var(--spectrum-global-color-gray-75)',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}>
                                <div>将同时请求: /users, /posts, /comments</div>
                                <div>活跃请求: {apiManager.activeRequests.length}</div>
                            </div>
                        </div>
                    )}

                    {/* 请求统计演示 */}
                    {selectedDemo === 'stats' && (
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ 
                                margin: '0 0 12px 0',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                请求统计
                            </h4>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                                gap: '8px',
                                marginBottom: '12px'
                            }}>
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: 'var(--spectrum-global-color-blue-100)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                                        {stats.active}
                                    </div>
                                    <div>活跃</div>
                                </div>

                                <div style={{
                                    padding: '8px',
                                    backgroundColor: 'var(--spectrum-global-color-gray-100)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                                        {stats.total}
                                    </div>
                                    <div>总计</div>
                                </div>

                                <div style={{
                                    padding: '8px',
                                    backgroundColor: 'var(--spectrum-global-color-green-100)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                                        {stats.success}
                                    </div>
                                    <div>成功</div>
                                </div>

                                <div style={{
                                    padding: '8px',
                                    backgroundColor: 'var(--spectrum-global-color-red-100)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                                        {stats.error}
                                    </div>
                                    <div>失败</div>
                                </div>

                                <div style={{
                                    padding: '8px',
                                    backgroundColor: 'var(--spectrum-global-color-purple-100)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                                        {stats.successRate}%
                                    </div>
                                    <div>成功率</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <sp-button
                                    variant="secondary"
                                    size="s"
                                    onClick={apiManager.clearHistory}
                                >
                                    <sp-icon name="ui:CrossSmall" size="s" slot="icon"></sp-icon>
                                    清除历史
                                </sp-button>

                                <sp-button
                                    variant="secondary"
                                    size="s"
                                    onClick={apiManager.cancelAllRequests}
                                    disabled={apiManager.activeRequests.length === 0}
                                >
                                    <sp-icon name="ui:StopSmall" size="s" slot="icon"></sp-icon>
                                    取消所有
                                </sp-button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 错误通知容器 */}
            <ErrorNotificationContainer
                notifications={apiManager.notifications}
                position="bottom-right"
                onClose={apiManager.removeNotification}
                onRetry={(id) => {
                    const notification = apiManager.notifications.find(n => n.id === id);
                    if (notification?.onRetry) {
                        notification.onRetry();
                    }
                    apiManager.removeNotification(id);
                }}
            />
        </div>
    );
}
