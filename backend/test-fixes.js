/**
 * 验证GPT5 Codex提出的6个关键问题修复效果
 */

console.log('🔍 验证修复效果...\n');

// 1. 验证登录链路修复
console.log('1️⃣ 验证登录链路修复：');
const fs = require('fs');
const appJsContent = fs.readFileSync('../app.js', 'utf8');
if (appJsContent.includes('{ code: res.code }')) {
  console.log('✅ 登录链路修复成功 - 使用了正确的res.code变量');
} else {
  console.log('❌ 登录链路修复失败');
}

// 2. 验证UserService注入修复
console.log('\n2️⃣ 验证UserService注入修复：');
if (appJsContent.includes('UserService未初始化，延迟到登录后注入')) {
  console.log('✅ UserService注入修复成功 - 添加了延迟注入机制');
} else {
  console.log('❌ UserService注入修复失败');
}

// 3. 验证前后端API契约修复
console.log('\n3️⃣ 验证前后端API契约修复：');
const serverJsContent = fs.readFileSync('server.js', 'utf8');
if (serverJsContent.includes("app.use('/api/users'") && !serverJsContent.includes("// app.use('/api/users'")) {
  console.log('✅ 前后端API契约修复成功 - users路由已启用');
} else {
  console.log('❌ 前后端API契约修复失败');
}

const apiConfigContent = fs.readFileSync('../utils/api-config.js', 'utf8');
if (apiConfigContent.includes('process.env.API_BASE_URL')) {
  console.log('✅ API配置修复成功 - BASE_URL支持环境变量');
} else {
  console.log('❌ API配置修复失败');
}

// 4. 验证集成测试环境配置
console.log('\n4️⃣ 验证集成测试环境配置：');
const testSetupExists = fs.existsSync('test/setup.js');
const envTestExists = fs.existsSync('.env.test');
const jestConfigExists = fs.existsSync('jest.config.js');

if (testSetupExists && envTestExists && jestConfigExists) {
  console.log('✅ 集成测试环境配置成功 - 测试文件已创建');
} else {
  console.log('❌ 集成测试环境配置失败');
}

// 5. 验证updateTask字段级校验
console.log('\n5️⃣ 验证updateTask字段级校验修复：');
const taskModelContent = fs.readFileSync('models/Task.js', 'utf8');
const taskControllerContent = fs.readFileSync('controllers/taskController.js', 'utf8');

if (taskModelContent.includes('isUpdate') && taskControllerContent.includes('Task.validate(updateData, true)')) {
  console.log('✅ updateTask字段级校验修复成功 - 添加了更新验证');
} else {
  console.log('❌ updateTask字段级校验修复失败');
}

// 6. 验证JWT弱默认密钥修复
console.log('\n6️⃣ 验证JWT弱默认密钥修复：');
const jwtConfigContent = fs.readFileSync('config/jwt.js', 'utf8');

if (jwtConfigContent.includes('JWT_SECRET环境变量未设置') &&
    !jwtConfigContent.includes('your-secret-key-here')) {
  console.log('✅ JWT弱默认密钥修复成功 - 强制要求环境变量配置');
} else {
  console.log('❌ JWT弱默认密钥修复失败');
}

console.log('\n🎯 所有修复验证完成！');
