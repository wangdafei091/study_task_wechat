# 🔧 MySQL兼容性问题解决方案

## ❌ 问题原因

您遇到的错误是由于以下两个MySQL兼容性问题：

1. **保留关键字冲突**：`repeat` 是MySQL的保留关键字，必须用反引号括起来：`` `repeat` ``
2. **JSON类型支持**：MySQL 5.7.7以下版本不支持JSON数据类型

## ✅ 快速解决方案

### 方案一：自动修复（推荐）

```bash
# 在backend目录下执行
bash database/fix-and-init.sh
```

这个脚本会自动：
- 检测您的MySQL版本
- 选择合适的SQL文件（JSON或TEXT类型）
- 修复关键字冲突
- 初始化测试数据库

### 方案二：手动执行修复版SQL

```bash
# 使用兼容版本（适用于所有MySQL版本）
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test < database/test-setup-fixed.sql

# 或者使用现代版本（MySQL 5.7.7+，支持JSON类型）
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test < database/test-setup-modern.sql
```

### 方案三：在线修复

```bash
# 连接到数据库
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test

# 然后复制粘贴以下修复后的SQL：
```

```sql
-- 修复后的CREATE TABLE语句
CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type ENUM('study', 'habit', 'interest') NOT NULL DEFAULT 'study',
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  duration INT DEFAULT 0 COMMENT '时长（分钟）',
  is_all_day TINYINT(1) DEFAULT 0,
  is_required TINYINT(1) DEFAULT 0,
  penalty_applied TINYINT(1) DEFAULT 0,
  points INT DEFAULT 0,
  points_expiry ENUM('1day', '7day', '30day', 'permanent') DEFAULT 'permanent',
  status INT DEFAULT 0 COMMENT '0=未完成, 1=已完成',
  `repeat` TEXT COMMENT '重复任务配置（修复：添加反引号）',
  has_no_end_date TINYINT(1) DEFAULT 0,
  tags TEXT COMMENT '标签数组（修复：改为TEXT类型）',
  completion_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  star_awarded TINYINT(1) DEFAULT 0,
  modify_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_date (date),
  INDEX idx_status (status),
  INDEX idx_deleted_at (deleted_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 📁 修复后的文件

我已为您创建了以下修复版本：

1. **`database/test-setup-fixed.sql`** - 兼容版本（TEXT类型）
2. **`database/test-setup-modern.sql`** - 现代版本（JSON类型）
3. **`database/fix-and-init.sh`** - 自动修复脚本
4. **`database/check-mysql-version.sh`** - 版本检查脚本

## 🔍 验证修复

执行修复后，运行以下命令验证：

```bash
# 检查表是否创建成功
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test -e "SHOW TABLES;"

# 检查tasks表结构
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test -e "DESCRIBE tasks;"

# 验证测试数据
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test -e "SELECT COUNT(*) as task_count FROM tasks;"
```

## 🚀 完成后运行测试

数据库初始化成功后，立即运行真实集成测试：

```bash
npm test test/integration/task-api-m07-real.test.js
```

## 📝 修复详情

### 问题1：保留关键字 `repeat`

**错误代码：**
```sql
repeat JSON,  -- ❌ 错误：repeat是保留关键字
```

**修复代码：**
```sql
`repeat` TEXT,  -- ✅ 正确：使用反引号
```

### 问题2：JSON类型兼容性

**错误代码：**
```sql
tags JSON,  -- ❌ 错误：MySQL 5.7.7以下不支持JSON
```

**修复代码：**
```sql
tags TEXT,  -- ✅ 正确：兼容所有版本
-- 在应用层处理JSON解析
```

## 🎯 推荐流程

1. **首选**：使用自动修复脚本
   ```bash
   bash database/fix-and-init.sh
   ```

2. **备选**：手动执行修复版SQL
   ```bash
   mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 task_wechat_test < database/test-setup-fixed.sql
   ```

3. **验证**：检查表结构并运行测试
   ```bash
   npm test test/integration/task-api-m07-real.test.js
   ```

## ⚠️ 注意事项

- 修复后的SQL使用TEXT类型存储JSON数据，应用代码需要正确解析
- 如果您的MySQL版本≥5.7.7，建议使用`test-setup-modern.sql`获得更好的JSON性能
- 保留关键字必须始终使用反引号括起来

## 📞 如有其他问题

如果仍然遇到问题，请检查：

1. MySQL版本是否≥5.5
2. 用户权限是否正确（CREATE, ALTER, INSERT）
3. 数据库是否已创建：`task_wechat_test`
4. 网络连接是否正常

执行以下命令查看MySQL版本：
```bash
mysql -h121.4.38.122 -uroot -p4bdbff929dfd5518 -e "SELECT VERSION();"
```
