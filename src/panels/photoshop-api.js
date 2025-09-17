// photoshop-api.js - UXP Photoshop 插件图片放置API
/* eslint-disable no-undef */
// 检测是否在UXP环境中
import React, { useRef, useState, useMemo } from 'react'
import { post } from '../utils/http.js'
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
      let fileEntry;
      let fileToken;
      let imageSize;
      let newDocId;
      let suspensionID;

      try {
        // 1) 根据图片类型获取文件实体（FileEntry）
        console.log('[placeImageInPS] 步骤1: 获取图片文件实体');
        if (imageInfo.type === 'local' && imageInfo.path) {
          console.log('[placeImageInPS] 处理本地文件:', imageInfo.path);
          fileEntry = await getLocalFileEntry(imageInfo.path);
        } else if (imageInfo.type === 'remote' && imageInfo.url) {
          console.log('[placeImageInPS] 处理远程文件:', imageInfo.url);
          fileEntry = await getRemoteFileEntry(imageInfo.url, imageInfo.filename);
        } else if (imageInfo.type === 'base64' && imageInfo.data) {
          console.log('[placeImageInPS] 处理Base64数据');
          fileEntry = await getBase64FileEntry(imageInfo.data, imageInfo.filename);
        } else {
          // 默认尝试远程URL
          console.log('[placeImageInPS] 使用默认方式处理:', imageInfo.url || imageInfo.path);
          fileEntry = await getRemoteFileEntry(imageInfo.url || imageInfo.path, imageInfo.filename);
        }

        if (!fileEntry) {
          throw new Error('未能获取到图片文件');
        }
        console.log('[placeImageInPS] 文件实体获取成功:', fileEntry.name);

        // 2) 打开图片以获取尺寸，然后关闭图片文档（不保存）
        console.log('[placeImageInPS] 步骤2: 读取图片尺寸');
        try {
          imageSize = await openImageAndGetSize(fileEntry);
          if (!imageSize || !imageSize.width || !imageSize.height) {
            throw new Error('无法获取图片尺寸');
          }
          console.log('[placeImageInPS] 图片尺寸:', imageSize.width, 'x', imageSize.height);
        } catch (sizeError) {
          console.error('[placeImageInPS] 获取图片尺寸失败:', sizeError?.message);
          throw new Error(`获取图片尺寸失败: ${sizeError?.message}`);
        }

        // 3) 新建与图片尺寸一致的画布
        console.log('[placeImageInPS] 步骤3: 创建新文档');
        try {
          newDocId = await createNewDocument(imageSize.width, imageSize.height);
          console.log('[placeImageInPS] createNewDocument 返回值:', newDocId, '(类型:', typeof newDocId, ')');

          if (!newDocId || (typeof newDocId !== 'number' && typeof newDocId !== 'string')) {
            throw new Error(`新建文档返回的ID无效: ${newDocId} (类型: ${typeof newDocId})`);
          }

          console.log('[placeImageInPS] ✅ 新文档创建成功，验证通过，ID:', newDocId);
        } catch (docError) {
          console.error('[placeImageInPS] ❌ 创建新文档失败:', docError?.message);
          throw new Error(`创建新文档失败: ${docError?.message}`);
        }

        // 4) 激活新文档
        console.log('[placeImageInPS] 步骤4: 激活新文档');
        await activateDocumentById(newDocId);

        // 5) 在新文档上挂起历史
        console.log('[placeImageInPS] 步骤5: 挂起文档历史');
        try {
          suspensionID = await executionContext.hostControl.suspendHistory({
            documentID: newDocId,
            name: "从插件放置图片",
          });
          console.log('[placeImageInPS] 历史挂起成功，ID:', suspensionID);
        } catch (suspendError) {
          console.warn('[placeImageInPS] 挂起历史失败，继续执行:', suspendError?.message);
        }

        let successDocumentId = null;

        try {
          // 6) 再次确保文档激活
          console.log('[placeImageInPS] 步骤6: 确保文档激活并创建文件令牌');
          await activateDocumentById(newDocId);

          // 7) 为文件实体创建会话令牌
          try {
            fileToken = await fs.createSessionToken(fileEntry);
            console.log('[placeImageInPS] 文件会话令牌创建成功');
          } catch (tokenError) {
            console.error('[placeImageInPS] 创建会话令牌失败:', tokenError?.message);
            throw new Error(`创建文件会话令牌失败: ${tokenError?.message}`);
          }

          // 8) 执行图片放置
          console.log('[placeImageInPS] 步骤7: 执行图片放置');
          try {
            await executePlaceCommand(fileToken);
            console.log('[placeImageInPS] ✅ 图片放置成功完成');

            // 记录成功的文档ID
            successDocumentId = newDocId;
            console.log('[placeImageInPS] 记录成功的文档ID:', successDocumentId);
          } catch (placeError) {
            console.error('[placeImageInPS] 图片放置失败:', placeError?.message);
            throw new Error(`图片放置失败: ${placeError?.message}`);
          }

        } finally {
          // 恢复历史状态
          if (suspensionID) {
            try {
              await executionContext.hostControl.resumeHistory(suspensionID);
              console.log('[placeImageInPS] 历史状态已恢复');
            } catch (resumeError) {
              console.warn('[placeImageInPS] 恢复历史状态失败:', resumeError?.message);
            }
          }
        }

        // 在finally块之后返回文档ID
        if (successDocumentId) {
          console.log('[placeImageInPS] 最终返回文档ID:', successDocumentId);
          return successDocumentId;
        } else {
          throw new Error('图片放置过程中未能获取有效的文档ID');
        }

      } catch (error) {
        console.error('[placeImageInPS] ❌ 放置图片过程失败:', error);
        console.error('[placeImageInPS] 错误详情:', {
          message: error?.message,
          stack: error?.stack,
          type: error?.constructor?.name,
          imageInfo: {
            type: imageInfo?.type,
            hasPath: !!imageInfo?.path,
            hasUrl: !!imageInfo?.url,
            hasData: !!imageInfo?.data,
            filename: imageInfo?.filename
          },
          processState: {
            hasFileEntry: !!fileEntry,
            hasFileToken: !!fileToken,
            hasImageSize: !!imageSize,
            hasNewDocId: !!newDocId,
            hasSuspensionID: !!suspensionID
          }
        });

        // 重新抛出错误，保持原始错误信息
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
  console.group('📝 [createNewDocument] 开始创建新PS文档')
  console.log('📐 输入参数:', { width, height })
  // 输入参数验证
  const targetWidth = Math.max(1, Math.round(Number(width)) || 1);
  const targetHeight = Math.max(1, Math.round(Number(height)) || 1);

  if (!targetWidth || !targetHeight || targetWidth < 1 || targetHeight < 1) {
    console.error('❌ 无效的文档尺寸:', { targetWidth, targetHeight })
    console.groupEnd()
    throw new Error(`无效的文档尺寸: ${targetWidth}x${targetHeight}`);
  }

  console.log('✅ 参数验证通过:', { targetWidth, targetHeight });

  const uniqueName = `Placed Image ${Date.now()}`;
  const beforeCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);

  console.log('📊 创建前状态:', {
    uniqueName,
    beforeCount,
    documentsType: typeof photoshop.app.documents
  });

  // 用于收集详细错误信息
  const errors = [];

  // 方法1：使用 batchPlay（最稳定的方法）
  try {
    console.log('[createNewDocument] 尝试方法1: batchPlay 新建文档');

    const result = await batchPlay([
      {
        _obj: 'make',
        _target: [{ _ref: 'document' }],
        using: {
          _obj: 'document',
          name: uniqueName,
          width: { _unit: 'pixelsUnit', _value: targetWidth },
          height: { _unit: 'pixelsUnit', _value: targetHeight },
          resolution: { _unit: 'densityUnit', _value: 72 },
          mode: { _enum: 'mode', _value: 'RGBColor' },
          fill: { _enum: 'fill', _value: 'white' },
          pixelAspectRatio: 1,
          depth: 8
        }
      }
    ], { synchronousExecution: true, modalBehavior: 'execute' });

    console.log('[createNewDocument] batchPlay 执行结果:', result);

    // 等待文档创建完成
    await new Promise(resolve => setTimeout(resolve, 200));

    // 检查是否有新文档创建
    const afterCount = Array.isArray(photoshop.app.documents) ? photoshop.app.documents.length : (photoshop.app.documents?.length || 0);
    console.log('[createNewDocument] 文档数量变化:', beforeCount, '->', afterCount);

    if (afterCount > beforeCount) {
      const activeDoc = photoshop.app.activeDocument;
      if (activeDoc && activeDoc.id) {
        console.log('✅ [方法1-成功] 通过文档数量变化检测到新文档, ID:', activeDoc.id);
        console.groupEnd()
        return activeDoc.id;
      }
    }

    // 尝试从 batchPlay 结果中获取文档ID
    if (result && result[0]) {
      const docId = result[0].documentID || result[0].ID ||
                   (result[0].target && result[0].target[0] && result[0].target[0]._id);
      if (docId) {
        console.log('✅ [方法1-成功] 从batchPlay结果获取文档ID:', docId);
        console.groupEnd()
        return docId;
      }
    }

  } catch (batchPlayError) {
    const errorMsg = `batchPlay 创建失败: ${batchPlayError?.message || batchPlayError}`;
    console.error('[createNewDocument]', errorMsg);
    errors.push(errorMsg);
  }

  // 方法2：使用 DOM API 作为备选方案
  try {
    console.log('[createNewDocument] 尝试方法2: DOM API 新建文档');

    // 使用简化的参数，让Photoshop使用默认值
    const newDoc = await photoshop.app.documents.add({
      width: targetWidth,
      height: targetHeight,
      resolution: 72,
      name: uniqueName
      // 移除 mode 和 fill 参数，使用默认的RGB和白色背景
    });

    if (newDoc && newDoc.id) {
      console.log('✅ [方法2-成功] DOM API 成功创建文档，ID:', newDoc.id);
      console.groupEnd()
      return newDoc.id;
    }

    // 如果返回的文档没有ID，检查当前活动文档
    const activeDoc = photoshop.app.activeDocument;
    if (activeDoc && activeDoc.id) {
      console.log('✅ [方法2-成功] 通过活动文档获取ID:', activeDoc.id);
      console.groupEnd()
      return activeDoc.id;
    }

  } catch (domError) {
    const errorMsg = `DOM API 创建失败: ${domError?.message || domError}`;
    console.error('[createNewDocument]', errorMsg);
    errors.push(errorMsg);
  }

  // 方法3：重试检查活动文档（可能是异步延迟）
  console.log('[createNewDocument] 尝试方法3: 重试检查活动文档');

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const activeDoc = photoshop.app.activeDocument;
      if (activeDoc && activeDoc.id) {
        // 验证这是一个新创建的文档（通过名称或创建时间）
        if (activeDoc.name && (activeDoc.name.includes('Placed Image') || activeDoc.name === 'Untitled-1')) {
          console.log(`✅ [方法3-成功] 重试 ${attempt + 1} 成功获取文档ID:`, activeDoc.id);
          console.groupEnd()
          return activeDoc.id;
        }
      }

      // 等待更长时间后重试
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (retryError) {
      console.warn(`[createNewDocument] 重试 ${attempt + 1} 失败:`, retryError?.message);
    }
  }

  // 所有方法都失败，抛出详细错误
  console.error('❌ [createNewDocument] 所有方法均失败');
  console.error('💥 错误汇总:', errors);
  console.groupEnd()

  const finalError = new Error('新建文档失败 - 所有方法都未成功。错误详情: ' + errors.join('; '));
  throw finalError;
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

