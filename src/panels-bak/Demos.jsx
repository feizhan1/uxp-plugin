import React, { useState, useEffect } from "react";

import ApiConfig from "../components/ApiConfig.jsx";
import ApiDataDisplay from "../components/ApiDataDisplay.jsx";
import ErrorNotificationContainer from "../components/ErrorNotificationContainer.jsx";

import UserLogin from "../components/UserLogin.jsx";
import { useApiConfig } from "../hooks/useApiConfig.js";
import { useErrorNotification } from "../hooks/useErrorNotification.js";
import useAuth from "../hooks/useAuth.js";
import "./Demos.css";
import TodoList from "../components/TodoList.jsx";

export const Demos = () => {

    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [showLoginForm, setShowLoginForm] = useState(false);

    // 认证状态管理
    const {
        isLoggedIn,
        user,
        logout,
        isLoading: authLoading,
        error: authError,
        clearError,
        getSessionInfo
    } = useAuth();

    // API配置管理
    const {
        config,
        updateConfig,
        testConnection,
        applyConfig,
        isLoading: configLoading
    } = useApiConfig();

    // 错误通知管理
    const {
        notifications,
        showSuccess,
        showError,
        showWarning,
        removeNotification
    } = useErrorNotification();

    // 监听认证错误并显示通知
    useEffect(() => {
        if (authError) {
            showError(authError, {
                title: '认证错误',
                duration: 8000,
                onRetry: () => {
                    clearError();
                    setShowLoginForm(true);
                }
            });
        }
    }, [authError, showError, clearError]);

    const handleConfigChange = (newConfig) => {
        updateConfig(newConfig);
    };

    const handleTestConnection = async (configToTest) => {
        try {
            await testConnection(configToTest);
            showSuccess('连接测试成功！');
        } catch (error) {
            showError(error);
        }
    };

    const handleApplyConfig = async () => {
        try {
            const success = await applyConfig();
            if (success) {
                showSuccess('API配置已成功应用！');
            }
        } catch (error) {
            showError(error);
        }
    };

    // 登录相关处理函数
    const handleLoginSuccess = async (credentials) => {
        console.log('开始登录流程:', credentials.username);
        setIsLoggingIn(true);

        try {
            setShowLoginForm(false);
        } catch (err) {
            console.error('登录失败:', err);
            showError(err, {
                title: '登录失败',
                duration: 8000,
                onRetry: () => {
                    // 重试时保持登录表单显示
                    setShowLoginForm(true);
                }
            });
            throw err;
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleLoginError = (error) => {
        console.error('登录表单错误:', error);
        showError(error.message || '登录失败', {
            title: '登录错误',
            duration: 6000
        });
        setIsLoggingIn(false);
    };

    const handleLogout = async () => {
        try {
            const sessionInfo = getSessionInfo();
            await logout();

            // 登出成功后的界面重置
            setShowLoginForm(false);

            showSuccess(`再见，${sessionInfo.user?.displayName || sessionInfo.user?.username || '用户'}！`, {
                title: '登出成功',
                duration: 4000
            });

            console.log('用户已成功登出');
        } catch (error) {
            console.error('登出失败:', error);
            showError(error, {
                title: '登出失败',
                duration: 6000
            });
        }
    };

    // 处理需要认证的回调
    const handleAuthRequired = () => {
        setShowLoginForm(true);
        showWarning('此功能需要登录后使用，请先完成身份验证', {
            title: '需要登录',
            duration: 6000,
            onAction: () => setShowLoginForm(true)
        });
    };

    return (
        <div className="demos">
            {/* 登录状态栏 - 始终显示 */}
            <div className="toolbar">
                {isLoggedIn ? (
                    <sp-button size="s" variant="secondary" onClick={handleLogout}>
                        <sp-icon name="ui:LogOutSmall" size="s" slot="icon"></sp-icon>
                        登出
                    </sp-button>
                ) : (
                    <sp-button
                        size="s"
                        variant="primary"
                        onClick={() => setShowLoginForm(true)}
                    >
                        <sp-icon name="ui:UserSmall" size="s" slot="icon"></sp-icon>
                        登录
                    </sp-button>
                )}
            </div>

            {/* 登录表单模态框 */}
            {showLoginForm && !isLoggedIn && (
                <UserLogin
                    onLoginSuccess={handleLoginSuccess}
                    onLoginError={handleLoginError}
                    isLoading={isLoggingIn}
                    initialCredentials={{ username: 'testuser' }}
                    onHide={() => setShowLoginForm(false)}
                />
            )}

            {!isLoggedIn && <TodoList />}



            {/* 错误通知容器 */}
            <ErrorNotificationContainer
                notifications={notifications}
                position="top-right"
                onClose={removeNotification}
                onRetry={(id) => {
                    const notification = notifications.find(n => n.id === id);
                    if (notification?.onRetry) {
                        notification.onRetry();
                    }
                    removeNotification(id);
                }}
            />
        </div>
    );
} 
