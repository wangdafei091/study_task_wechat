# 学习任务微信小程序文档索引

> **重要通知**: 本目录下的所有文档已迁移至项目根目录的 `docs/` 文件夹。
> **请不要继续使用或更新本目录下的文档**。所有文档更新应在 `docs/` 目录进行。

## 最新架构文档

领域驱动设计(DDD)架构的最新文档现已全部迁移到 `docs/` 目录：

- **核心架构设计**: [docs/architecture/domain-model-architecture.md](../../docs/architecture/domain-model-architecture.md)
- **领域模型**: [docs/architecture/data_models.md](../../docs/architecture/data_models.md)
- **系统架构**: [docs/architecture/system_architecture.md](../../docs/architecture/system_architecture.md)
- **星星积分系统**: [docs/architecture/star_points_system.md](../../docs/architecture/star_points_system.md)

## 文档新位置

所有文档现已统一移至项目根目录的 `docs/` 文件夹，按以下结构组织：

```
docs/
├── architecture/       # 架构文档
│   ├── project_structure.md    # 项目结构
│   ├── data_models.md          # 数据模型
│   ├── system_architecture.md  # 系统架构
│   ├── domain-model-architecture.md # 领域模型架构
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

根据项目规则，所有文档必须：

1. 统一存放在 `docs/` 目录下
2. 按功能分类存放在对应子目录
3. 在修改代码时同步更新
4. 定期清理过时内容
5. 遵循统一命名规则（小写字母和连字符）

## 文档迁移状态

所有文档均已完成迁移：

- [x] 项目结构文档 - 已迁移至 `docs/architecture/project_structure.md`
- [x] 数据模型文档 - 已迁移至 `docs/architecture/data_models.md`
- [x] 领域模型架构 - 已迁移至 `docs/architecture/domain-model-architecture.md`
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

**重要提示**：请立即开始使用新的文档位置，本目录下的文档将不再更新并可能包含过时信息。

## 新架构实现

项目现已完整实现了领域驱动设计架构，特别是在奖励系统和星星积分系统方面：

- **领域模型层**: 实体定义和业务逻辑
- **仓储层**: 数据持久化和查询
- **服务层**: 复杂业务流程协调
- **适配器层**: 底层存储和API封装

请参考 `docs/architecture/domain-model-architecture.md` 了解完整架构设计。

## 关于领域架构

项目采用领域驱动设计(DDD)架构，如需了解：

1. **架构设计**: 请查阅 `docs/architecture/domain-model-architecture.md`
2. **数据模型**: 请查阅 `docs/architecture/data_models.md` 
3. **服务实现**: 请查阅 `docs/architecture/system_architecture.md`
4. **开发指南**: 请遵循 `docs/development/workflow.md` 中的规范

**注意**: 本目录下的架构规则文档可能已过时，请以 `docs/` 目录下最新文档为准。 