// const effectiveApplyCode = useMemo(() => getFromQuery('applyCode') || getFromLocal('applyCode') || getFromGlobal('applyCode'), [applyCode])
// const effectiveUserId = useMemo(() => getFromQuery('userId') || getFromLocal('userId') || getFromGlobal('userId'), [userId])
// const effectiveUserCode = useMemo(() => getFromQuery('userCode') || getFromLocal('userCode') || getFromGlobal('userCode'), [userCode])

/**
 * 将图片数据上传到指定的服务器URL
 * @param {ArrayBuffer} buffer - 图片的ArrayBuffer数据
 * @param {Object} options - 上传选项 {filename?, onProgress?}
 * @returns {Promise<Object>} 服务器响应结果
 */
export async function uploadImageToServer(buffer, options = {}, applyCode, userId, userCode) {
  if (!buffer) {
    throw new Error('没有图片数据可上传');
  }

  const { filename = 'canvas.png' } = options;

  try {
    
    // 1. 验证buffer大小
    if (buffer.byteLength === 0) {
      throw new Error('图片数据为空');
    }
    
    // 2. 使用ArrayBuffer创建一个Blob对象，并指定MIME类型
    // 注意：UXP环境中File构造函数不可用，使用Blob代替
    const imageBlob = new Blob([buffer], { type: "image/png" });
    console.log('图片数据大小:', buffer.byteLength, 'bytes, Blob大小:', imageBlob.size, 'bytes')
    console.log('filename-------------------', filename)
    
    // 3. 验证Blob创建是否成功
    if (imageBlob.size === 0) {
      throw new Error('Blob创建失败，大小为0');
    }
    
    // 4. 创建FormData来包装我们的文件数据
    const formData = new FormData();
    formData.append('File', imageBlob, filename);
    formData.append('applyCode', applyCode)
    formData.append('userId', userId)
    formData.append('userCode', userCode)
    
    console.log('formData----------', formData)
    // 3. 使用fetch发送POST请求
    const response = await post('/api/publish/upload_product_image_new', formData, { timeout: 300000 })
    console.log('response----------', response)

    if (response.statusCode !== 200) {
      throw new Error(`服务器错误: ${response.statusCode} ${response.statusText}`);
    }

    return response.dataClass;

  } catch (error) {
    console.error('上传图片失败:', error);
    throw new Error(`上传失败: ${error.message}`);
  }
}

