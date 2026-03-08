# 里程碑-05B：任务管理 + 小程序接入详细设计文档

> **设计状态**：⏳ 待启动
> **创建日期**：2026-03-08
> **设计者**：Claude Code
> **审核者**：待审核
> **预计工期**：1周
> **依赖**：里程碑-05A完成

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [数据库设计](#数据库设计)
- [API设计](#api设计)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)

---

## 需求分析

### 功能描述

基于里程碑-05A的基础架构，实现任务管理API和小程序接入功能，实现端到端的任务管理流程。

### 业务价值

- ✅ **用户价值**：用户可以在云端创建和查看任务
- ✅ **技术价值**：验证后端API与小程序集成方案
- ✅ **迁移价值**：为后续完整云端迁移奠定基础

### 功能范围

**包含**：
- ✅ 任务创建API（`POST /api/tasks`）
- ✅ 任务查询API（`GET /api/tasks`）
- ✅ 任务详情API（`GET /api/tasks/:taskId`）
- ✅ 小程序接入后端任务API
- ✅ 双写策略（云端+本地）
- ✅ 离线降级机制
- ✅ 完整集成测试
- ✅ 部署上线

**不包含**（明确边界）：
- ❌ 任务更新功能（PUT /api/tasks/:taskId）
- ❌ 任务删除功能（DELETE /api/tasks/:taskId）
- ❌ 任务状态更新（状态管理）
- ❌ 用户管理API（用户列表、创建、删除等）
- ❌ 星星积分功能
- ❌ 奖励兑换功能

### 验收标准

- [ ] 任务创建API正常工作
- [ ] 任务查询API正常工作
- [ ] 小程序能够创建任务到云端
- [ ] 小程序能够查看云端任务
- [ ] 数据正确存储在MySQL（tasks表）
- [ ] 双写策略正常工作
- [ ] 离线降级机制正常工作
- [ ] 端到端流程验证通过（创建任务 → 查看任务 → 验证数据）

### 优先级

- **优先级**：P0（最高）
- **理由**：核心功能验证，确保技术方案可行性

---

## 技术方案

### 方案概述

基于里程碑-05A的基础架构，扩展任务管理功能，实现小程序与后端API的集成，采用双写策略确保数据安全。

### 技术选型

基于里程碑-05A的技术选型，无新增技术栈。

### 架构设计

```
┌─────────────────────────────────────────┐
│         微信小程序（现有代码）         │
│                                     │
│  ┌──────────────────────────────┐    │
│  │   TaskService              │    │
│  │   - 双写策略              │    │
│  │   - 降级机制              │    │
│  └──────────┬───────────────┘    │
│             │                     │
└─────────────┼─────────────────────┘
              │
              ├──────────────┬───────────────
              │              │
         ┌────▼────┐   ┌──▼─────────┐
         │  本地    │   │   云端    │
         │  存储    │   │  HTTP    │
         │ (降级)  │   │  API      │
         └──────────┘   └──┬─────────┘
                             │
┌──────────────────────────────▼─────────┐
│        腾讯云轻量服务器           │
│                                     │
│  ┌──────────────────────────────┐    │
│  │   Express.js 服务器         │    │
│  │                            │    │
│  │  ┌──────────────────────┐   │    │
│  │  │ 任务路由 (Routes)   │   │    │
│  │  │ - POST /api/tasks   │   │    │
│  │  │ - GET /api/tasks    │   │    │
│  │  └──────────────────────┘   │    │
│  │                            │    │
│  │  ┌──────────────────────┐   │    │
│  │  │ 任务控制器           │   │    │
│  │  └──────────────────────┘   │    │
│  └──────────────┬───────────────┘    │
│                 │                     │
│  ┌──────────────▼───────────────┐    │
│  │     MySQL 5.7.44          │    │
│  │  - users 表                │    │
│  │  - tasks 表                │    │
│  └──────────────────────────────┘    │
│                                     │
└─────────────────────────────────────────┘
```

### 双写策略设计

**策略说明**：同时写入云端和本地，确保数据安全

**实现逻辑**：
```javascript
async function createTaskWithDualWrite(taskData) {
  try {
    // 1. 尝试写入云端
    const cloudResult = await HttpClient.post('/api/tasks', taskData);

    if (cloudResult && cloudResult.success) {
      // 2. 云端成功，写入本地（标记为已同步）
      await storageAdapter.set(`tasks/${taskData.taskId}`, {
        ...taskData,
        synced: true,
        syncedAt: Date.now()
      });

      logger.info('双写', '云端和本地都写入成功');
      return { success: true, mode: 'cloud' };
    }
  } catch (cloudError) {
    // 3. 云端失败，写入本地（标记为未同步）
    await storageAdapter.set(`tasks/${taskData.taskId}`, {
      ...taskData,
      synced: false,
      syncError: cloudError.message,
      createdAt: Date.now()
    });

    logger.warn('双写', '云端写入失败，降级到本地', cloudError);
    return { success: true, mode: 'local', error: cloudError.message };
  }
}
```

**离线降级机制**：
```javascript
async function getTasksWithFallback() {
  try {
    // 1. 尝试从云端获取
    return await HttpClient.get('/api/tasks');
  } catch (cloudError) {
    // 2. 云端失败，从本地获取
    logger.warn('降级', '云端获取失败，使用本地数据', cloudError);
    return await storageAdapter.getAll('tasks/');
  }
}
```

---

## 数据库设计

### 新增表：tasks 表（任务信息）

```sql
CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(36) PRIMARY KEY COMMENT '任务ID，UUID',
    user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
    title VARCHAR(200) NOT NULL COMMENT '任务标题',
    description TEXT COMMENT '任务描述',
    type VARCHAR(20) NOT NULL COMMENT '类型：study/habit/interest',
    date DATE NOT NULL COMMENT '任务日期',
    startTime VARCHAR(10) COMMENT '开始时间 HH:mm',
    endTime VARCHAR(10) COMMENT '结束时间 HH:mm',
    points INT NOT NULL DEFAULT 0 COMMENT '奖励星星数',
    pointsExpiry VARCHAR(20) NOT NULL COMMENT '有效期类型：permanent/week/month/quarter',
    isRequired BOOLEAN DEFAULT FALSE COMMENT '是否必做任务',
    status INT DEFAULT 0 COMMENT '状态：0=未完成，1=已完成',
    `repeat` JSON COMMENT '重复配置',
    isAllDay BOOLEAN DEFAULT FALSE COMMENT '是否全天任务',
    penaltyApplied BOOLEAN DEFAULT FALSE COMMENT '是否已应用惩罚',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务表';
```

### 数据库迁移脚本

```sql
-- 文件：database/migrations/002_create_tasks.sql
USE task_wechat;

CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    startTime VARCHAR(10),
    endTime VARCHAR(10),
    points INT NOT NULL DEFAULT 0,
    pointsExpiry VARCHAR(20) NOT NULL,
    isRequired BOOLEAN DEFAULT FALSE,
    status INT DEFAULT 0,
    `repeat` JSON,
    isAllDay BOOLEAN DEFAULT FALSE,
    penaltyApplied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## API设计

### API基础信息

- **基础URL**：`http://你的服务器IP:3000/api`
- **协议**：HTTP（生产环境建议使用HTTPS）
- **响应格式**：JSON
- **命名规范**：camelCase（与数据库snake_case自动转换）

### 统一响应格式

**成功响应**：
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**失败响应**：
```json
{
  "success": false,
  "data": null,
  "message": "错误描述",
  "error_code": "ERROR_CODE"
}
```

### API接口列表

#### 1. 任务管理API

##### POST /api/tasks - 创建任务

**功能描述**：创建新任务

**请求头**：
```
Authorization: Bearer {token}
```

**请求参数**：
```json
{
  "title": "完成数学作业",
  "description": "完成第三章习题",
  "type": "study",
  "date": "2026-03-08",
  "startTime": "19:00",
  "endTime": "20:00",
  "points": 5,
  "pointsExpiry": "permanent",
  "isRequired": true,
  "repeat": null,
  "isAllDay": false
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "taskId": "uuid-5678",
    "title": "完成数学作业",
    "description": "完成第三章习题",
    "type": "study",
    "date": "2026-03-08",
    "startTime": "19:00",
    "endTime": "20:00",
    "points": 5,
    "pointsExpiry": "permanent",
    "isRequired": true,
    "status": 0,
    "createdAt": "2026-03-08T10:00:00Z"
  },
  "message": "任务创建成功"
}
```

**实现要点**：
- JWT验证用户身份
- 验证必填字段
- 生成UUID作为task_id
- 插入数据库（修复列/占位符数量匹配）
- 返回创建的任务信息

**关键修复**：
```javascript
// 确保列数和占位符数量一致（15列，15个占位符）
await execute(
  `INSERT INTO tasks (
    task_id, user_id, title, description, type, date,
    startTime, endTime, points, pointsExpiry,
    isRequired, status, \`repeat\`, isAllDay, penaltyApplied
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,  // 15个占位符
  [
    dbData.task_id, dbData.user_id, dbData.title, dbData.description,
    dbData.type, dbData.date, dbData.startTime, dbData.endTime,
    dbData.points, dbData.pointsExpiry, dbData.isRequired,
    dbData.status, dbData.repeat, dbData.isAllDay, dbData.penaltyApplied
  ]
);
```

---

##### GET /api/tasks - 获取任务列表

**功能描述**：获取当前用户的任务列表

**请求头**：
```
Authorization: Bearer {token}
```

**请求参数**（可选，查询参数）：
- `date`：筛选指定日期的任务（YYYY-MM-DD）
- `status`：筛选任务状态（0=未完成，1=已完成）

**响应示例**：
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "uuid-5678",
        "title": "完成数学作业",
        "description": "完成第三章习题",
        "type": "study",
        "date": "2026-03-08",
        "startTime": "19:00",
        "endTime": "20:00",
        "points": 5,
        "pointsExpiry": "week",
        "isRequired": true,
        "status": 0,
        "createdAt": "2026-03-08T10:00:00Z"
      }
    ],
    "total": 1
  },
  "message": "获取成功"
}
```

**实现要点**：
- JWT验证用户身份
- 按user_id查询任务
- 支持日期和状态筛选
- 按创建时间倒序排列
- 返回任务总数

---

##### GET /api/tasks/:taskId - 获取任务详情

**功能描述**：根据任务ID获取任务详细信息

**请求头**：
```
Authorization: Bearer {token}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "taskId": "uuid-5678",
    "title": "完成数学作业",
    "description": "完成第三章习题",
    "type": "study",
    "date": "2026-03-08",
    "startTime": "19:00",
    "endTime": "20:00",
    "points": 5,
    "pointsExpiry": "week",
    "isRequired": true,
    "status": 0,
    "createdAt": "2026-03-08T10:00:00Z"
  },
  "message": "获取成功"
}
```

**实现要点**：
- JWT验证用户身份
- 验证用户权限（只能查看自己的任务）
- 查询任务详情
- 返回完整任务信息

---

### API错误码

| 错误码 | 说明 |
|--------|------|
| AUTH_INVALID_TOKEN | Token无效或过期 |
| AUTH_TOKEN_EXPIRED | Token已过期 |
| TASK_INVALID_PARAMS | 任务参数无效 |
| TASK_NOT_FOUND | 任务不存在 |
| DATABASE_ERROR | 数据库错误 |
| INTERNAL_ERROR | 服务器内部错误 |

---

## 实施步骤

### 第1步：修复关键问题（0.5天）

- [ ] **任务**：修复SQL列/占位符数量不匹配
- [ ] **任务**：修复云端模式配置机制
- [ ] **任务**：修复.env安全风险

**具体操作**：
1. 修复backend/services/taskService.js中的SQL语句
2. 修复utils/api-config.js中的ENABLE_API配置
3. 将backend/.env中的敏感信息替换为占位符

---

### 第2步：创建任务表（0.5天）

- [ ] **任务**：在MySQL中创建tasks表
- [ ] **验证**：表结构正确，外键约束正常

**具体操作**：
1. 执行迁移脚本002_create_tasks.sql
2. 验证表结构
3. 测试外键约束

---

### 第3步：实现任务管理API（1.5天）

- [ ] **任务**：实现任务的创建和查看功能
- [ ] **验证**：能够创建任务，能够查看任务列表

**具体操作**：
1. 实现创建任务接口`POST /api/tasks`
2. 实现获取任务列表接口`GET /api/tasks`
3. 实现获取任务详情接口`GET /api/tasks/:taskId`
4. 添加JWT认证中间件
5. 添加参数验证
6. 测试任务管理功能

---

### 第4步：小程序接入后端API（1.5天）

- [ ] **任务**：修改小程序TaskService，接入后端API
- [ ] **验证**：小程序能够创建和查看云端任务

**具体操作**：
1. 修改TaskService，使用HttpClient代替本地Repository
2. 实现双写策略
3. 实现离线降级机制
4. 测试云端任务创建和查看

**TaskService改造示例**：
```javascript
class TaskService {
  async createTask(taskData) {
    // 双写策略：先写云端，再写本地
    return await createTaskWithDualWrite(taskData);
  }

