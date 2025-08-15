// photoshop-api.js - UXP Photoshop 插件图片放置API
/* eslint-disable no-undef */
// 检测是否在UXP环境中
const isUXPEnvironment = () => {
  try {
    return typeof require !== 'undefined' && require('photoshop') && require('uxp');
  } catch {
    return false;
  }
};

// 仅在UXP环境中加载Photoshop API
let photoshop, core, batchPlay, fs, formats;

if (isUXPEnvironment()) {
  try {
    photoshop = require('photoshop');
    core = photoshop.core;
    batchPlay = photoshop.action.batchPlay;
    fs = require('uxp').storage.localFileSystem;
    formats = require('uxp').storage.formats;
  } catch (error) {
    console.warn('无法加载UXP模块:', error);
  }
}

/**
 * 将图片放置到Photoshop文档中
 * @param {object} imageInfo - 包含图片信息的对象 { type, path?, url?, data?, filename? }
 */
export async function placeImageInPS(imageInfo) {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  console.log('开始放置图片到Photoshop:', imageInfo);

  // 使用executeAsModal确保操作的原子性和稳定性
  return core.executeAsModal(
    async (executionContext) => {
      try {
        let fileEntry;
        let fileToken;
        let imageSize;
        
        // 1) 根据图片类型获取文件实体（FileEntry）
        if (imageInfo.type === 'local' && imageInfo.path) {
          fileEntry = await getLocalFileEntry(imageInfo.path);
        } else if (imageInfo.type === 'remote' && imageInfo.url) {
          fileEntry = await getRemoteFileEntry(imageInfo.url, imageInfo.filename);
        } else if (imageInfo.type === 'base64' && imageInfo.data) {
          fileEntry = await getBase64FileEntry(imageInfo.data, imageInfo.filename);
        } else {
          // 默认尝试远程URL
          fileEntry = await getRemoteFileEntry(imageInfo.url || imageInfo.path, imageInfo.filename);
        }

        if (!fileEntry) {
          throw new Error('未能获取到图片文件');
        }

        // 2) 打开图片以获取尺寸，然后关闭图片文档（不保存）
        console.log('打开图片以读取尺寸...');
        imageSize = await openImageAndGetSize(fileEntry);
        if (!imageSize || !imageSize.width || !imageSize.height) {
          throw new Error('无法获取图片尺寸');
        }
        console.log('图片尺寸为:', imageSize.width, 'x', imageSize.height);

        // 3) 新建与图片尺寸一致的画布，并立即激活
        console.log('按图片尺寸新建文档...');
        const newDocId = await createNewDocument(imageSize.width, imageSize.height);
        await activateDocumentById(newDocId);

        // 4) 在新文档上挂起历史
        const suspensionID = await executionContext.hostControl.suspendHistory({
          documentID: newDocId,
          name: "从插件放置图片",
        });

        try {
          // 双重保证：再次选中新文档，避免外部切换
          await activateDocumentById(newDocId);
          // 5) 为文件实体创建会话令牌并放置为智能对象
          fileToken = await fs.createSessionToken(fileEntry);
          console.log('文件令牌获取成功，执行放置命令');
          await executePlaceCommand(fileToken);
          console.log('图片放置成功');
        } finally {
          await executionContext.hostControl.resumeHistory(suspensionID);
        }

      } catch (error) {
        console.error('放置图片时出错:', error);
        throw error;
      }
    },
    { commandName: "放置图片" }
  );
}

// --- 辅助函数 ---

/**
 * 激活指定ID的文档为当前活动文档
 */
async function activateDocumentById(documentId) {
  if (!documentId) return;
  try {
    await batchPlay([
      {
        _obj: 'select',
        _target: [{ _ref: 'document', _id: documentId }],
        makeVisible: false
      }
    ], { synchronousExecution: true, modalBehavior: 'execute' });
  } catch (e) {
    console.warn('激活文档失败，将继续尝试在当前文档放置:', e?.message || e);
  }
}

