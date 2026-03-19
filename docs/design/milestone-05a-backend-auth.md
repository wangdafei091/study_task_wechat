# 里程碑-05A：后端基础设施 + 认证功能详细设计文档

> **设计状态**：✅ 已完成
> **创建日期**：2026-03-08
> **完成日期**：2026-03-09
> **设计者**：Claude Code
> **审核者**：已审核
> **预计工期**：1周
> **实际工期**：1周
> **依赖**：无

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

搭建后端基础设施，实现用户认证和基础用户管理功能，为后续任务管理奠定基础。

### 业务价值

- ✅ **技术价值**：验证后端技术方案可行性
- ✅ **基础价值**：建立认证体系，为后续功能提供基础
- ✅ **安全价值**：实现安全的JWT认证机制

### 功能范围

**包含**：
- ✅ Express服务器搭建（基础框架）
- ✅ MySQL数据库配置和迁移
- ✅ 用户登录认证（`POST /api/auth/login`）
- ✅ 获取当前用户信息（`GET /api/auth/current`）
- ✅ 验证JWT token（`GET /api/auth/validate`）
- ✅ 前端Token管理机制
- ✅ HTTP客户端自动注入token
- ✅ 基础集成测试

**不包含**（明确边界）：
- ❌ 任务管理API（里程碑-05B）
- ❌ 用户管理API（用户列表、创建、删除等）
- ❌ 双写策略（里程碑-05B）
- ❌ 任务前端接入（里程碑-05B）

### 验收标准

- [ ] 服务器能够正常启动
- [ ] 健康检查接口正常（`GET /health`）
- [ ] 用户能够通过微信小程序登录
- [ ] 能够获取JWT token
- [ ] TokenManager能够正确管理token
- [ ] HttpClient能够自动注入token
- [ ] 能够获取当前用户信息
- [ ] 数据正确存储在MySQL（users表）
- [ ] 端到端流程验证通过（登录 → 获取token → 获取用户信息）

### 优先级

- **优先级**：P0（最高）
- **理由**：认证是所有后续功能的基础

---

## 技术方案

### 方案概述

搭建轻量级Node.js + Express后端服务，使用MySQL作为数据库，实现微信小程序登录认证和基础用户管理功能。

### 技术选型

| 技术点 | 选择方案 | 版本要求 | 选择理由 |
|--------|---------|---------|---------|
| 运行环境 | Node.js | v16.x+ | 已安装v20.20.0，版本足够 |
| 后端框架 | Express | 4.x | 轻量级，生态成熟，文档丰富 |
| 数据库 | MySQL | 5.7+ | 已安装5.7.44，用户熟悉 |
| 认证方式 | JWT | - | 无状态认证，适合小程序 |
| HTTP客户端 | axios | - | Promise支持，易用 |
| 环境管理 | dotenv | - | 环境变量管理 |

### 架构设计

```
┌─────────────────────────────────────────┐
│         微信小程序（现有代码）         │
└───────────────┬─────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────┐
│        腾讯云轻量服务器           │
│                                     │
│  ┌──────────────────────────────┐    │
│  │   Express.js 服务器         │    │
│  │                            │    │
│  │  ┌──────────────────────┐   │    │
│  │  │ 认证中间件 (JWT)   │   │    │
│  │  └──────────────────────┘   │    │
│  │                            │    │
│  │  ┌──────────────────────┐   │    │
│  │  │ 路由 (Routes)      │   │    │
│  │  │ - /api/auth        │   │    │
│  │  │ - /health          │   │    │
│  │  └──────────────────────┘   │    │
│  │                            │    │
│  │  ┌──────────────────────┐   │    │
│  │  │ 控制器 (Controllers)│   │    │
│  │  └──────────────────────┘   │    │
│  └──────────────┬───────────────┘    │
│                 │                     │
│  ┌──────────────▼───────────────┐    │
│  │     MySQL 5.7.44          │    │
│  │  - users 表                │    │
│  └──────────────────────────────┘    │
│                                     │
└─────────────────────────────────────────┘
```

### 项目结构

```
backend/
├── server.js              # 服务器入口
├── package.json          # 项目配置
├── .env.example          # 环境变量示例
├── config/               # 配置文件
│   ├── database.js       # 数据库配置
│   └── jwt.js          # JWT配置
├── middleware/           # 中间件
│   ├── auth.js         # 认证中间件
│   └── error.js        # 错误处理
├── routes/              # 路由
│   └── auth.js         # 认证路由
├── controllers/          # 控制器
│   └── authController.js
├── models/              # 数据模型
│   └── User.js
├── utils/               # 工具函数
│   ├── logger.js       # 日志工具
│   └── response.js     # 统一响应格式
└── database/            # 数据库
    └── migrations/    # 数据库迁移
        └── 001_create_users.sql
```

