/**
 * 图片翻译API工具模块
 * 支持URL翻译和文件上传翻译
 */

import { post } from './http.js';
import { md5 } from './md5.js';

// API配置
const API_CONFIG = {
  LOGIN_URL: 'https://www.xiangjifanyi.com/open/user/login',
  URL_TRANSLATE_URL: 'https://api.tosoiot.com/',
  FILE_TRANSLATE_URL: 'https://api2.tosoiot.com/',
  IMG_TRANS_KEY: '7073216605',  // 固定的翻译密钥
  USER_KEY: '2860042962',  // 固定的用户密钥
  PHONE: '13534271656',
  PASSWD: 'TVC2024'
};

// Token缓存
let cachedToken = null;
let tokenExpireTime = null;

/**
 * 获取或刷新Token
 */
export async function getToken() {
  // 检查缓存的token是否有效
  if (cachedToken && tokenExpireTime && Date.now() < tokenExpireTime) {
    console.log('✅ [getToken] 使用缓存的token');
    return cachedToken;
  }

  try {
    console.log('🔑 [getToken] 开始获取新token');

    const response = await post(API_CONFIG.LOGIN_URL, {
      phone: API_CONFIG.PHONE,
      passwd: API_CONFIG.PASSWD
    });

    console.log('📥 [getToken] 登录响应:', response);

    if (response && response.data && response.data.token) {
      cachedToken = response.data.token;
      // 使用API返回的过期时间（秒），转换为毫秒，减去5分钟作为缓冲
      const expireSeconds = response.data.expire || 3600;
      tokenExpireTime = Date.now() + (expireSeconds - 300) * 1000;

      console.log('✅ [getToken] Token获取成功:', cachedToken);
      console.log('⏰ [getToken] Token过期时间:', new Date(tokenExpireTime).toLocaleString());
      return cachedToken;
    } else {
      console.error('❌ [getToken] 响应数据格式错误:', response);
      throw new Error('登录失败：未返回token');
    }
  } catch (error) {
    console.error('❌ [getToken] 获取token失败:', error);
    throw new Error(`获取翻译服务token失败: ${error.message}`);
  }
}

/**
 * 生成翻译API的签名
 * Sign = md5(CommitTime + '_' + UserKey + '_' + ImgTransKey) 小写
 */
function generateSign(commitTime, userKey, imgTransKey) {
  const signStr = `${commitTime}_${userKey}_${imgTransKey}`;
  console.log('🔐 [generateSign] 签名字符串:', signStr);

  const sign = md5(signStr).toLowerCase();
  console.log('🔐 [generateSign] 生成签名:', sign);

  return sign;
}

/**
 * URL方式翻译图片（云端图片）
 * @param {string} imageUrl - 图片URL
 * @param {Object} options - 翻译选项
 * @returns {Promise<string>} - 翻译后的图片URL
 */
export async function translateImageByUrl(imageUrl, options = {}) {
  try {
    console.log('🌐 [translateImageByUrl] 开始URL翻译:', imageUrl);

    // 构建请求参数（注意：CommitTime必须是秒级时间戳，10位）
    const commitTime = Math.floor(Date.now() / 1000).toString();
    const params = {
      Action: 'GetImageTranslate',
      SourceLanguage: options.sourceLang || 'CHS', // 默认中文
      TargetLanguage: options.targetLang || 'ENG', // 默认英文
      Url: imageUrl,  // 签名时使用原始URL
      ImgTransKey: API_CONFIG.IMG_TRANS_KEY,  // 使用固定密钥
      CommitTime: commitTime,
      EngineType: options.engineType || '',
      NeedWatermark: options.needWatermark || '0',
      NeedRmUrl: options.needRmUrl || '0',
      Qos: options.qos || ''
    };

    // 生成签名：md5(CommitTime + '_' + UserKey + '_' + ImgTransKey)
    params.Sign = generateSign(commitTime, API_CONFIG.USER_KEY, API_CONFIG.IMG_TRANS_KEY);
    console.log('🔐 [translateImageByUrl] 签名参数: CommitTime=%s, UserKey=%s, ImgTransKey=%s',
      commitTime, API_CONFIG.USER_KEY, API_CONFIG.IMG_TRANS_KEY);

    // 构建查询字符串（URL参数需要编码）
    const queryString = Object.entries(params)
      .filter(([_, value]) => value !== '')
      .map(([key, value]) => {
        // URL参数需要编码
        if (key === 'Url') {
          return `${key}=${encodeURIComponent(value)}`;
        }
        return `${key}=${value}`;
      })
      .join('&');

    const requestUrl = `${API_CONFIG.URL_TRANSLATE_URL}?${queryString}`;

    console.log('📤 [translateImageByUrl] 请求URL:', requestUrl);

    // 发送请求
    const response = await post(requestUrl, {});

    console.log('📥 [translateImageByUrl] 响应原始:', response);
    console.log('📊 [translateImageByUrl] 响应类型:', typeof response);
    console.log('📊 [translateImageByUrl] 响应Keys:', response ? Object.keys(response) : 'null');
    console.log('📊 [translateImageByUrl] JSON序列化:', JSON.stringify(response));

    // 尝试解析JSON字符串（如果response是字符串）
    let parsedResponse = response;
    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);
        console.log('✅ [translateImageByUrl] 成功解析JSON字符串');
      } catch (e) {
        console.error('❌ [translateImageByUrl] JSON解析失败:', e);
      }
    }

    console.log('📊 [translateImageByUrl] 解析后Code:', parsedResponse?.Code);
    console.log('📊 [translateImageByUrl] 解析后Data:', parsedResponse?.Data);

    // 解析响应（成功状态码是200，兼容数字和字符串类型）
    if (parsedResponse && (parsedResponse.Code === 200 || parsedResponse.Code === '200') && parsedResponse.Data) {
      const translatedUrl = parsedResponse.Data.SslUrl || parsedResponse.Data.Url;
      console.log('✅ [translateImageByUrl] 翻译成功:', translatedUrl);
      return translatedUrl;
    } else {
      console.error('❌ [translateImageByUrl] 响应判断失败，Code:', parsedResponse?.Code, 'Data:', parsedResponse?.Data);
      throw new Error(parsedResponse?.Message || '翻译失败');
    }
  } catch (error) {
    console.error('❌ [translateImageByUrl] URL翻译失败:', error);
    throw new Error(`URL翻译失败: ${error.message}`);
  }
}