  async getTasks(filters) {
    // 降级策略：先读云端，失败则读本地
    return await getTasksWithFallback(filters);
  }
}
```

---

### 第5步：集成测试（1天）

- [ ] **任务**：小程序端和后端联调测试
- [ ] **验证**：端到端流程正常

**具体操作**：
1. 测试创建任务（云端+本地）
2. 测试查看任务（云端+本地）
3. 测试离线降级
4. 验证数据一致性
5. 测试错误处理

**测试脚本**：
```javascript
// 测试创建任务
const createResult = await createTask(taskData);
console.log('创建任务结果：', createResult);

// 测试查看任务
const getTasksResult = await getTasks();
console.log('任务列表：', getTasksResult);

// 验证双写
const localTask = await storageAdapter.get(`tasks/${createResult.taskId}`);
const cloudTask = await HttpClient.get(`/api/tasks/${createResult.taskId}`);
console.log('双写验证：', { local: localTask, cloud: cloudTask });
```

---

### 第6步：部署上线（1天）

- [ ] **任务**：部署到生产环境，实施渐进迁移
- [ ] **验证**：生产环境正常运行，数据一致性

**具体操作**：
1. 配置生产环境变量
2. 部署到生产服务器
3. 配置MySQL连接
4. 启动服务
5. 配置监控和告警
6. 灰度发布（小范围测试）

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 创建任务 | POST /api/tasks | 任务创建成功 |
| 获取任务列表 | GET /api/tasks | 返回任务列表 |
| 获取任务详情 | GET /api/tasks/:taskId | 返回任务详情 |
| SQL修复验证 | 直接执行SQL | 无语法错误 |
| 参数验证 | 提交无效参数 | 返回错误 |
| 权限验证 | 访问他人任务 | 返回403错误 |

### 集成测试

- [ ] 场景1：创建任务 → 查看任务 → 验证数据
- [ ] 场景2：云端创建 → 本地备份 → 验证一致性
- [ ] 场景3：云端失败 → 降级到本地 → 继续使用
- [ ] 场景4：小程序创建 → 云端存储 → 验证入库

### 手动测试

**功能测试**：
- [ ] 任务创建功能正常
- [ ] 任务查看功能正常
- [ ] 双写策略正常工作
- [ ] 离线降级正常工作
- [ ] 数据正确存储在MySQL
- [ ] 数据一致性正常

**回归测试**：
- [ ] 确认API响应格式正确
- [ ] 确认错误处理正常
- [ ] 确认日志记录正常

### 端到端验证

**完整流程测试**：
1. ✅ 小程序调用创建任务API
2. ✅ 任务保存到MySQL
3. ✅ 本地也保存备份（双写）
4. ✅ 小程序调用查看任务API
5. ✅ 从MySQL获取任务列表
6. ✅ 数据正确返回
7. ✅ 端到端流程验证通过

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| SQL修复不完整 | 高 | 低 | 充分测试SQL语句 |
| 双写策略冲突 | 中 | 中 | 设计重试机制 |
| 数据一致性问题 | 高 | 中 | 添加数据验证 |
| 离线降级失败 | 中 | 低 | 保留本地数据备份 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 用户体验下降 | 中 | 中 | 优化网络请求 |
| 数据迁移风险 | 高 | 低 | 双写策略保障 |
| API性能问题 | 中 | 低 | 添加缓存机制 |

---

## 附录

### 环境配置信息

基于里程碑-05A的环境配置，无需新增配置。

### 审核要点

- [ ] **技术选型合理**：基于里程碑-05A，技术栈一致
- [ ] **数据库设计正确**：tasks表结构合理，索引优化
- [ ] **API设计规范**：遵循RESTful，接口完整
- [ ] **双写策略合理**：数据安全有保障
- [ ] **实施步骤清晰**：可以按步骤执行
- [ ] **风险可控**：识别了主要风险

---

## 后续步骤

### 里程碑-06前置条件

**里程碑-05B完成** → **可以启动里程碑-06**

**里程碑-06主要内容**：
- 家庭账户功能实现
- 数据隔离机制
- 家庭成员邀请
- 家庭设置前端页面

---

**最后更新**：2026-03-08
**维护者**：项目维护团队