/**
 * 完整的画布导出并上传流程
 * @param {Object} options - 选项 {filename?, onProgress?, onStepChange?}
 * @returns {Promise<Object>} 上传结果
 */
export async function exportAndUploadCanvas(options = {}, applyCode, userId, userCode) {
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
    const url = await uploadImageToServer(imageBuffer, options, applyCode, userId, userCode);

    console.log('url----------', url)

    if (onStepChange) onStepChange('上传完成');
    return url;

  } catch (error) {
    console.error('导出上传流程失败:', error);
    throw error;
  }
}

/**
 * 获取所有打开的PS文档列表
 * @returns {Promise<Array>} 文档列表，每个文档包含 {id, name, width, height}
 */
export async function getOpenDocuments() {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  try {
    const documents = photoshop.app.documents;
    if (!documents || documents.length === 0) {
      console.log('没有打开的PS文档');
      return [];
    }

    console.log(`找到 ${documents.length} 个打开的文档`);

    // 构建文档信息列表
    const docList = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      if (doc && doc.id) {
        docList.push({
          id: doc.id,
          name: doc.name || `文档${i + 1}`,
          width: doc.width || 0,
          height: doc.height || 0
        });
      }
    }

    console.log('文档列表:', docList);
    return docList;
  } catch (error) {
    console.error('获取打开文档列表失败:', error);
    throw new Error(`获取文档列表失败: ${error.message}`);
  }
}

