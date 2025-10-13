// 使用 fetch 封装通用 HTTP 工具，支持 BASE_URL 环境变量与图片上传

// 说明：
// - BASE_URL 通过 Vite 暴露的环境变量获取（优先 VITE_API_BASE_URL，其次 VITE_BASE_URL），由用户在 .env 中提供
// - 提供 request 基础方法，以及 get/post/put/del 便捷方法
// - 提供 uploadImage 方法用于上传图片（multipart/form-data）
// - 所有注释、错误信息均为中文，便于阅读

// const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const BASE_URL = 'https://openapi-prod.sjlpj.cn:6002'
// const BASE_URL = 'https://openapi.sjlpj.cn:5002'

/**
 * 构建完整请求 URL
 * @param {string} path 相对路径或完整 URL（若为 http 开头则不拼接 BASE_URL）
 * @param {string} [base] 基础域名（可通过 request 的 options.BASE_URL 或 options.baseUrl 传入覆盖）
 * @returns {string}
 */
function buildUrl(path, base = BASE_URL) {
  console.log('BASE_URL', base)
  if (!path) throw new Error('请求路径不能为空');
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedBase = base?.replace(/\/$/, '');
  console.log('base', normalizedBase)
  const p = String(path).replace(/^\//, '');
  return normalizedBase ? `${normalizedBase}/${p}` : `/${p}`;
}

/**
 * 构建查询字符串
 * @param {Record<string, any>} params
 */
function toQuery(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => usp.append(key, String(v)));
    } else if (typeof value === 'object') {
      usp.append(key, JSON.stringify(value));
    } else {
      usp.append(key, String(value));
    }
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 解析响应为 JSON 或文本
 * @param {Response} response
 */
async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  // 兜底为文本
  return response.text();
}

/**
 * 基础请求方法
 * @param {string} path 请求路径
 * @param {Object} options 配置项，可传递 BASE_URL 覆盖默认地址
 * @param {('GET'|'POST'|'PUT'|'DELETE'|'PATCH')} [options.method]
 * @param {Record<string, any>} [options.params] 查询参数
 * @param {any} [options.data] 请求体（自动 JSON 序列化，若为 FormData 则原样传递）
 * @param {Record<string, string>} [options.headers] 额外请求头
 * @param {number} [options.timeout=15000] 超时时间（毫秒）
 * @param {string} [options.baseUrl] 同 BASE_URL，小写写法
 * @returns {Promise<any>} 响应数据
 */
async function request(path, options = {}) {
  const {
    method = 'GET',
    params,
    data,
    headers = {},
    timeout = 15000,
    baseUrl,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // 处理 URL 与查询参数（允许 options 覆盖 BASE_URL）
  const finalBase = baseUrl;
  console.log('buildUrl(path, finalBase)', buildUrl(path, finalBase))
  const url = buildUrl(path, finalBase) + toQuery(params);

  const fetchOptions = {
    method,
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...headers,
    },
    signal: controller.signal,
  };

  // 仅当 data 存在且不是 GET/HEAD 时设置 body
  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase()) && data !== undefined;
  if (hasBody) {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      // 使用 FormData 时不显式设置 Content-Type，由浏览器自动带上 boundary
      fetchOptions.body = data;
    } else {
      // 若未显式设置 Content-Type，则默认使用 application/json（无 charset）
      const hasContentType = Object.keys(fetchOptions.headers || {}).some(k => k.toLowerCase() === 'content-type');
      if (!hasContentType) {
        fetchOptions.headers['Content-Type'] = 'application/json';
      }
      fetchOptions.body = JSON.stringify(data);
    }
  }

  try {
    const res = await fetch(url, fetchOptions);
    const payload = await parseResponse(res);

    if (!res.ok) {
      // 错误优先从 JSON 的 message 提取，其次文本
      const message = (payload && payload.message) || (typeof payload === 'string' ? payload : '请求失败');
      const error = new Error(message);
      error.status = res.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    // 统一错误抛出，便于上层捕获
    throw err instanceof Error ? err : new Error('网络异常或未知错误');
  } finally {
    clearTimeout(timer);
  }
}

// 便捷方法
function get(path, options = {}) {
  return request(path, { ...options, method: 'GET' });
}

function post(path, data, options = {}) {
  return request(path, { ...options, method: 'POST', data });
}

function put(path, data, options = {}) {
  return request(path, { ...options, method: 'PUT', data });
}

function del(path, options = {}) {
  return request(path, { ...options, method: 'DELETE' });
}

/**
 * 上传图片（或任意二进制数据），参考 uploadImageToServer 的行为
 * @param {string} path 上传接口路径
 * @param {File|Blob|ArrayBuffer|Uint8Array|Int8Array|Uint8ClampedArray} fileOrBuffer 文件或二进制数据
 * @param {Object} [options]
 * @param {string} [options.filename='canvas.png'] 文件名
 * @param {string} [options.mimeType='image/png'] MIME 类型
 * @param {string} [options.fieldName='file'] 表单字段名
 * @param {Object} [options.extraFields] 额外的表单字段
 * @param {Record<string, string>} [options.headers] 额外请求头（无需设置 Content-Type）
 * @param {number} [options.timeout=300000] 超时时间（默认 5 分钟）
 * @param {string} [options.baseUrl] 同 BASE_URL，小写写法
 */
function uploadImage(path, fileOrBuffer, options = {}) {
  if (!fileOrBuffer) throw new Error('上传文件不能为空');

  const {
    filename = 'canvas.png',
    mimeType = 'image/png',
    fieldName = 'file',
    extraFields = {},
    headers = {},
    timeout = 300000,
  } = options;

  let blob;
  if (typeof Blob !== 'undefined' && fileOrBuffer instanceof Blob) {
    blob = fileOrBuffer; // File 也继承自 Blob
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    blob = new Blob([fileOrBuffer], { type: mimeType });
  } else if (ArrayBuffer.isView(fileOrBuffer)) {
    // 处理 TypedArray 视图，避免携带多余的 buffer 数据
    const view = fileOrBuffer;
    const sliced = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    blob = new Blob([sliced], { type: mimeType });
  } else {
    throw new Error('不支持的文件类型，请传入 File、Blob 或 ArrayBuffer/TypedArray');
  }

  const form = new FormData();
  form.append(fieldName, blob, filename);
  Object.entries(extraFields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    form.append(k, v);
  });

  return request(path, {
    method: 'POST',
    data: form,
    headers, // 不设置 Content-Type，让运行环境自动添加 multipart 边界
    timeout,
    ...(options && options.BASE_URL ? { BASE_URL: options.BASE_URL } : {}),
    ...(options && options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
}

export {
  BASE_URL,
  request,
  get,
  post,
  put,
  del,
  uploadImage,
}; 