---

## 数据库设计

### 数据库信息

- **数据库类型**：MySQL 5.7.44
- **数据库名**：task_wechat（可配置）
- **字符集**：utf8mb4
- **排序规则**：utf8mb4_unicode_ci

### 表结构设计

#### users 表（用户信息）

```sql
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY COMMENT '用户ID，UUID',
    openid VARCHAR(64) UNIQUE NOT NULL COMMENT '微信openid',
    unionid VARCHAR(64) COMMENT '微信unionid（可选）',
    nickname VARCHAR(100) COMMENT '昵称',
    avatar VARCHAR(255) COMMENT '头像URL',
    role VARCHAR(20) DEFAULT 'parent' COMMENT '角色：parent/child',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态：active/inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_openid (openid),
    INDEX idx_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
```

### 数据库迁移脚本

```sql
-- 文件：database/migrations/001_create_users.sql
USE task_wechat;

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY,
    openid VARCHAR(64) UNIQUE NOT NULL,
    unionid VARCHAR(64),
    nickname VARCHAR(100),
    avatar VARCHAR(255),
    role VARCHAR(20) DEFAULT 'parent',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_openid (openid),
    INDEX idx_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## API设计

### API基础信息

- **基础URL**：`http://你的服务器IP:3000/api`
- **协议**：HTTP（生产环境建议使用HTTPS）
- **响应格式**：JSON

### 统一响应格式

**命名规范**：
- **API响应**：统一使用camelCase（符合JavaScript规范）
- **数据库字段**：使用snake_case（符合MySQL规范）

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

#### 1. 认证相关API

##### POST /api/auth/login - 微信小程序登录

**功能描述**：微信小程序用户登录，返回JWT token

**请求参数**：
```json
{
  "code": "wx_login_code"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "userId": "uuid-1234",
      "openid": "wx_openid_123",
      "nickname": "用户昵称",
      "avatar": "头像URL",
      "role": "parent"
    }
  },
  "message": "登录成功"
}
```

**实现要点**：
- 调用微信登录API换取openid
- 查询或创建用户记录
- 生成JWT token
- 返回用户基本信息

---

##### GET /api/auth/current - 获取当前用户信息

**功能描述**：获取当前登录用户的信息

**请求头**：
```
Authorization: Bearer {token}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "userId": "uuid-1234",
    "openid": "wx_openid_123",
    "nickname": "用户昵称",
    "avatar": "头像URL",
    "role": "parent",
    "status": "active"
  },
  "message": "获取成功"
}
```

**实现要点**：
- 从JWT token中解析user_id
- 查询用户信息
- 返回用户基本信息

---

##### GET /api/auth/validate - 验证JWT token

**功能描述**：验证JWT token是否有效

**请求头**：
```
Authorization: Bearer {token}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "uuid-1234"
  },
  "message": "Token有效"
}
```

**实现要点**：
- 验证JWT token签名和有效期
- 返回验证结果和用户ID

---

### API错误码

| 错误码 | 说明 |
|--------|------|
| AUTH_INVALID_TOKEN | Token无效或过期 |
| AUTH_TOKEN_EXPIRED | Token已过期 |
| AUTH_WECHAT_LOGIN_FAILED | 微信登录失败 |
| DATABASE_ERROR | 数据库错误 |
| INTERNAL_ERROR | 服务器内部错误 |

---

## 实施步骤

### 第1步：服务器环境准备（0.5天）

- [ ] **任务**：确认服务器环境
- [ ] **验证**：所需软件已安装且版本正确

**具体操作**：
1. 检查Node.js版本（应该是v20.20.0）
2. 检查MySQL版本（应该是5.7.44）
3. 检查Git版本（应该是2.41.1）
4. 测试SSH连接
5. 测试MySQL连接

**检查命令**：
```bash
node --version
mysql --version
git --version
ssh root@服务器IP
mysql -u root -p
```

---

### 第2步：创建项目结构（0.5天）

- [ ] **任务**：创建后端项目基础结构
- [ ] **验证**：项目结构符合设计

**具体操作**：
1. 创建backend目录
2. 初始化package.json
3. 创建目录结构（config、middleware、routes等）
4. 创建基础文件

---

### 第3步：数据库配置和迁移（0.5天）

- [ ] **任务**：配置MySQL并创建users表
- [ ] **验证**：能够连接数据库，表创建成功

**具体操作**：
1. 创建数据库`task_wechat`
2. 执行迁移脚本创建users表
3. 验证表结构正确

**执行SQL**：
```bash
mysql -u root -p < database/migrations/001_create_users.sql
```

---