/**
 * 文件方式翻译图片（本地图片）
 * @param {ArrayBuffer} fileBuffer - 图片文件的ArrayBuffer
 * @param {Object} options - 翻译选项
 * @returns {Promise<string>} - 翻译后的图片URL
 */
export async function translateImageByFile(fileBuffer, options = {}) {
  try {
    console.log('📁 [translateImageByFile] 开始文件翻译');

    // 构建请求参数（注意：CommitTime必须是秒级时间戳，10位）
    const commitTime = Math.floor(Date.now() / 1000).toString();
    const params = {
      Action: 'GetImageTranslate',
      SourceLanguage: options.sourceLang || 'CHS',
      TargetLanguage: options.targetLang || 'ENG',
      Url: 'local',
      ImgTransKey: API_CONFIG.IMG_TRANS_KEY,  // 使用固定密钥
      CommitTime: commitTime,
      EngineType: options.engineType || '',
      NeedWatermark: options.needWatermark || '0',
      NeedRmUrl: options.needRmUrl || '0',
      Qos: options.qos || ''
    };

    // 生成签名：md5(CommitTime + '_' + UserKey + '_' + ImgTransKey)
    params.Sign = generateSign(commitTime, API_CONFIG.USER_KEY, API_CONFIG.IMG_TRANS_KEY);
    console.log('🔐 [translateImageByFile] 签名参数: CommitTime=%s, UserKey=%s, ImgTransKey=%s',
      commitTime, API_CONFIG.USER_KEY, API_CONFIG.IMG_TRANS_KEY);

    // 构建查询字符串
    const queryString = Object.entries(params)
      .filter(([_, value]) => value !== '')
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const requestUrl = `${API_CONFIG.FILE_TRANSLATE_URL}?${queryString}`;

    console.log('📤 [translateImageByFile] 请求URL:', requestUrl);

    // 创建FormData
    const formData = new FormData();

    // 将ArrayBuffer转换为Blob
    const blob = new Blob([fileBuffer], { type: options.mimeType || 'image/png' });
    formData.append('file-stream', blob, options.filename || 'image.png');

    // 发送请求（使用http.js的post方法，传入FormData）
    const response = await post(requestUrl, formData);

    console.log('📥 [translateImageByFile] 响应原始:', response);
    console.log('📊 [translateImageByFile] 响应类型:', typeof response);
    console.log('📊 [translateImageByFile] 响应Keys:', response ? Object.keys(response) : 'null');

    // 尝试解析JSON字符串（如果response是字符串）
    let parsedResponse = response;
    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);
        console.log('✅ [translateImageByFile] 成功解析JSON字符串');
      } catch (e) {
        console.error('❌ [translateImageByFile] JSON解析失败:', e);
      }
    }

    console.log('📊 [translateImageByFile] 解析后Code:', parsedResponse?.Code);
    console.log('📊 [translateImageByFile] 解析后Data:', parsedResponse?.Data);

    // 解析响应（成功状态码是200，兼容数字和字符串类型）
    if (parsedResponse && (parsedResponse.Code === 200 || parsedResponse.Code === '200') && parsedResponse.Data) {
      const translatedUrl = parsedResponse.Data.SslUrl || parsedResponse.Data.Url;
      console.log('✅ [translateImageByFile] 翻译成功:', translatedUrl);
      return translatedUrl;
    } else {
      console.error('❌ [translateImageByFile] 响应判断失败，Code:', parsedResponse?.Code, 'Data:', parsedResponse?.Data);
      throw new Error(parsedResponse?.Message || '翻译失败');
    }
  } catch (error) {
    console.error('❌ [translateImageByFile] 文件翻译失败:', error);
    throw new Error(`文件翻译失败: ${error.message}`);
  }
}

/**
 * 智能翻译图片（自动选择URL或文件方式）
 * @param {string|ArrayBuffer} imageSource - 图片URL或文件ArrayBuffer
 * @param {Object} options - 翻译选项
 * @returns {Promise<string>} - 翻译后的图片URL
 */
export async function translateImage(imageSource, options = {}) {
  if (typeof imageSource === 'string') {
    // URL方式
    if (imageSource.startsWith('local://')) {
      throw new Error('local:// URL需要使用文件方式翻译，请提供ArrayBuffer');
    }
    return await translateImageByUrl(imageSource, options);
  } else if (imageSource instanceof ArrayBuffer) {
    // 文件方式
    return await translateImageByFile(imageSource, options);
  } else {
    throw new Error('不支持的图片源类型');
  }
}

/**
 * 清除缓存的token
 */
export function clearToken() {
  cachedToken = null;
  tokenExpireTime = null;
  console.log('🗑️ [clearToken] Token缓存已清除');
}
