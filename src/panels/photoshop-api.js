// photoshop-api.js - UXP Photoshop 插件图片放置API
/* eslint-disable no-undef */
// 检测是否在UXP环境中
import React, { useRef, useState, useMemo } from 'react'
import { post } from '../utils/http.js'
import { localImageManager } from '../utils/LocalImageManager.js'
const isUXPEnvironment = () => {
  try {
    return typeof require !== 'undefined' && require('photoshop') && require('uxp');
  } catch {
    return false;
  }
};

// 仅在UXP环境中加载Photoshop API
let photoshop, core, batchPlay, fs, formats, action;

if (isUXPEnvironment()) {
  try {
    photoshop = require('photoshop');
    core = photoshop.core;
    batchPlay = photoshop.action.batchPlay;
    action = photoshop.action;
    fs = require('uxp').storage.localFileSystem;
    formats = require('uxp').storage.formats;
  } catch (error) {
    console.warn('无法加载UXP模块:', error);
  }
}

// 全局状态管理：文档ID与图片项的映射关系
const documentImageMap = new Map(); // documentId -> { imageId, imageUrl, timestamp }
let eventListenerRegistered = false;
let syncCallbacks = []; // 存储同步回调函数

/**
 * 将图片放置到Photoshop文档中
 * @param {object} imageInfo - 包含图片信息的对象 { type, path?, url?, data?, filename?, imageId? }
 * @param {object} options - 选项参数 { directOpen?: boolean }
 */
