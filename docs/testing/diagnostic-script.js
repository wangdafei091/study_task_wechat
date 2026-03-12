/**
 * 快速诊断脚本 - 验证API配置修复后的系统状态
 * 在微信开发者工具控制台中直接执行此脚本
 */

console.log('🚀 开始系统诊断...\n');

// 1. 检查微信存储配置
console.log('📋 步骤1: 检查微信存储配置');
const enableApi = wx.getStorageSync('ENABLE_API');
const baseUrl = wx.getStorageSync('API_BASE_URL');
const token = wx.getStorageSync('jwt_token');

console.log('  ENABLE_API:', enableApi === 'true' ? '✅ true' : '❌ ' + enableApi);
console.log('  API_BASE_URL:', baseUrl || '❌ 未设置');
console.log('  JWT Token:', token ? '✅ 存在 (长度:' + token.length + ')' : '❌ 不存在');

// 2. 检查后端服务器连接
console.log('\n📡 步骤2: 检查后端服务器连接');
wx.request({
  url: 'http://localhost:3000/health',
  method: 'GET',
  timeout: 5000,
  success: (res) => {
    console.log('  后端服务器: ✅ 正常运行');
    console.log('  状态:', res.data.status);
    console.log('  运行时间:', Math.round(res.data.uptime) + '秒');
    console.log('  环境:', res.data.environment);
  },
  fail: (err) => {
    console.log('  后端服务器: ❌ 连接失败');
    console.log('  错误:', err.errMsg);
  }
});

// 3. 测试API认证
if (token) {
  console.log('\n🔐 步骤3: 测试API认证');
  wx.request({
    url: 'http://localhost:3000/api/users/current',
    method: 'GET',
    header: {
      'Authorization': 'Bearer ' + token
    },
    timeout: 5000,
    success: (res) => {
      console.log('  API认证: ✅ 成功');
      console.log('  当前用户:', res.data.userId);
      console.log('  用户名:', res.data.name);
      console.log('  角色:', res.data.role);
    },
    fail: (err) => {
      console.log('  API认证: ❌ 失败');
      console.log('  错误:', err.errMsg);
      console.log('  建议: Token可能已过期，请重新登录');
    }
  });
} else {
  console.log('\n🔐 步骤3: 跳过API认证（无Token）');
  console.log('  建议: 请先进行登录');
}

// 4. 测试任务API
if (token) {
  console.log('\n📝 步骤4: 测试任务API');
  wx.request({
    url: 'http://localhost:3000/api/tasks',
    method: 'GET',
    header: {
      'Authorization': 'Bearer ' + token
    },
    timeout: 5000,
    success: (res) => {
      const tasks = res.data.data || res.data || [];
      console.log('  任务API: ✅ 成功');
      console.log('  云端任务数量:', tasks.length);
      if (tasks.length > 0) {
        console.log('  最新任务:', tasks[0].title);
      } else {
        console.log('  提示: 云端暂无任务，请创建测试任务');
      }
    },
    fail: (err) => {
      console.log('  任务API: ❌ 失败');
      console.log('  错误:', err.errMsg);
    }
  });
} else {
  console.log('\n📝 步骤4: 跳过任务API测试（无Token）');
}

// 5. 检查本地任务数据
console.log('\n💾 步骤5: 检查本地任务数据');
try {
  const localTasks = wx.getStorageSync('tasks') || [];
  console.log('  本地任务数量:', localTasks.length);
  if (localTasks.length > 0) {
    console.log('  本地最新任务:', localTasks[0].title);
  } else {
    console.log('  提示: 本地暂无任务，请创建测试任务');
  }
} catch (e) {
  console.log('  本地任务: ❌ 读取失败');
  console.log('  错误:', e.message);
}

// 6. 总结和建议
console.log('\n📊 诊断总结:');
console.log('=' + '='.repeat(40));
console.log('下一步操作建议:');
console.log('');

if (!token) {
  console.log('1. ⚠️  需要重新登录');
  console.log('   执行: const app = getApp(); app.doCloudLogin();');
} else {
  console.log('1. ✅ 登录状态正常');
}

if (baseUrl !== 'http://localhost:3000') {
  console.log('2. ⚠️  API配置可能不正确');
  console.log('   当前值:', baseUrl);
  console.log('   预期值: http://localhost:3000');
} else {
  console.log('2. ✅ API配置正确');
}

console.log('3. 📝 创建测试任务验证双写功能');
console.log('   操作: 首页右下角"+" → 选择"任务" → 创建任务');
console.log('');
console.log('4. 📋 查看完整测试计划:');
console.log('   参考: docs/testing/api-config-fix-test.md');
console.log('=' + '='.repeat(40));

console.log('\n✅ 诊断完成！请根据结果进行相应操作。');