/**
 * 获取本地文件的会话令牌
 */
async function getLocalFileToken(path) {
  try {
    // 确保路径格式正确
    const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
    const file = await fs.getEntryWithUrl(fileUrl);
    
    if (!file) {
      throw new Error(`在路径找不到文件: ${path}`);
    }
    
    return fs.createSessionToken(file);
  } catch (error) {
    console.error('获取本地文件令牌失败:', error);
    throw new Error(`无法访问本地文件: ${error.message}`);
  }
}

/**
 * 获取本地文件的FileEntry
 */
async function getLocalFileEntry(path) {
  try {
    const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
    const file = await fs.getEntryWithUrl(fileUrl);
    if (!file) {
      throw new Error(`在路径找不到文件: ${path}`);
    }
    return file;
  } catch (error) {
    console.error('获取本地FileEntry失败:', error);
    throw new Error(`无法访问本地文件: ${error.message}`);
  }
}

/**
 * 获取远程图片的会话令牌（下载并创建临时文件）
 */
async function getRemoteFileToken(url, filename) {
  try {
    console.log('下载远程图片:', url);
    
    // 创建临时文件
    const tempFolder = await fs.getTemporaryFolder();
    const fileExtension = getFileExtension(url, filename);
    const tempFileName = `temp_${Date.now()}${fileExtension}`;
    const tempFile = await tempFolder.createFile(tempFileName, { overwrite: true });
    
    // 下载图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    await tempFile.write(arrayBuffer, { format: formats.binary });
    
    console.log('远程图片下载完成，创建会话令牌');
    return fs.createSessionToken(tempFile);
    
  } catch (error) {
    console.error('获取远程文件令牌失败:', error);
    throw new Error(`无法下载图片: ${error.message}`);
  }
}

/**
 * 获取远程图片的FileEntry（下载并创建临时文件）
 */
async function getRemoteFileEntry(url, filename) {
  try {
    console.log('下载远程图片(FileEntry):', url);
    const tempFolder = await fs.getTemporaryFolder();
    const fileExtension = getFileExtension(url, filename);
    const tempFileName = `temp_${Date.now()}${fileExtension}`;
    const tempFile = await tempFolder.createFile(tempFileName, { overwrite: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败 (${response.status}): ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await tempFile.write(arrayBuffer, { format: formats.binary });
    return tempFile;
  } catch (error) {
    console.error('获取远程FileEntry失败:', error);
    throw new Error(`无法下载图片: ${error.message}`);
  }
}

/**
 * 获取Base64数据的会话令牌
 */
async function getBase64FileToken(dataUrl, filename) {
  try {
    console.log('处理Base64图片数据');
    
    const tempFolder = await fs.getTemporaryFolder();
    const fileExtension = getFileExtension(null, filename) || '.png';
    const tempFileName = `temp_b64_${Date.now()}${fileExtension}`;
    const tempFile = await tempFolder.createFile(tempFileName, { overwrite: true });

    // 使用fetch API将data URL转换为ArrayBuffer
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error("Base64数据处理失败");
    }

    const arrayBuffer = await response.arrayBuffer();
    await tempFile.write(arrayBuffer, { format: formats.binary });
    
    console.log('Base64图片处理完成，创建会话令牌');
    return fs.createSessionToken(tempFile);
    
  } catch (error) {
    console.error('获取Base64文件令牌失败:', error);
    throw new Error(`无法处理Base64图片: ${error.message}`);
  }
}

/**
 * 获取Base64图片数据的FileEntry
 */
async function getBase64FileEntry(dataUrl, filename) {
  try {
    console.log('处理Base64图片数据(FileEntry)');
    const tempFolder = await fs.getTemporaryFolder();
    const fileExtension = getFileExtension(null, filename) || '.png';
    const tempFileName = `temp_b64_${Date.now()}${fileExtension}`;
    const tempFile = await tempFolder.createFile(tempFileName, { overwrite: true });

    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error('Base64数据处理失败');
    }
    const arrayBuffer = await response.arrayBuffer();
    await tempFile.write(arrayBuffer, { format: formats.binary });
    return tempFile;
  } catch (error) {
    console.error('获取Base64 FileEntry失败:', error);
    throw new Error(`无法处理Base64图片: ${error.message}`);
  }
}

