#!/usr/bin/env node

/**
 * 测试运行脚本
 * 运行所有测试并生成覆盖率报告
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 开始运行HTTP API访问功能测试套件...\n');

try {
  // 运行所有测试
  console.log('📋 运行单元测试...');
  execSync('npm test -- --verbose', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  console.log('\n✅ 所有测试通过！');
  
  // 生成覆盖率报告
  console.log('\n📊 生成测试覆盖率报告...');
  execSync('npm run test:coverage', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  console.log('\n🎉 测试完成！覆盖率报告已生成。');
  
} catch (error) {
  console.error('\n❌ 测试失败:', error.message);
  process.exit(1);
}