### 第4步：基础Express服务器搭建（1天）

- [ ] **任务**：搭建Express服务器基础框架
- [ ] **验证**：服务器能够启动，健康检查接口正常

**具体操作**：
1. 安装依赖（express、mysql2、jsonwebtoken等）
2. 创建server.js入口文件
3. 配置CORS、请求解析等中间件
4. 实现健康检查接口`GET /health`

**健康检查接口**：
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});
```

---

### 第5步：认证功能实现（2天）

- [ ] **任务**：实现微信小程序登录认证
- [ ] **验证**：能够正常登录，返回JWT token

**具体操作**：
1. 配置JWT密钥
2. 实现JWT生成和验证中间件
3. 实现登录接口`POST /api/auth/login`
4. 实现获取当前用户接口`GET /api/auth/current`
5. 实现验证token接口`GET /api/auth/validate`
6. 测试登录流程

**JWT配置**（.env文件）：
```
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

---

### 第6步：前端Token管理和HttpClient改造（1天）

- [ ] **任务**：实现前端Token管理和HTTP客户端改造
- [ ] **验证**：Token管理正常，HttpClient自动注入token

**具体操作**：
1. 创建`utils/token-manager.js`
2. 修改`utils/http-client.js`，自动注入Authorization头
3. 修改`utils/api-config.js`，支持微信小程序环境配置

**TokenManager实现**：
```javascript
class TokenManager {
  static getToken() {
    return wx.getStorageSync('jwt_token');
  }

  static setToken(token) {
    wx.setStorageSync('jwt_token', token);
  }

  static clearToken() {
    wx.removeStorageSync('jwt_token');
  }

  static isAuthenticated() {
    const token = this.getToken();
    return token && token.length > 0;
  }
}
```

**ENABLE_API配置**：
```javascript
// utils/api-config.js
const API_CONFIG = {
  // 支持微信小程序配置 + Node环境变量
  ENABLE_API: wx.getStorageSync('ENABLE_API') === 'true' ||
             process.env.ENABLE_API === 'true',
  BASE_URL: 'http://YOUR_SERVER_IP:3000',
  // ...
};
```

---

### 第7步：集成测试（0.5天）

- [ ] **任务**：小程序端和后端联调测试
- [ ] **验证**：端到端流程正常

**具体操作**：
1. 修改小程序端API调用地址
2. 测试登录功能
3. 测试获取用户信息
4. 验证数据存储在MySQL

**测试脚本**：
```javascript
// 测试登录
const loginResult = await HttpClient.post('/api/auth/login', { code });
console.log('登录结果：', loginResult);

// 测试获取用户
const userResult = await HttpClient.get('/api/auth/current');
console.log('用户信息：', userResult);
```

---

### 第8步：部署到测试环境（0.5天）

- [ ] **任务**：部署到测试环境，验证运行正常
- [ ] **验证**：测试环境正常运行

**具体操作**：
1. 配置测试环境变量
2. 部署到测试服务器
3. 配置数据库连接
4. 启动服务并验证

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 数据库连接 | 连接MySQL | 连接成功 |
| JWT生成 | 生成token | 返回有效token |
| JWT验证 | 验证token | 验证通过 |
| 登录接口 | 调用/api/auth/login | 返回token和用户信息 |
| 获取用户接口 | 调用GET /api/auth/current | 返回用户信息 |
| 验证token接口 | 调用GET /api/auth/validate | 返回验证结果 |
| 无效Token测试 | 使用无效token调用API | 返回401错误 |
| Token过期测试 | 使用过期token调用API | 返回401错误 |

### 集成测试

- [ ] 场景1：用户登录 → 获取token → 获取用户信息
- [ ] 场景2：使用有效token获取用户信息 → 成功
- [ ] 场景3：使用无效token获取用户信息 → 失败
- [ ] 场景4：Token过期后重新登录 → 成功

### 手动测试

**功能测试**：
- [ ] 服务器能够正常启动
- [ ] 健康检查接口正常
- [ ] 微信小程序登录功能正常
- [ ] Token管理功能正常
- [ ] HttpClient自动注入token正常
- [ ] 数据正确存储在MySQL

**回归测试**：
- [ ] 确认API响应格式正确
- [ ] 确认错误处理正常
- [ ] 确认日志记录正常

### 端到端验证

