# 学习任务微信小程序文档索引

> **重要通知**: 本目录下的所有文档已迁移至项目根目录的 `docs/` 文件夹。
> **请不要继续使用或更新本目录下的文档**。所有文档更新应在 `docs/` 目录进行。

## 文档新位置

所有文档现已统一移至项目根目录的 `docs/` 文件夹，按以下结构组织：

```
docs/
├── architecture/       # 架构文档
│   ├── project_structure.md    # 项目结构
│   ├── data_models.md          # 数据模型
│   ├── system_architecture.md  # 系统架构
│   ├── star_points_system.md   # 星星有效期与消费机制
│   └── optimization_summary.md # 优化总结
├── development/       # 开发指南
│   ├── workflow.md             # 开发工作流程
│   ├── coding_standards.md     # 编码规范
│   ├── troubleshooting.md      # 常见问题解决
│   └── CHANGELOG.md            # 更新日志
├── api/               # API文档
│   └── utils_guide.md          # 工具函数指南
├── user/              # 用户手册
│   ├── guide.md                # 用户指南
│   └── faq.md                  # 常见问题解答
└── README.md          # 项目总览
```

## 文档管理规则

根据项目规则（见 `.cursorrules` 文件），所有文档必须：

1. 统一存放在 `docs/` 目录下
2. 按功能分类存放在对应子目录
3. 在修改代码时同步更新
4. 定期清理过时内容
5. 遵循统一命名规则（小写字母和连字符）

## 文档迁移状态

所有文档均已完成迁移：

- [x] 项目结构文档 - 已迁移至 `docs/architecture/project_structure.md`
- [x] 数据模型文档 - 已迁移至 `docs/architecture/data_models.md`
- [x] 开发工作流程 - 已迁移至 `docs/development/workflow.md`
- [x] 编码规范 - 已迁移至 `docs/development/coding_standards.md`
- [x] 工具函数指南 - 已迁移至 `docs/api/utils_guide.md`
- [x] 故障排除指南 - 已迁移至 `docs/development/troubleshooting.md`
- [x] 系统架构文档 - 已迁移至 `docs/architecture/system_architecture.md`
- [x] 优化内容总结 - 已迁移至 `docs/architecture/optimization_summary.md`
- [x] 星星有效期机制 - 已迁移至 `docs/architecture/star_points_system.md`
- [x] 用户指南 - 已迁移至 `docs/user/guide.md`
- [x] 常见问题解答 - 已迁移至 `docs/user/faq.md`
- [x] 更新日志 - 已迁移至 `docs/development/CHANGELOG.md`

**重要提示**：请立即开始使用新的文档位置，本目录下的文档将不再更新。

## 文档使用说明

1. **项目开发参考**：请查阅 `docs/` 目录下的最新文档
2. **代码规范遵循**：按照 `docs/development/workflow.md` 中的规范编写代码
3. **组件和工具使用**：使用组件和工具函数前参考对应指南文档
4. **项目进度跟踪**：查看 `docs/` 下的相关文档了解当前完成情况

## 文档迁移提示

1. 本目录下的所有内容已迁移到 `docs/` 目录
2. 新文档应直接创建在 `docs/` 目录下对应子目录中
3. 修复代码时，应更新 `docs/` 目录下的相关文档
4. 历史文档仅作为参考，不再更新
5. 如有需要参考本目录的旧文档，请确保先查看`docs/`目录中的最新版本

## 文档维护规则

1. 每次重大功能更新后，及时更新相关文档
2. 核心架构变更需要同步更新系统文档
3. 新增组件或工具函数需要在对应指南中添加说明
4. 清理过时或冗余文档，保持文档整洁
5. 文档更新后，在本索引中添加更新记录 