/**
 * 打开图片文档读取尺寸（px），并关闭该文档
 * 参考：UXP Photoshop API 与社区示例（使用app.open读取尺寸，batchPlay关闭）
 * @returns {{width:number,height:number}}
 */
async function openImageAndGetSize(fileEntry) {
  // 打开图片为临时文档
  const openedDoc = await photoshop.app.open(fileEntry);
  // 获取文档ID
  const docId = openedDoc?.id || photoshop.app.activeDocument?.id;

  // 使用batchPlay获取像素尺寸，避免单位换算问题
  const result = await batchPlay([
    {
      _obj: 'get',
      _target: [{ _ref: 'document', _id: docId }]
    }
  ], { synchronousExecution: true, modalBehavior: 'execute' });

  const desc = result && result[0] ? result[0] : {};
  const width = desc.width && desc.width._value ? desc.width._value : openedDoc.width;
  const height = desc.height && desc.height._value ? desc.height._value : openedDoc.height;

  // 关闭当前活动文档（不保存）
  await batchPlay([
    {
      _obj: 'close',
      saving: { _enum: 'yesNo', _value: 'no' }
    }
  ], { synchronousExecution: true, modalBehavior: 'execute' });

  if (!width || !height) {
    throw new Error('无法识别图片宽高');
  }

  return { width: Number(width), height: Number(height) };
}

/**
 * 新建指定像素尺寸的文档，返回新文档ID
 * 参考：batchPlay make document 社区示例
 */