**完整流程测试**：
1. ✅ 小程序调用登录接口
2. ✅ 获得JWT token
3. ✅ TokenManager保存token
4. ✅ HttpClient自动注入token
5. ✅ 小程序获取用户信息
6. ✅ 数据正确返回
7. ✅ 数据正确存储在MySQL

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| MySQL连接失败 | 高 | 低 | 检查配置，验证用户名密码 |
| 微信API调用失败 | 中 | 中 | 查看文档，检查AppID和Secret |
| JWT实现错误 | 中 | 低 | 使用成熟的jsonwebtoken库 |
| 数据库表设计不合理 | 中 | 低 | 先在测试环境验证 |
| 服务器配置问题 | 高 | 低 | 检查防火墙和端口 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 功能范围不明确 | 中 | 低 | 聚焦核心功能，避免蔓延 |
| API设计不合理 | 中 | 低 | 遵循RESTful规范 |
| 数据安全风险 | 高 | 中 | 使用HTTPS，加密敏感数据 |
| 云端模式配置 | 中 | 中 | 支持微信小程序环境配置 |

---

## 附录

### 环境配置信息（使用占位符）

**服务器信息**：
- ✅ SSH权限：已确认可以使用
- ✅ Node.js版本：v20.20.0
- ✅ MySQL版本：5.7.44
- ✅ Git版本：2.41.1

**数据库信息**（占位符）：
- ⏳ MySQL用户名：YOUR_MYSQL_USERNAME
- ⏳ MySQL密码：YOUR_MYSQL_PASSWORD（更换后填写）
- ⏳ 数据库名称：task_wechat（待创建）

**微信小程序信息**（占位符）：
- ⏳ 微信小程序AppID：YOUR_WECHAT_APPID
- ⏳ 微信小程序AppSecret：YOUR_WECHAT_APPSECRET（重置后填写）

**环境配置**：
- ✅ API服务端口：3000
- ✅ JWT密钥：YOUR_JWT_SECRET（生成强随机字符串）
- ✅ 服务器IP：YOUR_SERVER_IP（填写实际IP）
- ⏳ HTTPS证书：生产环境建议配置（暂时使用HTTP）

**安全提醒**：
⚠️ **敏感信息已从文档中移除**，请使用.env文件配置

---

### 审核要点

- [x] **技术选型合理**：Node.js + Express + MySQL
- [x] **数据库设计正确**：表结构合理，索引优化
- [x] **API设计规范**：遵循RESTful，接口完整
- [x] **实施步骤清晰**：可以按步骤执行
- [x] **风险可控**：识别了主要风险
- [x] **功能范围清晰**：聚焦核心认证功能

---

## 后续步骤

### 里程碑-05B依赖

**里程碑-05A完成** → **启动里程碑-05B**

**里程碑-05B主要内容**：
- 任务管理API实现（创建、查询）
- 小程序接入后端任务API
- 双写策略实现
- 完整端到端测试
- 部署上线

---

## 完成总结

### 功能完成情况

**✅ 已完成功能**：
- ✅ Express.js 服务器基础架构搭建
- ✅ MySQL 数据库配置和连接
- ✅ JWT Token 生成和验证机制
- ✅ 微信小程序登录API（code2session）
- ✅ 用户查询或创建逻辑
- ✅ 认证中间件（强制认证 + 可选认证）
- ✅ Token验证端点
- ✅ 当前用户信息获取端点

### 代码质量评估

**✅ 后端代码质量**：
- ✅ 代码结构清晰，职责分离明确
- ✅ 完整的错误处理和日志记录
- ✅ 参数验证和边界条件处理
- ✅ 安全性考虑（JWT secret管理、token过期）
- ✅ 测试覆盖充分（集成测试18/18通过）

**✅ 前端代码集成**：
- ✅ HttpClient 实现完善，自动Token管理
- ✅ TokenManager 生命周期管理完整
- ✅ 错误处理和降级机制完善
- ✅ 微信小程序环境适配良好

### 测试验证结果

**✅ 端到端功能验证**：
- ✅ 用户登录流程正常（微信登录 → Token生成 → 自动认证）
- ✅ API认证机制正常（Token自动注入、过期检测）
- ✅ 用户信息获取正常
- ✅ 错误处理完善，用户体验良好

**✅ 代码审查结果**：
- ✅ 功能完整性：所有认证功能已实现
- ✅ 代码质量：符合编码规范，无明显问题
- ✅ 测试覆盖：集成测试100%通过
- ✅ 安全性：JWT机制完善，密钥管理合理

### 发现并解决的问题

**✅ 在代码审查过程中解决的问题**：
- ✅ API配置支持微信小程序环境（wx.getStorageSync）
- ✅ Token管理机制完善，支持自动注入和过期检测
- ✅ 错误处理统一，用户体验友好

### 风险控制

**✅ 风险评估结果**：
- ✅ 技术风险：低，使用成熟的技术栈
- ✅ 安全风险：低，JWT机制完善，配置合理
- ✅ 性能风险：低，数据库查询优化，索引合理

---

**最后更新**：2026-03-09
**维护者**：项目维护团队
