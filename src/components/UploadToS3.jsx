import React, { useRef, useState } from 'react'
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
  accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/avif',
  maxSizeMB = 4,
  autoUpload = true,
  uploadingText = '上传中...',
  uploadUrl = 'https://www.tvcmall.com/api/tools/upload_file',
  authToken = '9da44eff375aa2ca97ae5727b25974ca',
  onUploaded,
  onError,
}) => {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)

  // 触发文件选择
  const handlePick = () => {
    if (uploading) return
    inputRef.current?.click()
  }

  // 文件校验
  const validateFile = (file) => {
    if (!file) return '未选择文件'
    const allowed = accept.split(',').map(s => s.trim())
    if (!allowed.includes(file.type)) return `不支持的图片格式：${file.type}`
    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) return `文件体积超出限制（最大 ${maxSizeMB}MB）`
    return ''
  }

  // 选择文件变更
  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    setError('')
    setProgress(0)
    setSelectedFile(null)

    if (!file) return
    const err = validateFile(file)
    if (err) {
      setError(err)
      return
    }
    setSelectedFile(file)
    if (autoUpload) {
      await handleUpload(file)
    }
  }

  // 直接表单上传（POST），带 Authorization 头
  const directUpload = async (url, token, file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      // 按照需求附带 Authorization 请求头（非 Bearer 前缀，原样传入）
      if (token) xhr.setRequestHeader('Authorization', token)
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const p = Math.round((evt.loaded / evt.total) * 100)
          setProgress(p)
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const text = xhr.responseText || ''
            const json = text ? JSON.parse(text) : {}
            resolve(json)
          } catch {
            resolve({})
          }
        } else {
          reject(new Error(`上传失败，状态码 ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('网络错误，上传失败'))
      xhr.send(formData)
    })
  }

  // 执行上传
  const handleUpload = async (fileParam) => {
    const file = fileParam || selectedFile
    if (!file) {
      setError('请先选择图片')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)

    try {
      const resp = await directUpload(uploadUrl, authToken, file)

      // 标准返回结构处理：
      // {
      //   "data": [{ "name": "占飞2.jpg", "remote_url": "https://...jpg" }],
      //   "code": 200, "success": true, "message": ""
      // }
      const isOk = (resp && (resp.success === true || resp.code === 200)) || (!('success' in (resp || {})) && !('code' in (resp || {})))
      if (!isOk) {
        const msg = resp?.message || '上传失败'
        throw new Error(msg)
      }

      let returnedUrl = ''
      let returnedName = ''

      if (Array.isArray(resp?.data) && resp.data.length > 0) {
        returnedUrl = resp.data[0]?.remote_url || ''
        returnedName = resp.data[0]?.name || ''
      }

      // 兼容其他可能结构
      if (!returnedUrl) {
        returnedUrl = resp?.url || resp?.data?.url || resp?.data?.fileUrl || resp?.fileUrl || resp?.path || ''
      }

      if (!returnedUrl) {
        throw new Error('上传成功，但未返回图片URL（remote_url）')
      }

      onUploaded && onUploaded({
        fileName: file.name,
        serverFileName: returnedName,
        contentType: file.type,
        size: file.size,
        url: returnedUrl,
        response: resp,
      })

      // 成功后重置选择
      setSelectedFile(null)
      setProgress(0)
    } catch (err) {
      const msg = err?.message || '上传失败'
      setError(msg)
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
        accept={accept}
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
          <div className="text">上传图片</div>
          <div className="tip">点击选择文件，≤ {maxSizeMB}MB</div>
        </div>

        {/* 仅在上传中展示进度覆盖层 */}
        {uploading && (
          <div className="s3-overlay">
            <div className="s3-overlay__progress">
              <div className="bar" style={{ width: `${progress}%` }} />
              <div className="text">{uploadingText} {progress}%</div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="s3-uploader__error">{error}</div>}
    </div>
  )
}

export default UploadToS3 