/**
 * 导出指定文档ID的画布并上传
 * @param {number} documentId - 要导出的文档ID
 * @param {Object} options - 导出选项 {filename?, onStepChange?}
 * @param {string} applyCode - 应用代码
 * @param {string} userId - 用户ID
 * @param {string} userCode - 用户代码
 * @returns {Promise<string>} 上传后的图片URL
 */
export async function exportDocumentById(documentId, options = {}, applyCode, userId, userCode) {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  const { onStepChange } = options;

  console.log(`开始导出文档ID ${documentId} 的画布`);

  return core.executeAsModal(
    async (executionContext) => {
      try {
        // 步骤1：激活目标文档
        if (onStepChange) onStepChange(`正在激活文档...`);
        await activateDocumentById(documentId);

        // 验证文档是否被正确激活
        const activeDoc = photoshop.app.activeDocument;
        if (!activeDoc || activeDoc.id !== documentId) {
          throw new Error(`无法激活文档ID ${documentId}`);
        }

        console.log(`成功激活文档: ${activeDoc.name}`);

        // 步骤2：导出当前活动文档的画布
        if (onStepChange) onStepChange('正在导出画布...');
        const exportedFile = await exportCanvasAsPng();
        if (!exportedFile) {
          throw new Error('画布导出失败');
        }

        // 步骤3：读取图片数据
        if (onStepChange) onStepChange('正在读取文件...');

        // 给文件系统一点时间确保操作完成
        await new Promise(resolve => setTimeout(resolve, 200));

        const imageBuffer = await readImageFile(exportedFile);

        // 步骤4：上传到服务器
        if (onStepChange) onStepChange('正在上传...');
        const url = await uploadImageToServer(imageBuffer, options, applyCode, userId, userCode);

        console.log(`文档ID ${documentId} 导出上传成功:`, url);

        if (onStepChange) onStepChange('上传完成');
        return url;

      } catch (error) {
        console.error(`导出文档ID ${documentId} 失败:`, error);
        throw error;
      }
    },
    { commandName: `导出文档${documentId}` }
  );
}