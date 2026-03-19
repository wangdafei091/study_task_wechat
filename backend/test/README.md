# 后端真实数据库集成测试指南

## 📋 准备工作

### 1. 配置测试数据库连接

编辑 `backend/.env.test` 文件，填入您的远程数据库信息：

```bash
# 远程测试数据库配置
DB_HOST=your-remote-db-host.com      # 您的远程数据库地址
DB_PORT=3306                          # 数据库端口
DB_USER=your_test_db_user             # 测试数据库用户名
DB_PASSWORD=your_test_db_password     # 测试数据库密码
DB_NAME=task_wechat_test              # 测试数据库名称
```

### 2. 创建测试数据库

连接到您的远程数据库，执行以下命令：

```sql
-- 创建测试数据库
CREATE DATABASE IF NOT EXISTS task_wechat_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建测试用户（如果没有）
CREATE USER IF NOT EXISTS 'test_user'@'%' IDENTIFIED BY 'your_test_password';
GRANT ALL PRIVILEGES ON task_wechat_test.* TO 'test_user'@'%';
FLUSH PRIVILEGES;
```

### 3. 初始化测试数据库结构

执行数据库初始化脚本：

```bash
# 方式1：通过MySQL命令行
mysql -h your-remote-db-host.com -u test_user -p task_wechat_test < backend/database/test-setup-modern.sql

# 方式2：如果使用MySQL客户端工具，直接导入 backend/database/test-setup-modern.sql 文件
```

## 🚀 运行测试

### 运行所有真实集成测试

```bash
cd backend
npm test -- test/integration/task-api-m07-real.test.js
```

### 运行特定测试套件

```bash
# 只测试更新任务API
npm test -- test/integration/task-api-m07-real.test.js -t "PUT /api/tasks"

# 只测试软删除
npm test -- test/integration/task-api-m07-real.test.js -t "DELETE /api/tasks"

# 只测试家庭聚合查询
npm test-- test/integration/task-api-m07-real.test.js -t "scope=family"
```

### 查看测试覆盖率

```bash
npm test -- test/integration/task-api-m07-real.test.js --coverage
```

## 🔍 测试内容

M07真实集成测试覆盖以下场景：

### 1. PUT /api/tasks/:taskId - 更新任务
- ✅ 任务所有者更新成功
- ✅ 家长代孩子更新成功
- ✅ 跨家庭用户返回403
- ✅ 不存在的任务返回404
- ✅ 字段白名单过滤生效

### 2. DELETE /api/tasks/:taskId - 软删除任务
- ✅ 软删除成功（deleted_at设置）
- ✅ 软删除后任务不在列表中出现
- ✅ 跨家庭用户返回403
- ✅ 软删除任务通过ID查询返回404

### 3. PATCH /api/tasks/:taskId/status - 更新任务状态
- ✅ 完成任务成功，completionTime设置
- ✅ 重置任务成功
- ✅ 家长代孩子更新成功
- ✅ 无效状态值返回400
- ✅ completionTime/modifyTime字段正确

### 4. GET /api/tasks?scope=family - 家庭聚合查询
- ✅ 家长获取所有孩子任务
- ✅ 孩子请求返回403
- ✅ 不包含其他家庭任务
- ✅ 支持日期/状态过滤

### 5. deleted_at IS NULL 过滤验证
- ✅ 所有读接口正确过滤软删除任务
- ✅ 软删除任务不在普通查询中出现

## 🛠️ 故障排查

### 问题1：数据库连接失败
```
Error: connect ECONNREFUSED
```
**解决方案**：
- 检查 `.env.test` 中的数据库配置是否正确
- 确认远程数据库可访问（防火墙、白名单）
- 验证数据库用户权限

### 问题2：测试数据冲突
```
Duplicate entry for key 'PRIMARY'
```
**解决方案**：
```bash
# 清理测试数据后重新运行
mysql -h your-host -u user -p task_wechat_test -e "DELETE FROM tasks WHERE task_id LIKE '%_test_%'; DELETE FROM users WHERE user_id LIKE '%_test_%';"
```

### 问题3：JWT认证失败
```
JwtStringError: jwt malformed
```
**解决方案**：
- 确保 `.env.test` 中的 `JWT_SECRET` 与测试代码中一致
- 检查token是否正确设置在请求头中

## 📊 测试报告示例

运行成功后的输出示例：

```
PASS test/integration/task-api-m07-real.test.js
  M07 真实数据库集成测试
    PUT /api/tasks/:taskId - 更新任务
      ✓ 应该成功更新任务 (150ms)
      ✓ 家长应该能够代孩子更新任务 (120ms)
      ✓ 跨家庭用户更新任务应该返回 403 (80ms)
    DELETE /api/tasks/:taskId - 软删除任务
      ✓ 应该成功软删除任务 (140ms)
      ✓ 软删除后的任务不应该在列表中出现 (160ms)
    PATCH /api/tasks/:taskId/status - 更新任务状态
      ✓ 应该成功更新任务状态为已完成 (130ms)
      ✓ 应成功重置任务状态 (110ms)
    GET /api/tasks?scope=family - 家庭聚合查询
      ✓ 家长应该能够获取家庭所有孩子的任务 (200ms)
      ✓ 孩子请求 scope=family 应该返回 403 (90ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        2.5s
```

## 🔄 清理测试数据

每次测试运行后会自动清理，如需手动清理：

```sql
-- 清理所有测试数据
USE task_wechat_test;

DELETE FROM tasks WHERE user_id LIKE '%_test_%' OR task_id LIKE '%_test_%';
DELETE FROM users WHERE user_id LIKE '%_test_%';
DELETE FROM families WHERE family_id LIKE '%_test_%';
```

## ⚠️ 注意事项

1. **测试数据库独立性**：确保使用独立的测试数据库，不要在生产环境运行
2. **网络延迟**：远程数据库可能有网络延迟，适当调整 `testTimeout`（当前30秒）
3. **数据清理**：每次测试前后会自动清理测试数据
4. **并发安全**：不要多人同时在同一个测试数据库运行测试

## 📝 下一步

测试通过后，可以将测试集成到CI/CD流程中：

```yaml
# .github/workflows/test.yml 示例
- name: Run integration tests
  run: |
    cd backend
    npm test -- test/integration/task-api-m07-real.test.js
  env:
    DB_HOST: ${{ secrets.TEST_DB_HOST }}
    DB_USER: ${{ secrets.TEST_DB_USER }}
    DB_PASSWORD: ${{ secrets.TEST_DB_PASSWORD }}
```
