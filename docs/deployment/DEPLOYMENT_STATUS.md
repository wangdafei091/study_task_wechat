# 项目部署状态文档

> **本文档记录项目的实际部署状态和服务器信息**
> **维护者**：开发团队
> **最后更新**：2026-03-12（最新）

---

## 🌐 服务器信息

### 腾讯云轻量应用服务器
- **IP地址**：`121.4.38.122`
- **系统**：OpenCloudOS
- **类型**：轻量应用服务器
- **SSH连接**：`ssh root@121.4.38.122`

### ✅ 端口配置已确认
- **API服务**：8080端口正常运行（study-task-backend）
- **AI聊天bot**：3000端口被AI服务占用
- **当前状态**：配置正确，无需修改

---

## 📁 实际部署目录

### ⚠️ 修正：文档路径错误
```bash
# ❌ 文档中的错误路径
/var/www/task-wechat-api/

# ✅ 实际路径
/www/wwwroot/study-task-backend/
```

### 目录结构
```bash
/www/wwwroot/study-task-backend/
├── server.js              # 入口文件
├── node_modules/         # 依赖包
├── .env                  # 环境变量
└── ...（其他项目文件）
```

---

## 🔌 服务状态

### 正在运行的服务
| 名称 | PID | 端口 | 模式 | 状态 | 启动时间 |
|------|-----|------|------|------|----------|
| study-task-backend | 712943 | 8080 | cluster | online | 2天前 |
| chatbot | 663057 | 3000 | fork | online | 39天前 |

### ✅ 端口配置确认
- **API服务**：8080端口正确运行（study-task-backend）
- **AI服务**：3000端口被AI聊天bot占用
- **配置状态**：已确认API配置使用8080端口

---

## 📝 API配置

### ⚠️ 需要修正
**当前配置**（utils/api-config.js 第55行）：
```javascript
BASE_URL: 'http://121.4.38.122:8080'  // 这可能是正确的
```

**建议改为**：
```javascript
BASE_URL: 'http://121.4.38.122:8080'  // 确认是8080
```

### API健康检查
```bash
# ✅ 正常
curl http://localhost:8080/health
{"status":"ok","timestamp":1773296378872,"uptime":179589.593431628,"environment":"production"}

# ❌ 错误（连接到AI服务）
curl http://localhost:3000/health
# 返回的是AI聊天bot的HTML页面
```

---

## 🗃️ 数据库信息

### ✅ 正确配置
```bash
# 数据库存在
✅ task_wechat

# 表结构正确
✅ tasks (主键: task_id)
✅ users (主键: user_id)
```

### 数据库连接
```bash
# 连命令
mysql -u root -p

# 数据库
task_wechat

# 用户
root

# 密码
4bdbff929dfd5518
```

---

## 🔍 端口使用情况

### 当前端口占用
| 端口 | 进程 | 描述 | 状态 |
|------|------|------|------|
| 3000 | 663057 (chatbot) | AI聊天服务 | 占用 |
| 8080 | 712943 (study-task) | API服务 | ✅ 正常 |

### 已确认端口分配
| 服务 | 端口 | 状态 |
|------|------|------|
| API服务 | 8080 | ✅ 使用中 |
| AI服务 | 3000 | ✅ 运行中 |

---

## 📋 PM2管理

### 当前PM2状态
```bash
┌────┬───────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┼──────────┼──────────┼──────────┬──────────┐
│ id │ name                  │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼───────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ chatbot               │ default     │ 2.3.2   │ fork    │ 663057   │ 39D    │ 0    │ online    │ 0%       │ 76.2mb   │ root     │ disabled │
│ 1  │ study-task-backend    │ default     │ 1.0.0   │ cluster │ 712943   │ 2D     │ 15   │ online    │ 0%       │ 79.8mb   │ root     │ disabled │
└────┴───────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

### PM2管理命令
```bash
# 重启我们的服务
pm2 restart study-task-backend

# 停止AI服务（如果需要）
pm2 stop chatbot

# 查看日志
pm2 logs study-task-backend
pm2 logs chatbot
```

---

## 🚨 立即行动项

### ✅ 端口配置已确认
```bash
# API服务端口：8080（已确认正确）
# 前端配置：utils/api-config.js BASE_URL 已正确设置为8080
```

### 3. 更新所有文档
- 修正部署路径
- 修正端口信息
- 更新API地址

### 4. 安全性改进
- 更换数据库密码
- 使用非root用户运行
- 配置防火墙

---

## 📞 连接和调试

### SSH连接
```bash
ssh root@121.4.38.122
cd /www/wwwroot/study-task-backend
```

### 服务检查
```bash
# 检查服务
pm2 list

# 查看日志
pm2 logs study-task-backend

# 测试API
curl http://localhost:8080/health
```

### 数据库检查
```bash
mysql -u root -p task_wechat -e "SELECT * FROM tasks LIMIT 5;"
```

---

## 🔄 更新记录

| 日期 | 更新内容 | 操作人 |
|------|----------|--------|
| 2026-03-12 | 发现端口冲突，修正部署路径 | 开发团队 |
| 2026-03-12 | 发现API配置错误，需要修正 | 开发团队 |
| 2026-03-12 | 确认数据库配置正确 | 开发团队 |
| 2026-03-12 | 发现PM2管理正常 | 开发团队 |

---

## 🚨 下一步建议

1. **立即**：解决端口冲突问题
2. **今天内**：修正API配置
3. **本周内**：更新所有相关文档
4. **下周**：配置监控和备份