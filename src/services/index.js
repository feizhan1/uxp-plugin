/**
 * 服务模块入口文件
 * 导出所有服务类和工具
 */

import HttpClient from './HttpClient.js';
import AuthenticatedHttpClient from './AuthenticatedHttpClient.js';
import TokenManager from './TokenManager.js';
import { AuthService, UserCredentialsManager, SessionManager } from './auth/index.js';
import secureStorage from '../utils/SecureStorage.js';

// 创建默认的Token管理器实例
export const tokenManager = new TokenManager();

// 创建默认的HTTP客户端实例（集成Token管理器）
export const httpClient = new HttpClient({
  baseURL: 'https://m1.apifoxmock.com/m1/6903047-6618864-default',
  tokenManager: tokenManager,
  autoAuth: true,
  headers: {
    'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
    'Accept': '*/*',
    'Host': 'm1.apifoxmock.com',
    'Connection': 'keep-alive'
  }
});

// 创建认证增强的HTTP客户端实例
export const authenticatedHttpClient = new AuthenticatedHttpClient({
  baseURL: 'https://m1.apifoxmock.com/m1/6903047-6618864-default',
  tokenManager: tokenManager,
  autoAuth: true,
  maxRetryAttempts: 1,
  autoRetryOn401: true,
  headers: {
    'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
    'Accept': '*/*',
    'Host': 'm1.apifoxmock.com',
    'Connection': 'keep-alive'
  }
});

// 创建不带鉴权的HTTP客户端实例
export const httpClientNoAuth = new HttpClient({
  baseURL: 'https://m1.apifoxmock.com/m1/6903047-6618864-default',
  autoAuth: false,
  headers: {
    'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
    'Accept': '*/*',
    'Host': 'm1.apifoxmock.com',
    'Connection': 'keep-alive'
  }
});

// 创建身份验证服务实例
export const userCredentialsManager = new UserCredentialsManager(secureStorage);
export const authService = new AuthService(authenticatedHttpClient, userCredentialsManager);

// 导出类供自定义实例化使用
export { 
  HttpClient, 
  AuthenticatedHttpClient, 
  TokenManager, 
  AuthService, 
  UserCredentialsManager, 
  SessionManager 
};

// 导出错误处理工具
export * from '../utils/errorHandler.js';

// 导出安全存储工具
export { default as secureStorage } from '../utils/SecureStorage.js';