/**
 * 紧急修复脚本 - 清理所有损坏的安全存储数据
 * 在浏览器控制台中复制粘贴以下代码并回车执行
 */

// 紧急修复 - 清理所有安全存储数据
console.log('🚨 执行紧急修复 - 清理所有安全存储数据');

try {
  // 获取所有安全存储的键
  const secureKeys = Object.keys(localStorage).filter(key => key.startsWith('uxp_secure_'));
  
  console.log(`发现 ${secureKeys.length} 个安全存储项`);
  
  if (secureKeys.length === 0) {
    console.log('✅ 未发现安全存储数据');
  } else {
    // 清理所有安全存储数据
    secureKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`✅ 已清理: ${key}`);
      } catch (error) {
        console.log(`❌ 清理失败: ${key} - ${error.message}`);
      }
    });
    
    // 验证清理结果
    const remainingKeys = Object.keys(localStorage).filter(key => key.startsWith('uxp_secure_'));
    
    if (remainingKeys.length === 0) {
      console.log('🎉 所有安全存储数据已清理完成！');
      console.log('💡 请刷新页面以确保更改生效');
    } else {
      console.log(`⚠️ 仍有 ${remainingKeys.length} 个数据项未能清理`);
    }
  }
} catch (error) {
  console.error('❌ 紧急修复失败:', error);
}

// 一行命令版本（可直接复制执行）
// Object.keys(localStorage).filter(key => key.startsWith('uxp_secure_')).forEach(key => localStorage.removeItem(key));