async function createNewDocument(width, height) {
  const targetWidth = Math.max(1, Math.round(Number(width)) || 1);
  const targetHeight = Math.max(1, Math.round(Number(height)) || 1);
  const beforeCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);
  const uniqueName = `Placed Image ${Date.now()}`;

  // 优先使用 DOM API（更高层，通常会自动激活新文档）
  try {
    console.log('[createNewDocument] 使用 DOM documents.add 新建文档:', targetWidth, 'x', targetHeight);
    const newDoc = await photoshop.app.documents.add({
      width: targetWidth,
      height: targetHeight,
      resolution: 72,
      mode: 'RGBColor',
      fill: 'white',
      name: uniqueName
    });
    const domId = newDoc?.id || photoshop.app.activeDocument?.id;
    if (domId) return domId;
    const afterCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);
    if (afterCount > beforeCount && photoshop.app.activeDocument?.id) {
      return photoshop.app.activeDocument.id;
    }
  } catch (domError) {
    console.warn('[createNewDocument] DOM 新建失败，回退 batchPlay:', domError?.message || domError);
  }

  // 回退使用 batchPlay（与 Alchemist 输出一致，通用）
  console.log('[createNewDocument] 使用 batchPlay 新建文档:', targetWidth, 'x', targetHeight);

  const res = await batchPlay([
    {
      _obj: 'make',
      _target: [{ _ref: 'document' }],
      using: {
        _obj: 'document',
        name: uniqueName,
        width: { _unit: 'pixelsUnit', _value: targetWidth },
        height: { _unit: 'pixelsUnit', _value: targetHeight },
        resolution: 72,
        mode: { _enum: 'mode', _value: 'RGBColor' },
        fill: { _enum: 'fill', _value: 'white' },
        pixelAspectRatio: 1,
        depth: 8
      }
    }
  ], { synchronousExecution: true, modalBehavior: 'execute' });
  console.log('[createNewDocument] batchPlay make 返回:', res);

  // 如果文档数量增加，直接返回当前活动文档ID
  try {
    const afterCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);
    if (afterCount > beforeCount && photoshop.app.activeDocument?.id) {
      return photoshop.app.activeDocument.id;
    }
  } catch {}

  // 尝试通过get查询目标文档ID（更可靠）
  try {
    const getRes = await batchPlay([
      {
        _obj: 'get',
        _target: [{ _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }]
      }
    ], { synchronousExecution: true, modalBehavior: 'execute' });
    const getDesc = getRes && getRes[0] ? getRes[0] : null;
    const byGetId = (getDesc && (getDesc.documentID || getDesc.ID)) || null;
    console.log('[createNewDocument] targetEnum get 返回:', getDesc);
    if (byGetId) return byGetId;
  } catch (e) {
    // 忽略，继续其他兜底
  }

  // 优先从返回结果获取documentID
  const returnedId = res && res[0] && (res[0].documentID || res[0].ID || res[0].target && res[0].target[0] && res[0].target[0]._id);
  if (returnedId) {
    return returnedId;
  }

  // 新建后活动文档即为新文档，加入短暂重试以避免未就绪
  for (let attemptIndex = 0; attemptIndex < 5; attemptIndex += 1) {
    const newDoc = photoshop.app.activeDocument;
    if (newDoc && newDoc.id) {
      return newDoc.id;
    }
    // 等待100ms后重试
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 最后再尝试 DOM API（某些环境更可靠）
  try {
    console.log('[createNewDocument] 回退到 DOM documents.add');
    const newDoc = await photoshop.app.documents.add({
      width: targetWidth,
      height: targetHeight,
      resolution: 72,
      mode: 'RGBColor',
      fill: 'white',
      name: uniqueName
    });
    const domId = newDoc?.id || photoshop.app.activeDocument?.id;
    if (domId) return domId;
    const afterCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);
    if (afterCount > beforeCount && photoshop.app.activeDocument?.id) {
      return photoshop.app.activeDocument.id;
    }
  } catch (domError) {
    console.warn('DOM documents.add 仍失败:', domError?.message || domError);
  }

  throw new Error('新建文档失败');
}

/**
 * 执行Photoshop放置命令
 */
async function executePlaceCommand(token) {
  const placeDescriptor = [
    {
      _obj: "placeEvent",
      null: {
        _path: token,
        _kind: "local"
      },
      freeTransformCenterState: {
        _enum: "quadCenterState",
        _value: "QCSAverage"
      },
      offset: {
        _obj: "offset",
        horizontal: {
          _unit: "pixelsUnit",
          _value: 0
        },
        vertical: {
          _unit: "pixelsUnit", 
          _value: 0
        }
      },
      linked: true // 作为智能对象链接放置
    }
  ];

  return batchPlay(placeDescriptor, {
    synchronousExecution: false,
    modalBehavior: "execute"
  });
}

/**
 * 从URL或文件名获取文件扩展名
 */
function getFileExtension(url, filename) {
  let name = filename;
  if (!name && url) {
    // 从URL中提取文件名
    try {
      const urlObj = new URL(url);
      name = urlObj.pathname.split('/').pop();
    } catch {
      name = url.split('/').pop().split('?')[0];
    }
  }
  
  if (name && name.includes('.')) {
    return name.substring(name.lastIndexOf('.'));
  }
  
  // 默认扩展名
  return '.jpg';
}

/**
 * 检查当前是否可以放置图片
 */
export function canPlaceImage() {
  if (!isUXPEnvironment()) {
    return { canPlace: false, reason: '不在UXP环境中' };
  }
  
  try {
    if (!photoshop.app.activeDocument) {
      return { canPlace: false, reason: '没有活动的Photoshop文档' };
    }
    return { canPlace: true };
  } catch (error) {
    return { canPlace: false, reason: `Photoshop连接错误: ${error.message}` };
  }
}

