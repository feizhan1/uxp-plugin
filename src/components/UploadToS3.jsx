import React, { useRef, useState, useMemo } from 'react'
import { post } from '../utils/http.js'
import './UploadToS3.css'

/**
 * 上传图片到 指定接口（单张上传）
 * 约束：
 * - 仅支持常见图片格式（JPEG/PNG/GIF/WebP/BMP/SVG/AVIF）
 * - 大小限制 4MB（可通过 maxSizeMB 配置）
 * - 直接 POST 表单至后端接口，携带 Authorization 请求头
 *
 * 交互参考：Element Plus el-upload 的 picture-card 样式
 * 文档参考：https://element-plus.org/zh-CN/component/upload.html
 */
const UploadToS3 = ({
  accept = 'image/jpeg,image/png',
  maxSizeMB = 4,
  autoUpload = true,
  uploadingText = '上传中...',
  buttonText = '上传图片',
  applyCode,
  userId,
  userCode,
  onUploaded,
  onError,
}) => {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)

  // 环境探测：UXP（基于全局 window.uxp / UA）
  const isUXP = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = (navigator?.userAgent || '').toLowerCase()
    return Boolean(window.uxp) || ua.includes('uxp') || ua.includes('adobe')
  }, [])

  // 上传调试日志开关：localStorage.DEBUG_UPLOAD = '1' / 'true'，或 window.__DEBUG_UPLOAD__ = true
  const uploadDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const flag = localStorage.getItem('DEBUG_UPLOAD')
      if (flag && (flag === '1' || flag.toLowerCase() === 'true')) return true
    } catch { /* 忽略 */ }
    // 允许通过全局变量快速开启
    return Boolean(window.__DEBUG_UPLOAD__)
  }, [])

  // 安全格式化日志参数，避免 Symbol/二进制在 UXP 控制台抛错
  const formatUploadLogArg = (arg) => {
    try {
      if (arg == null) return String(arg)
      const t = typeof arg
      if (t === 'string' || t === 'number' || t === 'boolean') return String(arg)
      if (t === 'symbol') return String(arg)
      if (arg instanceof ArrayBuffer) return `[ArrayBuffer byteLength=${arg.byteLength}]`
      if (ArrayBuffer.isView && ArrayBuffer.isView(arg)) return `[TypedArray byteLength=${arg.byteLength}]`
      // 限制对象展开，避免循环引用
      try { return JSON.stringify(arg) } catch { return '[obj]' }
    } catch {
      return '[arg]'
    }
  }

  const logUpload = (...args) => {
    if (!uploadDebugEnabled) return
    const safeArgs = args.map(formatUploadLogArg)
    try { console.log('[上传调试]', ...safeArgs) } catch { /* 忽略 */ }
  }

  // 解析必填参数的多来源：props -> URL 查询 -> localStorage -> window.__UPLOAD_PARAMS__
  const getFromQuery = (key) => {
    try {
      if (typeof window === 'undefined') return ''
      const usp = new URLSearchParams(window.location?.search || '')
      return usp.get(key) || ''
    } catch { return '' }
  }
  const getFromLocal = (key) => {
    try {
      if (typeof window === 'undefined') return ''
      return localStorage.getItem(key) || ''
    } catch { return '' }
  }
  const getFromGlobal = (key) => {
    try {
      if (typeof window === 'undefined') return ''
      const g = window.__UPLOAD_PARAMS__ || {}
      return g?.[key] || ''
    } catch { return '' }
  }

  const effectiveApplyCode = useMemo(() => applyCode || getFromQuery('applyCode') || getFromLocal('applyCode') || getFromGlobal('applyCode'), [applyCode])
  const effectiveUserId = useMemo(() => userId || getFromQuery('userId') || getFromLocal('userId') || getFromGlobal('userId'), [userId])
  const effectiveUserCode = useMemo(() => userCode || getFromQuery('userCode') || getFromLocal('userCode') || getFromGlobal('userCode'), [userCode])

  const ensureRequiredParams = () => {
    const missing = []
    if (!effectiveApplyCode) missing.push('applyCode')
    if (!effectiveUserId) missing.push('userId')
    if (!effectiveUserCode) missing.push('userCode')
    if (missing.length) {
      const msg = `缺少必要参数：${missing.join(' / ')}`
      setError(msg)
      logUpload('参数校验失败：', { missing, effectiveApplyCode, effectiveUserId, effectiveUserCode })
      return { ok: false, msg }
    }
    return { ok: true }
  }

  // 供 <input accept> 使用的字符串（简化处理）
  const acceptAttr = accept || 'image/jpeg,image/png'

  // 尝试获取 uxp API（避免打包期静态 require）
  const getUxp = () => {
    try {
      if (typeof window !== 'undefined' && window.uxp) return window.uxp
      // 某些环境可通过 require('uxp') 获取
      const maybeRequire = typeof globalThis !== 'undefined' ? globalThis.require : undefined
      if (typeof maybeRequire === 'function') {
        try {
          const mod = maybeRequire('uxp')
          if (mod) return mod
        } catch { /* 忽略 */ }
      }
    } catch { /* 忽略 */ }
    return null
  }

  // 获取 UXP 支持的图片文件类型定义（仅支持 JPG/JPEG/PNG）
  const getUXPImageFileTypes = () => {
    return [
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG', extensions: ['png'] }
    ]
  }

  // 触发文件选择
  const handlePick = async () => {
    logUpload('触发文件选择，isUXP=', isUXP, 'uploading=', uploading)
    if (uploading) return
    const check = ensureRequiredParams()
    if (!check.ok) return
    if (isUXP) {
      await pickInUXP()
      return
    }
    inputRef.current?.click()
  }

  // 根据扩展名推测 MIME（仅支持 JPG/JPEG/PNG）
  const guessMimeFromExt = (fileName) => {
    const ext = (fileName?.split('.').pop() || '').toLowerCase()
    switch (ext) {
      case 'jpg':
      case 'jpeg': return 'image/jpeg'
      case 'png': return 'image/png'
      default: return 'application/octet-stream'
    }
  }

  // UXP 下文件选择（参考文档示例）
  const pickInUXP = async () => {
    const uxp = getUxp()
    if (!uxp?.storage?.localFileSystem) {
      setError('UXP 环境不可用或不支持文件系统 API')
      logUpload('UXP 文件系统不可用')
      return
    }
    setError('')
    setProgress(0)
    setSelectedFile(null)

    try {
      // 使用完整的文件类型定义（参考文档）
      const imageFileTypes = getUXPImageFileTypes()
      logUpload('UXP 打开文件对话框，文件类型=', imageFileTypes)

      // 尝试多种调用方式以绕过潜在问题
      let file = null
      
      try {
        // 方式1：使用完整对象格式
        logUpload('尝试方式1：完整对象格式')
        file = await uxp.storage.localFileSystem.getFileForOpening({
          types: imageFileTypes,
          allowMultiple: false
        })
      } catch (err1) {
        logUpload('方式1失败，错误详情：', {
          message: err1?.message || String(err1),
          name: err1?.name,
          stack: err1?.stack?.substring(0, 500) || '无堆栈信息'
        })
        
        try {
          // 方式2：使用字符串数组格式
          logUpload('尝试方式2：字符串数组格式')
          file = await uxp.storage.localFileSystem.getFileForOpening({
            types: ['jpg', 'jpeg', 'png'],
            allowMultiple: false
          })
        } catch (err2) {
          logUpload('方式2失败，错误详情：', {
            message: err2?.message || String(err2),
            name: err2?.name,
            stack: err2?.stack?.substring(0, 500) || '无堆栈信息'
          })
          
          try {
            // 方式3：使用点前缀格式
            logUpload('尝试方式3：点前缀格式')
            file = await uxp.storage.localFileSystem.getFileForOpening({
              types: ['.jpg', '.jpeg', '.png'],
              allowMultiple: false
            })
          } catch (err3) {
            logUpload('方式3失败，错误详情：', {
              message: err3?.message || String(err3),
              name: err3?.name,
              stack: err3?.stack?.substring(0, 500) || '无堆栈信息'
            })
            
            try {
              // 方式4：不指定类型过滤
              logUpload('尝试方式4：无类型过滤')
              file = await uxp.storage.localFileSystem.getFileForOpening({
                allowMultiple: false
              })
            } catch (err4) {
              logUpload('方式4失败，错误详情：', {
                message: err4?.message || String(err4),
                name: err4?.name,
                stack: err4?.stack?.substring(0, 500) || '无堆栈信息'
              })
              
              // 所有方式都失败，抛出最后一个错误
              throw err4
            }
          }
        }
      }

      if (!file) { 
        logUpload('用户取消选择文件'); 
        return 
      }

      handleUpload(file)
    } catch (e) {
      // 更详细的错误信息
      logUpload('pickInUXP 最终异常，完整错误信息：', {
        message: e?.message || String(e),
        name: e?.name,
        stack: e?.stack || '无堆栈信息',
        原始错误对象: e
      })
      
      // 主动取消不报错
      if (e && (e.name === 'Error' || e.message)) {
        // 仅在非取消情况下提示
        const errorMsg = String(e.message || e).toLowerCase()
        if (!errorMsg.includes('cancel') && !errorMsg.includes('cancelled')) {
          setError(e.message || '选择文件失败')
          logUpload('设置错误消息：', e.message || '选择文件失败')
        } else {
          logUpload('用户取消选择（异常分支）')
        }
      }
    }
  }

  // 文件校验（网页 input File）- 简化处理避免 trim 问题
  const validateFile = (file) => {
    if (!file) return '未选择文件'
    
    // 简化校验：直接检查 MIME 类型和扩展名
    const allowedMimes = ['image/jpeg', 'image/png']
    const allowedExts = ['jpg', 'jpeg', 'png']
    
    logUpload('开始校验文件：', { name: file?.name, type: file?.type, size: file?.size })
    
    // 按 MIME 匹配
    if (file.type && allowedMimes.includes(file.type)) {
      return ''
    }
    
    // 按扩展名匹配
    const ext = (file.name?.split('.').pop() || '').toLowerCase()
    if (ext && allowedExts.includes(ext)) {
      return ''
    }

    return `仅支持 JPG/JPEG/PNG 格式，当前格式：${file.type || ext || '未知'}`
  }

  // 选择文件变更（网页）
  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    logUpload('网页选择文件：', file ? { name: file.name, type: file.type, size: file.size } : '未选择')
    setError('')
    setProgress(0)
    setSelectedFile(null)

    if (!file) return
    const err = validateFile(file)
    if (err) {
      setError(err)
      logUpload('校验失败：', err)
      return
    }
    setSelectedFile(file)
    if (autoUpload) {
      logUpload('开始上传（网页 File）')
      await handleUpload(file)
    }
  }

  // 通过 http 工具以 POST 上传到指定接口（表单字段名需为大写 'File'）
  const directUpload = async (fileOrBlob, fileName, mimeType) => {
    const check = ensureRequiredParams()
    if (!check.ok) throw new Error(check.msg)

    const formData = new FormData()
    formData.append('File', fileOrBlob, fileName || (fileOrBlob && fileOrBlob.name) || 'image')
    formData.append('applyCode', effectiveApplyCode)
    formData.append('userId', effectiveUserId)
    formData.append('userCode', effectiveUserCode)

    console.log('发起上传请求（http.post', {
      path: '/api/publish/upload_product_image',
      fileName: fileName || fileOrBlob?.name,
      size: fileOrBlob?.size,
      mimeType,
      applyCode: effectiveApplyCode,
      userId: effectiveUserId,
      userCode: effectiveUserCode,
      formData: formData
    })

    const resp = await post('/api/publish/upload_product_image', formData, { timeout: 300000 })
    // 简单将进度置为 100（fetch 无法原生获取上传进度）
    setProgress(100)
    return resp || {}
  }

  // 执行上传（网页 File）
  const handleUpload = async (fileParam) => {
    const file = fileParam || selectedFile
    if (!file) {
      setError('请先选择图片')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)
    logUpload('开始上传流程（网页 File）：', { name: file.name, type: file.type, size: file.size })

    try {
      const resp = await directUpload(file, file.name, file.type)
      const {statusCode, message, dataClass} = resp || {}
      if (statusCode !== 200) {
        logUpload('上传响应标记失败：', message)
        throw new Error(message)
      }


      if (!dataClass) {
        logUpload('上传成功但无 URL，抛出异常')
        throw new Error('上传成功，但未返回图片URL（remote_url）')
      }

      logUpload('上传成功：', { dataClass })
      onUploaded && onUploaded({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        url: dataClass,
        response: resp,
      })

      // 成功后重置选择
      setSelectedFile(null)
      setProgress(0)
    } catch (err) {
      const msg = err?.message || '上传失败'
      setError(msg)
      logUpload('上传流程异常：', msg)
      onError && onError(msg)
    } finally {
      setUploading(false)
    }
  }

  // 执行上传（UXP Blob）
  const handleUploadBlob = async (blob, fileName, mimeType) => {
    setError('')
    setUploading(true)
    setProgress(0)
    logUpload('开始上传流程（UXP Blob）：', { fileName, size: blob?.size, type: blob?.type, mimeType })

    try {
      const resp = await directUpload(blob, fileName, mimeType)
      const {statusCode, message, dataClass} = resp || {}
      if (statusCode !== 200) {
        logUpload('上传响应标记失败：', message)
        throw new Error(message)
      }


      if (!dataClass) {
        logUpload('上传成功但无 URL，抛出异常')
        throw new Error('上传成功，但未返回图片URL（remote_url）')
      }

      logUpload('上传成功：', { dataClass })
      onUploaded && onUploaded({
        fileName,
        contentType: mimeType || blob.type,
        size: blob.size,
        url: dataClass,
        response: resp,
      })
      setProgress(0)
    } catch (err) {
      const msg = err?.message || '上传失败'
      setError(msg)
      logUpload('上传流程异常：', msg)
      onError && onError(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`s3-uploader card`}>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={uploading}
      />

      <div
        className={`s3-card ${uploading ? 'is-uploading' : ''}`}
        onClick={handlePick}
        role="button"
        tabIndex={0}
        aria-disabled={uploading}
      >
        {/* 始终展示占位内容，不展示预览 */}
        <div className="s3-placeholder">
          <div className="plus">+</div>
          <div className="text">{buttonText}</div>
          <div className="tip">点击选择文件，≤ {maxSizeMB}MB</div>
        </div>

        {/* 仅在上传中展示进度覆盖层 */}
        {uploading && (
          <div className="s3-overlay">
            <div className="s3-overlay__progress">
              <div className="bar" style={{ width: `${progress}%` }} />
              <div className="text">{uploadingText} {progress ? `${progress}%` : ''}</div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="s3-uploader__error">{error}</div>}
    </div>
  )
}

export default UploadToS3 