export async function placeImageInPS(imageInfo, options = {}) {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  const { directOpen = false } = options;

  console.log('开始放置图片到Photoshop:', imageInfo);
  console.log(`[placeImageInPS] 使用模式: ${directOpen ? '直接打开' : '创建画布+放置'}`);

  // 使用executeAsModal确保操作的原子性和稳定性
  return core.executeAsModal(
    async (executionContext) => {
      let fileEntry;
      let fileToken;
      let imageSize;
      let newDocId;
      let suspensionID;

      try {
        // 1) 智能获取图片文件实体（本地优先策略）
        console.log('[placeImageInPS] 步骤1: 智能获取图片文件实体');
        fileEntry = await getImageFileEntry(imageInfo);

        if (!fileEntry) {
          throw new Error('未能获取到图片文件');
        }
        console.log('[placeImageInPS] 文件实体获取成功:', fileEntry.name);

        // 检查是否使用直接打开模式
        if (directOpen) {
          console.log('🚀 [placeImageInPS] 使用直接打开模式，跳过画布创建和图片放置步骤');

          try {
            // 直接打开图片文件
            newDocId = await openImageDirectly(fileEntry);

            console.log(`✅ [placeImageInPS] 直接打开成功，文档ID: ${newDocId}`);

            // 注册文档与图片的映射关系，支持反向同步
            if (imageInfo.imageId) {
              const imageUrl = imageInfo.url || imageInfo.path || 'direct_open';
              const registered = registerDocumentImageMapping(newDocId, imageInfo.imageId, imageUrl);
              if (registered) {
                console.log(`✅ [placeImageInPS] 已注册直接打开模式的反向同步映射: 文档${newDocId} <-> 图片${imageInfo.imageId}`);
              }

              // 设置图片状态为编辑中
              try {
                await localImageManager.setImageStatus(imageInfo.imageId, 'editing');
                console.log(`🔄 [placeImageInPS] 图片状态已设为编辑中: ${imageInfo.imageId}`);
              } catch (statusError) {
                console.warn(`⚠️ [placeImageInPS] 设置图片状态失败:`, statusError);
              }
            }

            return newDocId;

          } catch (directOpenError) {
            console.error('[placeImageInPS] 直接打开模式失败:', directOpenError);
            console.log('🔄 [placeImageInPS] 直接打开失败，将回退到创建画布+放置模式');

            // 如果直接打开失败，回退到传统的创建画布+放置模式
            console.log('⚠️ [placeImageInPS] 启用错误恢复：使用传统放置模式作为备选方案');
            // 清除directOpen标志，让后续逻辑继续执行传统模式
            // 不要return或throw，让代码继续执行到传统的放置逻辑
          }
        }

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

          // 注册文档与图片的映射关系，支持反向同步
          console.log('[placeImageInPS] 检查反向同步映射注册条件:', {
            hasImageId: !!imageInfo.imageId,
            imageId: imageInfo.imageId,
            documentId: successDocumentId,
            imageUrl: imageInfo.url || imageInfo.path
          });

          if (imageInfo.imageId) {
            const imageUrl = imageInfo.url || imageInfo.path || 'unknown';
            const registered = registerDocumentImageMapping(
              successDocumentId,
              imageInfo.imageId,
              imageUrl
            );
            if (registered) {
              console.log(`✅ [placeImageInPS] 已注册反向同步映射: 文档${successDocumentId} <-> 图片${imageInfo.imageId}`);

              // 验证映射是否真的被添加
              const currentMappings = getDocumentImageMappings();
              console.log('[placeImageInPS] 当前映射表状态:', {
                总数: currentMappings.size,
                包含当前文档: currentMappings.has(successDocumentId),
                当前文档映射: currentMappings.get(successDocumentId)
              });

              // 设置图片状态为编辑中
              try {
                await localImageManager.setImageStatus(imageInfo.imageId, 'editing');
                console.log(`🔄 [placeImageInPS] 图片状态已设为编辑中: ${imageInfo.imageId}`);
              } catch (statusError) {
                console.warn(`⚠️ [placeImageInPS] 设置图片状态失败:`, statusError);
              }
            } else {
              console.error('❌ [placeImageInPS] 映射注册失败！');
            }
          } else {
            console.warn('⚠️ [placeImageInPS] 未提供imageId，跳过反向同步映射注册');
          }

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
 * 直接打开图片文件并保持打开状态
 * 与openImageAndGetSize不同，这个函数不会关闭打开的文档
 * @param {File} fileEntry - 图片文件实体
 * @returns {Promise<number>} 打开的文档ID
 */
async function openImageDirectly(fileEntry) {
  console.log('[openImageDirectly] 开始直接打开图片文件:', fileEntry.name);

  // 直接打开图片文件
  const openedDoc = await photoshop.app.open(fileEntry);

  // 获取文档ID - 优先使用返回的文档对象，备选当前活动文档
  const docId = openedDoc?.id || photoshop.app.activeDocument?.id;

  if (!docId) {
    throw new Error('无法获取打开文档的ID');
  }

  console.log(`✅ [openImageDirectly] 图片文件直接打开成功: ${fileEntry.name}, 文档ID: ${docId}`);
  console.log(`📊 [openImageDirectly] 文档信息: 名称=${openedDoc?.name}, 宽度=${openedDoc?.width}, 高度=${openedDoc?.height}`);

  return docId;
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
        return await exportCanvasPngInternal();
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
 * 导出画布的内部实现（不包含executeAsModal包装）
 * 注意：此函数假设已经在executeAsModal上下文中被调用
 * @returns {Promise<File>} 返回代表已导出文件的UXP File对象
 */
async function exportCanvasPngInternal() {
  console.log('[exportCanvasPngInternal] 开始内部PNG导出逻辑');

  // 1. 获取插件的临时文件夹
  const tempFolder = await fs.getTemporaryFolder();
  console.log('[exportCanvasPngInternal] 临时文件夹获取成功:', tempFolder.nativePath);

  // 2. 创建临时文件（基于Adobe论坛的正确做法）
  const tempFileName = `canvas-export-${Date.now()}.png`;
  const tempFile = await tempFolder.createFile(tempFileName, {
    overwrite: true
  });
  console.log('[exportCanvasPngInternal] 临时文件创建成功:', tempFile.name, '路径:', tempFile.nativePath);

  // 3. 为新创建的文件生成会话令牌（关键步骤）
  const fileToken = await fs.createSessionToken(tempFile);
  console.log('[exportCanvasPngInternal] 文件会话令牌创建成功');

  // 4. 使用正确的batchPlay保存命令（基于Adobe论坛解决方案）
  console.log('[exportCanvasPngInternal] 开始执行batchPlay保存命令...');

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

  console.log('[exportCanvasPngInternal] batchPlay描述符:', JSON.stringify(descriptor, null, 2));

  const result = await batchPlay([descriptor], {
    synchronousExecution: true,
    modalBehavior: "execute"
  });

  console.log('[exportCanvasPngInternal] batchPlay保存命令执行完成，返回结果:', result);

  // 5. 等待文件系统完成写入操作
  console.log('[exportCanvasPngInternal] 等待文件系统操作完成...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 6. 验证文件是否成功创建
  try {
    const stats = await tempFile.getMetadata();
    if (stats && stats.size > 0) {
      console.log('✅ [exportCanvasPngInternal] 画布导出成功:', tempFile.name, '大小:', stats.size, 'bytes');
      console.log('[exportCanvasPngInternal] 文件路径:', tempFile.nativePath);
      return tempFile;
    } else {
      console.warn('⚠️ [exportCanvasPngInternal] 文件创建成功但大小为0');
      throw new Error('导出的文件为空');
    }
  } catch (error) {
    console.error('❌ [exportCanvasPngInternal] 文件验证失败:', error.message);

    // 尝试通过父文件夹列表验证文件是否存在
    try {
      const entries = await tempFolder.getEntries();
      const foundFile = entries.find(entry => entry.name === tempFile.name);
      if (foundFile) {
        console.log('🔍 [exportCanvasPngInternal] 通过文件夹列表找到文件:', foundFile.name);
        return foundFile;
      }
    } catch (listError) {
      console.error('[exportCanvasPngInternal] 无法列出文件夹内容:', listError.message);
    }

    throw new Error(`导出文件验证失败: ${error.message}`);
  }
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

/**
 * 注册PS事件监听器，监听保存等事件以实现反向同步
 * @param {function} onSyncCallback - 同步回调函数，接收 (documentId, imageInfo) 参数
 */
export function registerPSEventListeners(onSyncCallback) {
  // 检查是否在UXP环境中
  if (!isUXPEnvironment() || !action) {
    console.warn('PS事件监听器注册失败: 不在UXP环境中或action API不可用');
    return false;
  }

  // 避免重复注册
  if (eventListenerRegistered) {
    console.log('PS事件监听器已经注册过了');
    if (onSyncCallback && typeof onSyncCallback === 'function') {
      syncCallbacks.push(onSyncCallback);
    }
    return true;
  }

  try {
    console.log('正在注册PS事件监听器...');

    // 注册保存事件监听器
    action.addNotificationListener([
      { event: "save" },      // 监听保存事件
      { event: "saveAs" },    // 监听另存为事件
      { event: "close" }      // 监听文档关闭事件（用于自动完成标记）
    ], handlePSEvent);

    eventListenerRegistered = true;

    // 添加回调函数
    if (onSyncCallback && typeof onSyncCallback === 'function') {
      syncCallbacks.push(onSyncCallback);
    }

    console.log('✅ PS事件监听器注册成功');
    return true;

  } catch (error) {
    console.error('PS事件监听器注册失败:', error);
    return false;
  }
}

/**
 * 移除PS事件监听器
 */
export function unregisterPSEventListeners() {
  if (!isUXPEnvironment() || !action || !eventListenerRegistered) {
    return;
  }

  try {
    // 移除事件监听器
    action.removeNotificationListener([
      { event: "save" },
      { event: "saveAs" },
      { event: "close" }
    ], handlePSEvent);

    eventListenerRegistered = false;
    syncCallbacks = [];

    console.log('✅ PS事件监听器已移除');
  } catch (error) {
    console.error('移除PS事件监听器失败:', error);
  }
}

/**
 * 处理PS事件的核心函数
 * @param {string} eventName - 事件名称
 * @param {object} descriptor - 事件描述符
 */
async function handlePSEvent(eventName, descriptor) {
  try {
    console.log(`🔔 [PS事件] 接收到事件: ${eventName}`);
    console.log(`📋 [PS事件] 事件描述符:`, JSON.stringify(descriptor, null, 2));
    console.log(`📋 [PS事件] 描述符键值:`, Object.keys(descriptor || {}));

    switch (eventName) {
      case 'save':
      case 'saveAs':
        console.log(`💾 [PS事件] 处理保存事件: ${eventName}`);
        await handleDocumentSaveEvent(descriptor);
        break;
      case 'close':
        console.log(`🔒 [PS事件] 处理关闭事件: ${eventName}`);
        await handleDocumentCloseEvent(descriptor);
        break;
      default:
        console.log(`⚠️ [PS事件] 未处理的事件类型: ${eventName}`);
    }
  } catch (error) {
    console.error(`处理PS事件 ${eventName} 时发生错误:`, error);
  }
}

/**
 * 处理文档保存事件 - 简化版本，只通知文件已保存
 * @param {object} descriptor - 事件描述符
 */
async function handleDocumentSaveEvent(descriptor) {
  try {
    // 获取当前活动文档
    if (!photoshop.app.activeDocument) {
      console.log('没有活动文档，跳过保存事件处理');
      return;
    }

    const activeDoc = photoshop.app.activeDocument;
    const documentId = activeDoc.id;

    console.log(`[保存事件] 文档ID: ${documentId}, 文档名称: ${activeDoc.name}`);

    // 检查是否是我们跟踪的文档
    let imageInfo = documentImageMap.get(documentId);
    let isTemporaryMapping = false;

    if (!imageInfo) {
      console.log(`❌ [保存事件] 文档ID ${documentId} 不在映射表中，尝试文件名匹配...`);

      // 尝试通过文件名匹配Todo组件中的图片
      const documentName = activeDoc.name;
      console.log(`🔍 [文件名匹配] 检查PS文档: ${documentName}`);

      // 确保本地图片管理器已初始化
      await localImageManager.initialize();

      const matchedImageId = localImageManager.findImageIdByFilename(documentName);

      if (matchedImageId) {
        console.log(`✅ [文件名匹配] 找到对应图片: ${documentName} -> ${matchedImageId}`);

        // 创建临时映射信息
        imageInfo = {
          imageId: matchedImageId,
          imageUrl: `filename_match_${documentName}`,
          timestamp: Date.now(),
          lastSyncTime: null,
          isTemporary: true
        };

        isTemporaryMapping = true;
        console.log(`🔗 [文件名匹配] 创建临时映射:`, imageInfo);
      } else {
        console.log(`❌ [文件名匹配] 未找到匹配图片: ${documentName}`);
        return;
      }
    }

    // 防止重复通知（避免过于频繁的保存操作）
    const now = Date.now();
    const timeSinceLastNotify = imageInfo.lastSyncTime ? (now - imageInfo.lastSyncTime) : Infinity;
    const MIN_NOTIFY_INTERVAL = 1000; // 1秒最小间隔

    if (timeSinceLastNotify < MIN_NOTIFY_INTERVAL) {
      console.log(`[PS保存通知] 距离上次通知仅${timeSinceLastNotify}ms，跳过以避免频繁通知`);
      return;
    }

    // 更新最后通知时间
    imageInfo.lastSyncTime = now;

    console.log(`📄 [PS保存通知] 文档 ${documentId} 对应图片 ${imageInfo.imageId} 已保存到本地文件`);

    // 简单通知回调函数：PS已保存文件
    for (const callback of syncCallbacks) {
      try {
        await callback({
          type: 'ps_file_saved',
          documentId: documentId,
          imageId: imageInfo.imageId,
          imageUrl: imageInfo.imageUrl,
          documentName: activeDoc.name,
          timestamp: now,
          isTemporaryMapping: isTemporaryMapping
        });
      } catch (callbackError) {
        console.error('PS保存通知回调执行失败:', callbackError);
      }
    }

    console.log(`✅ [PS保存通知] 已通知 ${syncCallbacks.length} 个监听器`);

  } catch (error) {
    console.error('处理文档保存事件失败:', error);

    // 错误恢复：尝试重新获取文档状态
    try {
      if (photoshop.app.activeDocument) {
        const currentDoc = photoshop.app.activeDocument;
        console.log(`[错误恢复] 当前文档状态: ID=${currentDoc.id}, 名称=${currentDoc.name}`);
      }
    } catch (recoveryError) {
      console.error('错误恢复尝试失败:', recoveryError);
    }
  }
}

/**
 * 处理文档关闭事件，检查文件修改并标记完成状态
 * @param {object} descriptor - 事件描述符
 */
async function handleDocumentCloseEvent(descriptor) {
  try {
    console.log(`🔵 [关闭事件] 收到文档关闭事件`, descriptor);

    // 从描述符中获取文档ID - 尝试多种可能的字段
    const documentId = descriptor?.documentID ||
                      descriptor?.ID ||
                      descriptor?.target?.documentID ||
                      descriptor?.target?.ID ||
                      descriptor?.document?.documentID;

    if (!documentId) {
      console.log(`❌ [关闭事件] 无法获取文档ID，descriptor:`, descriptor);
      return;
    }

    console.log(`🎯 [关闭事件] 处理文档关闭，ID: ${documentId}`);

    // 检查是否是我们跟踪的文档
    let imageInfo = documentImageMap.get(documentId);
    let isTemporaryMapping = false;

    if (!imageInfo) {
      console.log(`⚠️ [关闭事件] 文档ID ${documentId} 不在映射表中`);
      console.log(`📋 [关闭事件] 当前映射表内容:`, Array.from(documentImageMap.entries()));

      // 尝试通过活动文档获取信息（文档可能还没完全关闭）
      try {
        if (photoshop && photoshop.app) {
          let documentName = null;

          // 尝试从活动文档获取
          try {
            const activeDoc = photoshop.app.activeDocument;
            if (activeDoc && activeDoc.id === documentId) {
              documentName = activeDoc.name;
              console.log(`🔍 [关闭事件] 从活动文档获取名称: ${documentName}`);
            }
          } catch (activeDocError) {
            console.log(`ℹ️ [关闭事件] 无法访问活动文档，可能已关闭`);
          }

          // 如果活动文档获取失败，尝试从documents集合获取
          if (!documentName && photoshop.app.documents) {
            try {
              const docs = photoshop.app.documents;
              for (let i = 0; i < docs.length; i++) {
                if (docs[i] && docs[i].id === documentId) {
                  documentName = docs[i].name;
                  console.log(`🔍 [关闭事件] 从文档集合获取名称: ${documentName}`);
                  break;
                }
              }
            } catch (docsError) {
              console.log(`ℹ️ [关闭事件] 无法访问文档集合:`, docsError.message);
            }
          }

          if (documentName) {
            console.log(`📁 [关闭事件] 找到文档名称: ${documentName}`);

            // 确保本地图片管理器已初始化
            await localImageManager.initialize();

            const matchedImageId = await localImageManager.findImageIdByFilename(documentName);

            if (matchedImageId) {
              console.log(`✅ [关闭事件] 通过文件名匹配到图片: ${documentName} -> ${matchedImageId}`);

              // 创建临时映射信息
              imageInfo = {
                imageId: matchedImageId,
                imageUrl: matchedImageId, // 使用imageId作为url
                timestamp: Date.now(),
                lastSyncTime: null,
                isTemporary: true
              };

              isTemporaryMapping = true;
            } else {
              console.log(`❌ [关闭事件] 文件名匹配失败: ${documentName}`);
            }
          } else {
            console.log(`❌ [关闭事件] 无法获取文档名称`);
          }
        }
      } catch (nameMatchError) {
        console.warn(`⚠️ [关闭事件] 文件名匹配过程失败:`, nameMatchError.message);
      }
    } else {
      console.log(`✅ [关闭事件] 在映射表中找到图片信息:`, imageInfo);
    }

    if (imageInfo) {
      console.log(`🎯 [关闭事件] 开始处理图片关闭: ${imageInfo.imageId}`);

      // 检查文件是否被修改过
      const wasModified = await localImageManager.checkFileModification(imageInfo.imageId);
      console.log(`📊 [关闭事件] 文件修改检查结果: ${wasModified}`);

      if (wasModified) {
        console.log(`🎉 [关闭事件] 检测到文件修改，标记为已完成: ${imageInfo.imageId}`);

        // 标记图片为已完成状态
        const markResult = await localImageManager.setImageStatus(imageInfo.imageId, 'completed');
        console.log(`💾 [关闭事件] 标记完成结果: ${markResult}`);

        // 通知回调函数：文档关闭且图片已完成
        for (const callback of syncCallbacks) {
          try {
            await callback({
              type: 'ps_document_closed_completed',
              documentId: documentId,
              imageId: imageInfo.imageId,
              imageUrl: imageInfo.imageUrl,
              timestamp: Date.now(),
              isTemporaryMapping: isTemporaryMapping,
              wasModified: true
            });
            console.log(`✅ [关闭事件] 成功通知完成事件回调函数`);
          } catch (callbackError) {
            console.error('❌ [关闭事件] 完成事件回调执行失败:', callbackError);
          }
        }

        console.log(`🎯 [关闭事件] 图片 ${imageInfo.imageId} 已标记为完成状态`);
      } else {
        console.log(`ℹ️ [关闭事件] 图片未修改，保持编辑中状态: ${imageInfo.imageId}`);

        // 确保图片状态为编辑中（已经打开过但未修改）
        await localImageManager.setImageStatus(imageInfo.imageId, 'editing');

        // 通知回调函数：文档关闭但图片未修改
        for (const callback of syncCallbacks) {
          try {
            await callback({
              type: 'ps_document_closed_no_change',
              documentId: documentId,
              imageId: imageInfo.imageId,
              imageUrl: imageInfo.imageUrl,
              timestamp: Date.now(),
              isTemporaryMapping: isTemporaryMapping,
              wasModified: false
            });
            console.log(`ℹ️ [关闭事件] 已通知无修改事件`);
          } catch (callbackError) {
            console.error('❌ [关闭事件] 无修改事件回调失败:', callbackError);
          }
        }
      }

      // 清理映射关系（无论是否修改都清理）
      if (documentImageMap.has(documentId)) {
        documentImageMap.delete(documentId);
        console.log(`🧹 [关闭事件] 清理文档ID ${documentId} 的映射关系`);
      }
    } else {
      console.log(`⚠️ [关闭事件] 文档ID ${documentId} 未找到对应图片信息，仅清理映射`);

      // 仅清理映射关系
      if (documentImageMap.has(documentId)) {
        documentImageMap.delete(documentId);
        console.log(`🧹 [关闭事件] 清理文档ID ${documentId} 的映射关系`);
      }
    }

  } catch (error) {
    console.error('❌ [关闭事件] 处理文档关闭事件失败:', error);

    // 即使出错也要尝试清理映射关系
    try {
      const documentId = descriptor?.documentID ||
                        descriptor?.ID ||
                        descriptor?.target?.documentID ||
                        descriptor?.target?.ID ||
                        descriptor?.document?.documentID;
      if (documentId && documentImageMap.has(documentId)) {
        documentImageMap.delete(documentId);
        console.log(`🧹 [关闭事件-错误恢复] 清理文档ID ${documentId} 的映射关系`);
      }
    } catch (cleanupError) {
      console.error('❌ [关闭事件] 错误恢复清理失败:', cleanupError);
    }
  }
}

/**
 * 执行反向同步：将PS文档内容同步回插件和本地存储
 * @param {number} documentId - PS文档ID
 * @param {object} imageInfo - 图片信息
 */
async function performReverseSync(documentId, imageInfo) {
  try {
    console.log(`[反向同步] 开始同步文档 ${documentId}`);

    // 导出当前文档的内容 - 注意：需要在executeAsModal上下文中调用
    const exportedFile = await exportDocumentByIdInternal(documentId);
    if (!exportedFile) {
      throw new Error('导出文档失败');
    }

    // 读取导出的图片数据
    const imageBuffer = await readImageFile(exportedFile);

    // 更新本地图片管理器
    await updateLocalImageFromPS(imageInfo.imageId, exportedFile, imageBuffer);

    // 检查图片现在是否在本地管理器中可用（可能是新创建的临时缓存）
    const hasLocalImage = localImageManager.hasLocalImage(imageInfo.imageId);
    const localDisplayUrl = hasLocalImage ?
      await localImageManager.getLocalImageDisplayUrl(imageInfo.imageId) : null;

    // 创建同步结果
    const syncResult = {
      documentId: documentId,
      imageId: imageInfo.imageId,
      originalUrl: imageInfo.imageUrl,
      exportedFile: exportedFile,
      imageBuffer: imageBuffer,
      timestamp: Date.now(),
      localUpdateSuccess: true,
      hasLocalImage: hasLocalImage,
      localDisplayUrl: localDisplayUrl,
      shouldRefreshUI: true  // 明确告知UI需要刷新
    };

    // 通知所有注册的回调函数
    console.log(`[反向同步] 通知 ${syncCallbacks.length} 个回调函数`);
    for (const callback of syncCallbacks) {
      try {
        await callback(syncResult);
      } catch (callbackError) {
        console.error('同步回调函数执行失败:', callbackError);
      }
    }

    // 更新映射表的时间戳
    imageInfo.lastSyncTime = Date.now();

    console.log(`✅ [反向同步] 文档 ${documentId} 同步完成`);

  } catch (error) {
    console.error(`[反向同步] 同步文档 ${documentId} 失败:`, error);
    throw error;
  }
}

/**
 * 更新本地图片管理器中的图片（从PS导出）
 * @param {string} imageId - 图片ID
 * @param {File} exportedFile - PS导出的文件
 * @param {ArrayBuffer} imageBuffer - 图片数据
 */
async function updateLocalImageFromPS(imageId, exportedFile, imageBuffer) {
  try {
    console.log(`[本地更新] 开始更新本地图片 ${imageId}`);

    // 初始化本地图片管理器
    await localImageManager.initialize();

    // 检查图片是否存在于本地管理器中
    if (localImageManager.hasLocalImage(imageId)) {
      // 标记图片为已修改，并保存修改后的文件
      await localImageManager.markImageAsModified(imageId, exportedFile);
      console.log(`✅ [本地更新] 图片 ${imageId} 已标记为已修改`);
    } else {
      console.log(`🔄 [本地更新] 图片 ${imageId} 不在本地管理器中，尝试创建临时显示缓存`);

      // 为直接打开的图片创建临时缓存，以便在插件UI中显示更新后的内容
      try {
        // 将导出的文件复制到本地图片目录作为临时缓存
        const imageFolder = localImageManager.imageFolder;
        if (imageFolder) {
          // 创建临时文件名（使用时间戳避免冲突）
          const tempFilename = `temp_${imageId}_${Date.now()}.png`;
          const tempFile = await imageFolder.createFile(tempFilename, { overwrite: true });

          // 复制导出文件的内容
          const arrayBuffer = await exportedFile.read({ format: require('uxp').storage.formats.binary });
          await tempFile.write(arrayBuffer, { format: require('uxp').storage.formats.binary });

          // 在索引中添加临时记录
          localImageManager.addTemporaryImage(imageId, {
            localPath: tempFilename,
            url: `temp_sync_${imageId}`,
            applyCode: 'temp_sync',
            timestamp: Date.now(),
            status: 'synced_temp',  // 标记为临时同步状态
            fileSize: arrayBuffer.byteLength
          });

          // 保存索引更新
          await localImageManager.saveIndexData();

          console.log(`✅ [本地更新] 为图片 ${imageId} 创建了临时显示缓存: ${tempFilename}`);
        }
      } catch (tempError) {
        console.warn(`⚠️ [本地更新] 创建临时缓存失败:`, tempError.message);
        // 即使创建临时缓存失败，也不影响反向同步的其他功能
      }
    }

  } catch (error) {
    console.error(`❌ [本地更新] 更新本地图片 ${imageId} 失败:`, error);
    // 不抛出错误，避免影响反向同步的其他流程
  }
}

/**
 * 内部版本的文档导出函数（不嵌套executeAsModal）
 * 注意：此函数假设已经在executeAsModal上下文中被调用
 * @param {number} documentId - 文档ID
 * @returns {Promise<File>} 导出的文件
 */
async function exportDocumentByIdInternal(documentId) {
  if (!isUXPEnvironment()) {
    throw new Error('此功能仅在UXP环境中可用');
  }

  console.log(`[exportDocumentByIdInternal] 开始导出文档ID ${documentId}，不嵌套executeAsModal`);

  try {
    // 激活目标文档
    await activateDocumentById(documentId);

    // 验证文档是否被正确激活
    const activeDoc = photoshop.app.activeDocument;
    if (!activeDoc || activeDoc.id !== documentId) {
      throw new Error(`无法激活文档ID ${documentId}`);
    }

    console.log(`[exportDocumentByIdInternal] 文档激活成功: ${activeDoc.name}`);

    // 直接调用导出PNG的内部逻辑，避免嵌套executeAsModal
    return await exportCanvasPngInternal();

  } catch (error) {
    console.error(`[exportDocumentByIdInternal] 导出文档ID ${documentId} 失败:`, error);
    throw error;
  }
}

/**
 * 注册文档与图片的映射关系
 * @param {number} documentId - PS文档ID
 * @param {string} imageId - 图片唯一标识
 * @param {string} imageUrl - 图片URL
 */
export function registerDocumentImageMapping(documentId, imageId, imageUrl) {
  if (!documentId) {
    console.warn('无法注册映射: documentId 为空');
    return false;
  }

  const mappingInfo = {
    imageId: imageId,
    imageUrl: imageUrl,
    timestamp: Date.now(),
    lastSyncTime: null
  };

  documentImageMap.set(documentId, mappingInfo);
  console.log(`✅ 注册映射关系: 文档ID ${documentId} <-> 图片ID ${imageId}`);

  return true;
}

/**
 * 移除文档与图片的映射关系
 * @param {number} documentId - PS文档ID
 */
export function removeDocumentImageMapping(documentId) {
  if (documentImageMap.has(documentId)) {
    documentImageMap.delete(documentId);
    console.log(`✅ 移除映射关系: 文档ID ${documentId}`);
    return true;
  }
  return false;
}

/**
 * 获取所有映射关系
 * @returns {Map} 映射关系Map
 */
export function getDocumentImageMappings() {
  return new Map(documentImageMap);
}

/**
 * 清空所有映射关系
 */
export function clearDocumentImageMappings() {
  documentImageMap.clear();
  console.log('✅ 已清空所有文档映射关系');
}

/**
 * 批量注册现有图片的映射关系
 * @param {Array} images - 图片数组，包含 {id, psDocumentId, url}
 */
export function batchRegisterMappings(images) {
  if (!Array.isArray(images)) {
    console.error('batchRegisterMappings: 参数必须是数组');
    return 0;
  }

  let registeredCount = 0;
  const errors = [];

  for (const image of images) {
    if (image && image.psDocumentId && image.id) {
      try {
        const success = registerDocumentImageMapping(
          image.psDocumentId,
          image.id,
          image.url || 'unknown'
        );
        if (success) {
          registeredCount++;
          console.log(`✅ 补充注册映射: 文档${image.psDocumentId} <-> 图片${image.id}`);
        }
      } catch (error) {
        errors.push({
          image: image.id,
          documentId: image.psDocumentId,
          error: error.message
        });
      }
    }
  }

  console.log(`📋 批量映射注册完成: 成功${registeredCount}个, 失败${errors.length}个`);

  if (errors.length > 0) {
    console.error('❌ 注册失败的映射:', errors);
  }

  return registeredCount;
}

/**
 * 错误处理和边界情况管理
 */
export const ErrorHandler = {
  /**
   * 检查系统状态和依赖项
   */
  checkSystemStatus() {
    const status = {
      isUXP: isUXPEnvironment(),
      hasPhotoshop: false,
      hasAction: false,
      hasFS: false,
      activeDocuments: 0,
      errors: []
    };

    if (status.isUXP) {
      try {
        status.hasPhotoshop = !!photoshop;
        status.hasAction = !!action;
        status.hasFS = !!fs;

        if (photoshop && photoshop.app) {
          status.activeDocuments = photoshop.app.documents ? photoshop.app.documents.length : 0;
        }
      } catch (error) {
        status.errors.push(`系统检查失败: ${error.message}`);
      }
    }

    return status;
  },

  /**
   * 验证文档映射的完整性
   */
  validateMappings() {
    const results = {
      total: documentImageMap.size,
      valid: 0,
      invalid: 0,
      orphaned: [],
      issues: []
    };

    if (!isUXPEnvironment() || !photoshop) {
      results.issues.push('UXP环境不可用，无法验证映射');
      return results;
    }

    try {
      const activeDocs = photoshop.app.documents ? Array.from(photoshop.app.documents) : [];
      const activeDocIds = new Set(activeDocs.map(doc => doc.id));

      for (const [docId, imageInfo] of documentImageMap) {
        if (activeDocIds.has(docId)) {
          results.valid++;
        } else {
          results.invalid++;
          results.orphaned.push({
            documentId: docId,
            imageId: imageInfo.imageId,
            timestamp: imageInfo.timestamp
          });
        }
      }
    } catch (error) {
      results.issues.push(`映射验证失败: ${error.message}`);
    }

    return results;
  },

  /**
   * 清理孤立的映射关系
   */
  cleanupOrphanedMappings() {
    const validation = this.validateMappings();
    let cleanedCount = 0;

    for (const orphaned of validation.orphaned) {
      if (documentImageMap.delete(orphaned.documentId)) {
        cleanedCount++;
        console.log(`🧹 清理孤立映射: 文档ID ${orphaned.documentId} -> 图片ID ${orphaned.imageId}`);
      }
    }

    console.log(`✅ 映射清理完成: 清理了 ${cleanedCount} 个孤立映射`);
    return cleanedCount;
  },

  /**
   * 创建错误报告
   */
  createErrorReport(error, context = {}) {
    const timestamp = new Date().toISOString();
    const systemStatus = this.checkSystemStatus();
    const mappingValidation = this.validateMappings();

    return {
      timestamp,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      system: systemStatus,
      mappings: mappingValidation,
      eventListenerStatus: {
        registered: eventListenerRegistered,
        callbackCount: syncCallbacks.length
      }
    };
  }
};

/**
 * 增强的反向同步处理（带有完整错误处理）
 * @param {number} documentId - PS文档ID
 * @param {object} imageInfo - 图片信息
 */
async function performReverseSyncWithErrorHandling(documentId, imageInfo) {
  const startTime = Date.now();
  let tempFile = null;

  try {
    console.log(`[安全反向同步] 开始处理文档 ${documentId}`);

    // 预检查
    const systemStatus = ErrorHandler.checkSystemStatus();
    if (!systemStatus.isUXP || !systemStatus.hasPhotoshop) {
      throw new Error('系统环境不满足反向同步要求');
    }

    // 执行核心同步逻辑
    const result = await performReverseSync(documentId, imageInfo);

    const duration = Date.now() - startTime;
    console.log(`✅ [安全反向同步] 文档 ${documentId} 同步成功，耗时 ${duration}ms`);

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [安全反向同步] 文档 ${documentId} 同步失败，耗时 ${duration}ms:`, error);

    // 创建详细的错误报告
    const errorReport = ErrorHandler.createErrorReport(error, {
      documentId,
      imageInfo,
      duration,
      operation: 'performReverseSync'
    });

    console.error('反向同步错误报告:', errorReport);

    // 错误恢复尝试
    try {
      await this.attemptErrorRecovery(documentId, imageInfo, error);
    } catch (recoveryError) {
      console.error('错误恢复失败:', recoveryError);
    }

    // 重新抛出原始错误
    throw error;

  } finally {
    // 清理临时资源
    if (tempFile) {
      try {
        // 清理临时文件（如果需要的话）
        console.log('清理临时资源');
      } catch (cleanupError) {
        console.error('资源清理失败:', cleanupError);
      }
    }
  }
}

/**
 * 错误恢复尝试
 */
async function attemptErrorRecovery(documentId, imageInfo, originalError) {
  console.log(`[错误恢复] 尝试恢复文档 ${documentId} 的反向同步`);

  // 恢复策略1: 清理并重建映射
  if (originalError.message.includes('文档') || originalError.message.includes('ID')) {
    console.log('[错误恢复] 策略1: 重新验证文档状态');

    try {
      const docs = photoshop.app.documents;
      const foundDoc = Array.from(docs).find(doc => doc.id === documentId);

      if (!foundDoc) {
        console.log('[错误恢复] 文档已不存在，清理映射关系');
        documentImageMap.delete(documentId);
        return;
      }
    } catch (docError) {
      console.error('[错误恢复] 文档验证失败:', docError);
    }
  }

  // 恢复策略2: 清理孤立映射
  if (originalError.message.includes('映射') || originalError.message.includes('mapping')) {
    console.log('[错误恢复] 策略2: 清理孤立映射');
    ErrorHandler.cleanupOrphanedMappings();
  }

  console.log('[错误恢复] 恢复尝试完成');
}

/**
 * 智能获取图片文件实体（本地优先策略）
 * @param {object} imageInfo - 图片信息对象 { type, path?, url?, data?, filename?, imageId? }
 * @returns {Promise<File>} 文件实体
 */
async function getImageFileEntry(imageInfo) {
  const { type, path, url, data, filename, imageId } = imageInfo;

  console.log('[智能获取文件] 输入参数:', { type, imageId, hasPath: !!path, hasUrl: !!url, hasData: !!data });

  // 策略1: 如果有imageId，优先检查本地缓存
  if (imageId) {
    try {
      console.log('[智能获取文件] 策略1: 检查本地缓存');
      await localImageManager.initialize();

      // 首先尝试直接ID匹配
      let hasLocal = localImageManager.hasLocalImage(imageId);
      let localFile = null;

      if (hasLocal) {
        localFile = await localImageManager.getLocalImageFile(imageId);
      }

      // 如果ID匹配失败且有URL，尝试URL匹配
      if (!localFile && url) {
        console.log(`[智能获取文件] ID匹配失败，尝试URL匹配: ${url.substring(0, 50)}...`);
        hasLocal = await localImageManager.getLocalImageDisplayUrlByUrl(url) !== null;

        if (hasLocal) {
          // 找到对应的下载ID
          for (const [downloadId, imageInfo] of localImageManager.indexData) {
            if (imageInfo.url === url && (imageInfo.status === 'downloaded' || imageInfo.status === 'synced' || imageInfo.status === 'modified')) {
              localFile = await localImageManager.getLocalImageFile(downloadId);
              if (localFile) {
                console.log(`✅ [智能获取文件] URL匹配成功: 使用本地文件 ${downloadId}`);
                break;
              }
            }
          }
        }
      }

      if (localFile) {
        console.log(`✅ [智能获取文件] 策略1成功: 使用本地缓存文件`);
        return localFile;
      } else {
        console.log(`ℹ️ [智能获取文件] 策略1跳过: 未找到可用的本地图片`);
      }
    } catch (error) {
      console.warn('[智能获取文件] 策略1异常:', error.message);
    }
  }

  // 策略2: 根据指定类型处理
  if (type === 'local' && path) {
    try {
      console.log('[智能获取文件] 策略2: 处理指定的本地文件');
      const fileEntry = await getLocalFileEntry(path);
      console.log('✅ [智能获取文件] 策略2成功: 本地文件');
      return fileEntry;
    } catch (error) {
      console.warn('[智能获取文件] 策略2失败:', error.message);
    }
  }

  if (type === 'base64' && data) {
    try {
      console.log('[智能获取文件] 策略2: 处理Base64数据');
      const fileEntry = await getBase64FileEntry(data, filename);
      console.log('✅ [智能获取文件] 策略2成功: Base64文件');
      return fileEntry;
    } catch (error) {
      console.warn('[智能获取文件] 策略2失败:', error.message);
    }
  }

  // 策略3: 尝试远程下载（兜底方案）
  if (url || path) {
    try {
      console.log('[智能获取文件] 策略3: 下载远程文件');
      const downloadUrl = url || path;
      const fileEntry = await getRemoteFileEntry(downloadUrl, filename);
      console.log('✅ [智能获取文件] 策略3成功: 远程下载');

      // 如果有imageId，将下载的文件添加到本地缓存
      if (imageId && downloadUrl) {
        try {
          await localImageManager.initialize();
          // 这里可以考虑将下载的文件添加到本地管理器中
          console.log(`ℹ️ [智能获取文件] 远程下载的文件未缓存到本地管理器`);
        } catch (cacheError) {
          console.warn('[智能获取文件] 缓存远程文件失败:', cacheError.message);
        }
      }

      return fileEntry;
    } catch (error) {
      console.error('[智能获取文件] 策略3失败:', error.message);
    }
  }

  // 所有策略都失败
  throw new Error('无法获取图片文件: 所有获取策略都失败');
}

/**
 * 增强的placeImageInPS函数，支持本地文件优先
 * @param {object} imageInfo - 图片信息，支持以下格式：
 *   - { imageId: 'xxx' } - 仅通过imageId获取本地缓存
 *   - { type: 'local', path: '/path/to/file' } - 本地文件
 *   - { type: 'remote', url: 'http://...', imageId?: 'xxx' } - 远程文件（可选本地缓存）
 *   - { type: 'base64', data: 'data:image/...', filename?: 'name.jpg' } - Base64数据
 */
export async function placeImageInPSEnhanced(imageInfo) {
  console.log('🚀 [增强版图片放置] 开始处理:', imageInfo);

  // 标准化imageInfo格式
  const normalizedInfo = normalizeImageInfo(imageInfo);
  console.log('📋 [增强版图片放置] 标准化后:', normalizedInfo);

  // 调用原始函数
  try {
    const result = await placeImageInPS(normalizedInfo);
    console.log('✅ [增强版图片放置] 放置成功');
    return result;
  } catch (error) {
    console.error('❌ [增强版图片放置] 放置失败:', error);
    throw error;
  }
}

/**
 * 标准化图片信息对象
 * @param {object} imageInfo - 原始图片信息
 * @returns {object} 标准化的图片信息
 */
function normalizeImageInfo(imageInfo) {
  // 如果只有imageId，设置为本地优先模式
  if (imageInfo.imageId && !imageInfo.type && !imageInfo.url && !imageInfo.path) {
    return {
      ...imageInfo,
      type: 'local_priority',
      imageId: imageInfo.imageId
    };
  }

  // 如果有imageId但没有指定类型，优先检查本地
  if (imageInfo.imageId && !imageInfo.type) {
    return {
      ...imageInfo,
      type: 'smart',
      imageId: imageInfo.imageId
    };
  }

  return imageInfo;
}