/**
 * 显示Photoshop警告对话框
 */
export function showPSAlert(message) {
  if (isUXPEnvironment() && photoshop) {
    try {
      photoshop.app.showAlert(message);
    } catch (error) {
      console.error('显示PS警告失败:', error);
    }
  }
} 

/**
 * 导出当前文档为PNG文件到插件的临时文件夹
 * @returns {Promise<File>} 返回代表已导出文件的UXP File对象
 */
export async function exportCanvasAsPng() {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  // 获取当前活动文档
  const activeDoc = photoshop.app.activeDocument;
  if (!activeDoc) {
    throw new Error('没有活动的文档可供导出');
  }

  console.log('开始导出画布为PNG...');

  return core.executeAsModal(
    async (executionContext) => {
      const suspensionID = await executionContext.hostControl.suspendHistory({
        documentID: activeDoc.id,
        name: "导出画布图片",
      });

      try {
        // 1. 获取插件的临时文件夹
        const tempFolder = await fs.getTemporaryFolder();
        console.log('临时文件夹获取成功:', tempFolder.nativePath);
        
        // 2. 创建临时文件（基于Adobe论坛的正确做法）
        const tempFileName = `canvas-export-${Date.now()}.png`;
        const tempFile = await tempFolder.createFile(tempFileName, { 
          overwrite: true 
        });
        console.log('临时文件创建成功:', tempFile.name, '路径:', tempFile.nativePath);

        // 3. 为新创建的文件生成会话令牌（关键步骤）
        const fileToken = await fs.createSessionToken(tempFile);
        console.log('文件会话令牌创建成功');

        // 4. 使用正确的batchPlay保存命令（基于Adobe论坛解决方案）
        console.log('开始执行batchPlay保存命令...');
        
        const descriptor = {
          _obj: "save",
          as: {
            _obj: "PNGFormat",
            compression: 4,    // PNG压缩级别 0-9，4是中等压缩
            interlaced: false  // 不使用交错，减小文件大小
          },
          in: {
            _path: fileToken
          },
          copy: true,
          saveStage: "saveBegin"
        };

        console.log('batchPlay描述符:', JSON.stringify(descriptor, null, 2));

        const result = await batchPlay([descriptor], {
          synchronousExecution: true,
          modalBehavior: "execute"
        });
        
        console.log('batchPlay保存命令执行完成，返回结果:', result);

        // 5. 等待文件系统完成写入操作
        console.log('等待文件系统操作完成...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 6. 验证文件是否成功创建
        try {
          const stats = await tempFile.getMetadata();
          if (stats && stats.size > 0) {
            console.log('✅ 画布导出成功:', tempFile.name, '大小:', stats.size, 'bytes');
            console.log('文件路径:', tempFile.nativePath);
            return tempFile;
          } else {
            console.warn('⚠️ 文件创建成功但大小为0');
            throw new Error('导出的文件为空');
          }
        } catch (error) {
          console.error('❌ 文件验证失败:', error.message);
          
          // 尝试通过父文件夹列表验证文件是否存在
          try {
            const entries = await tempFolder.getEntries();
            const foundFile = entries.find(entry => entry.name === tempFile.name);
            if (foundFile) {
              console.log('🔍 通过文件夹列表找到文件:', foundFile.name);
              return foundFile;
            }
          } catch (listError) {
            console.error('无法列出文件夹内容:', listError.message);
          }
          
          throw new Error(`导出文件验证失败: ${error.message}`);
        }

      } catch (error) {
        console.error('导出画布失败:', error);
        throw error;
      } finally {
        await executionContext.hostControl.resumeHistory(suspensionID);
      }
    },
    { commandName: "导出画布" }
  );
}

/**
 * 读取UXP File对象的内容为ArrayBuffer
 * @param {File} fileEntry - UXP File对象
 * @returns {Promise<ArrayBuffer>}
 */
export async function readImageFile(fileEntry) {
  try {
    console.log('开始读取文件:', fileEntry.name);
    
    // 通过获取元数据来检查文件是否存在和可访问
    const metadata = await fileEntry.getMetadata();
    console.log('文件元数据:', {
      name: fileEntry.name,
      size: metadata?.size,
      dateCreated: metadata?.dateCreated,
      dateModified: metadata?.dateModified
    });
    
    if (!metadata) {
      throw new Error('无法获取文件信息，文件可能不存在');
    }
    
    if (metadata.size === 0) {
      throw new Error('文件大小为0，文件为空');
    }
    
    // 使用read方法并指定格式为二进制
    const buffer = await fileEntry.read({ format: formats.binary });
    console.log('文件读取成功，实际大小:', buffer.byteLength, 'bytes');
    
    if (buffer.byteLength === 0) {
      throw new Error('读取到的文件内容为空');
    }
    
    return buffer;
  } catch (error) {
    console.error('读取文件失败:', error);
    console.error('文件路径:', fileEntry.nativePath || '未知');
    throw new Error(`无法读取图片文件: ${error.message}`);
  }
}

/**
 * 将图片数据上传到指定的服务器URL
 * @param {ArrayBuffer} buffer - 图片的ArrayBuffer数据
 * @param {string} uploadUrl - 服务器接收上传的地址
 * @param {Object} options - 上传选项 {filename?, onProgress?}
 * @returns {Promise<Object>} 服务器响应结果
 */
export async function uploadImageToServer(buffer, uploadUrl, options = {}) {
  if (!buffer) {
    throw new Error('没有图片数据可上传');
  }

  const { filename = 'canvas.png' } = options;

  try {
    console.log('开始上传图片到服务器...', { url: uploadUrl, size: buffer.byteLength });

    // 1. 使用ArrayBuffer创建一个Blob对象，并指定MIME类型
    const imageBlob = new Blob([buffer], { type: "image/png" });

    // 2. 创建FormData来包装我们的文件数据
    const formData = new FormData();
    formData.append('file', imageBlob, filename);

    // 3. 使用fetch发送POST请求
    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      headers: {
        'Authorization': '9da44eff375aa2ca97ae5727b25974ca', // 与UploadToS3组件保持一致
      },
      // 注意：当body是FormData时，不要手动设置'Content-Type' header
      // 浏览器（或UXP环境）会自动设置正确的multipart/form-data类型和boundary
    });

    if (!response.ok) {
      throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
    }

    const result = await response.json(); // 假设服务器返回JSON
    console.log('图片上传成功，服务器响应:', result);
    return result;

  } catch (error) {
    console.error('上传图片失败:', error);
    throw new Error(`上传失败: ${error.message}`);
  }
}

/**
 * 完整的画布导出并上传流程
 * @param {string} uploadUrl - 上传URL
 * @param {Object} options - 选项 {filename?, onProgress?, onStepChange?}
 * @returns {Promise<Object>} 上传结果
 */
export async function exportAndUploadCanvas(uploadUrl, options = {}) {
  const { onStepChange } = options;

  try {
    // 步骤1：导出画布
    if (onStepChange) onStepChange('正在导出画布...');
    const exportedFile = await exportCanvasAsPng();
    if (!exportedFile) {
      throw new Error('画布导出失败');
    }

    // 步骤2：读取图片数据
    if (onStepChange) onStepChange('正在读取文件...');
    
    // 在UXP环境中，给文件系统一点时间确保操作完成
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const imageBuffer = await readImageFile(exportedFile);

    // 步骤3：上传到服务器
    if (onStepChange) onStepChange('正在上传...');
    const result = await uploadImageToServer(imageBuffer, uploadUrl, options);

    if (onStepChange) onStepChange('上传完成');
    return result;

  } catch (error) {
    console.error('导出上传流程失败:', error);
    throw error;
  }
} 