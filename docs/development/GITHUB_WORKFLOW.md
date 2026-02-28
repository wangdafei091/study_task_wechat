# GitHub 协作流程

> 团队协作规范、PR流程、Issue管理
> **最后更新**：2026-02-27

---

## 📋 目录

- [分支管理策略](#分支管理策略)
- [提交流程](#提交流程)
- [PR 流程](#pr-流程)
- [Issue 流程](#issue-流程)
- [代码审查](#代码审查)
- [发布流程](#发布流程)
- [常见问题](#常见问题)

---

## 分支管理策略

### 分支类型

| 分支类型 | 命名规范 | 说明 | 生命周期 |
|---------|---------|------|---------|
| `main` | - | 主分支，稳定版本 | 长期存在 |
| `develop` | - | 开发分支（可选） | 长期存在 |
| `feature/*` | `feature/功能描述` | 功能开发分支 | 合并后删除 |
| `fix/*` | `fix/问题描述` | Bug修复分支 | 合并后删除 |
| `hotfix/*` | `hotfix/紧急问题描述` | 紧急修复分支 | 合并后删除 |
| `refactor/*` | `refactor/重构描述` | 重构分支 | 合并后删除 |

### 分支命名示例

```bash
# 功能开发
git checkout -b feature/task-calendar-view
git checkout -b feature/star-reward-system

# Bug修复
git checkout -b fix/task-status-sync-error
git checkout -b fix/star-calculation-bug

# 紧急修复
git checkout -b hotfix/critical-data-loss

# 重构
git checkout -b refactor/optimize-data-loading
git checkout -b refactor/simplify-service-layer
```

---

## 提交流程

### Commit 规范

使用 Conventional Commits 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加任务日历视图` |
| `fix` | Bug修复 | `fix: 修复星星计算错误` |
| `docs` | 文档更新 | `docs: 更新API文档` |
| `style` | 代码格式（不影响功能） | `style: 调整代码缩进` |
| `refactor` | 重构（不是新功能也不是修复） | `refactor: 简化服务层` |
| `perf` | 性能优化 | `perf: 优化大量数据加载` |
| `test` | 测试相关 | `test: 添加单元测试` |
| `chore` | 构建/工具配置 | `chore: 更新ESLint配置` |
| `revert` | 回滚提交 | `revert: feat: xxx` |

#### Commit 消息示例

**好的 Commit 消息**：
```bash
feat(task): 添加任务完成功能

- 新增 completeTask 接口
- 实现任务状态变更
- 添加星星积分计算
- 发布任务完成事件

Closes #123
```

```bash
fix(star): 修复星星积分延迟问题

问题：任务完成后星星没有立即显示
原因：setData调用时机错误
修复：合并setData调用

Fixes #456
```

**不好的 Commit 消息**：
```bash
# ❌ 太模糊
fix bug

# ❌ 太长，没有结构
I fixed the bug where the stars weren't showing up correctly when the user completes a task, so I changed the way we handle the data and now it works better

# ❌ 没有类型
添加了任务完成功能
```

---

## PR 流程

### 创建 PR

1. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature
   git add .
   git commit -m "feat: 添加新功能"
   git push origin feature/your-feature
   ```

2. **确保代码质量**
   ```bash
   # 运行测试
   npm test

   # 检查代码规范
   npm run lint

   # 检查代码格式
   npm run format:check
   ```

3. **在 GitHub 上创建 PR**
   - 填写 PR 模板
   - 关联相关 Issue
   - 标记合适的标签

### PR 模板

创建 PR 时会自动显示以下模板：

```markdown
## 变更类型
- [ ] Bug修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新
- [ ] 性能优化
- [ ] 测试补充

## 变更描述
<!-- 描述本次PR的主要变更内容 -->

## 变更原因
<!-- 说明为什么需要进行这次变更 -->

## 相关设计文档
<!-- 如果是新功能，请关联设计文档 -->
- [ ] `docs/design/[feature-name].md`（已审核通过 ✅）
- [ ] 无设计文档（仅修复Bug或小幅优化）

## 测试情况
- [ ] 单元测试已通过 (`npm test`)
- [ ] 集成测试已通过
- [ ] 手动测试已完成
- [ ] 测试覆盖率达标 (`npm run test:coverage`，目标85%+）

## 代码质量
- [ ] 代码符合项目规范 (`npm run lint` 无错误)
- [ ] 代码格式符合规范 (`npm run format:check` 无差异)
- [ ] 已添加必要的中文注释
- [ ] 已添加关键操作logger日志
- [ ] 无console.log或debugger残留

## 架构检查
- [ ] 遵循DDD架构原则
- [ ] 通过ServiceManager访问服务
- [ ] 使用EventBus进行跨服务通信
- [ ] 批量操作使用batchUtils
- [ ] 数据访问通过Repository层

## UI检查（如涉及UI变更）
- [ ] UI符合规范（颜色、间距、圆角等）
  - [ ] 卡片内边距：30rpx，圆角：16rpx
  - [ ] 按钮高度：90rpx，圆角：8rpx
  - [ ] 任务类型颜色正确（学习#4285F4、习惯#4CAF50、兴趣#FF9800）
  - [ ] 字体大小符合规范（标题32rpx/500-600、正文28rpx/400、辅助24rpx/400）
  - [ ] 间距符合规范（12rpx小间距、24rpx标准间距）

## 性能检查
- [ ] 无性能问题（合并setData、避免频繁调用）
- [ ] 大量数据使用batchUtils批量处理

## 文档更新
- [ ] 已更新相关文档（参考 workflow.md 的文档维护章节）
  - [ ] 新增/修改服务/仓储 → 更新 `docs/api/services-guide.md` 或 `repositories.md`
  - [ ] 新功能 → 更新 `docs/development/CHANGELOG.md`
  - [ ] 修复常见问题 → 更新 `docs/development/troubleshooting.md`
  - [ ] 架构调整 → 更新 `docs/architecture/*.md`
  - [ ] 发现新陷阱 → 更新 `CLAUDE.md`
  - [ ] 新功能 → 创建或更新 `docs/design/[feature-name].md`

## 错误处理
- [ ] 异步操作都有try-catch包裹
- [ ] 错误都通过logger记录
- [ ] 返回用户友好的错误信息

## 相关Issue
<!-- 如果这个PR修复了某个Issue，请关联 -->
- Closes #XXX
```

### PR 标签

| 标签 | 说明 | 使用场景 |
|------|------|---------|
| `enhancement` | 新功能 | 新增功能特性 |
| `bug` | Bug修复 | 修复问题 |
| `documentation` | 文档更新 | 仅文档变更 |
| `performance` | 性能优化 | 性能改进 |
| `refactoring` | 重构 | 代码重构 |
| `breaking` | 破坏性变更 | 影响现有功能 |
| `wip` | 进行中 | 未完成的工作 |
| `review` | 待审查 | 等待审查 |
| `approved` | 已批准 | 审查通过 |
| `changes-requested` | 需要修改 | 审查意见 |

### PR 合并策略

| 策略 | 说明 | 使用场景 |
|------|------|---------|
| `Squash and merge` | 压缩所有 commits 为一个 | 功能开发、Bug修复（推荐） |
| `Rebase and merge` | 保留提交历史，合并到目标分支 | 持续集成的功能分支 |
| `Merge commit` | 创建合并提交，保留完整历史 | 紧急修复、重大功能 |

**推荐**：大多数情况下使用 `Squash and merge`，保持主分支历史清晰。

---

## Issue 流程

### 创建 Issue

使用 Issue 模板创建：

#### Bug 报告模板

```markdown
## Bug 描述
<!-- 简要描述bug的情况 -->

## 复现步骤
<!-- 描述如何触发这个bug，越详细越好 -->

1. 打开
2. 点击
3. 滚动到
4. 发生错误

## 期望行为
<!-- 描述期望的正确行为 -->

## 实际行为
<!-- 描述实际发生的情况 -->

## 截图/录屏
<!-- 如果有，请附上截图或录屏 -->

## 环境信息
- **微信开发者工具版本**：
- **基础库版本**：
- **操作系统**：
- **设备型号**：
- **小程序版本**：如果知道的话

## 其他信息
<!-- 任何其他有助于解决问题的信息 -->
- 是否有报错日志？
- 是否尝试过解决？如何解决的？
```

#### 功能建议模板

```markdown
## 功能描述
<!-- 简要描述你想要的新功能 -->

## 问题背景
<!-- 说明这个功能要解决什么问题或痛点 -->
- 当前的问题是什么？
- 这个问题在什么场景下出现？
- 对用户有什么影响？

## 解决方案
<!-- 描述你的实现思路或期望 -->
- 你期望这个功能如何工作？
- 期望的用户体验是什么？
- 有没有参考的其他应用？

## 替代方案
<!-- 是否有其他实现方案，为什么选择当前方案 -->

## 优先级
<!-- 请选择你认为的优先级 -->
- [ ] 高（P0）- 阻碍使用或严重影响体验
- [ ] 中（P1）- 影响体验但可暂时接受
- [ ] 低（P2）- 锦上添花的功能

## 其他信息
<!-- 任何其他有助于实现这个功能的信息 -->
- 是否有相关的设计稿或参考链接？
- 是否有其他应用已经实现了类似功能？
```

### Issue 标签

| 标签 | 说明 |
|------|------|
| `bug` | Bug 报告 |
| `enhancement` | 功能建议 |
| `documentation` | 文档相关 |
| `question` | 问题咨询 |
| `performance` | 性能问题 |
| `good first issue` | 适合新手 |
| `help wanted` | 需要帮助 |
| `priority:high` | 高优先级 |
| `priority:medium` | 中优先级 |
| `priority:low` | 低优先级 |

---

## 代码审查

### 审查清单

审查 PR 时，检查以下内容：

#### 功能性
- [ ] 功能是否按预期工作？
- [ ] 是否处理了边界情况？
- [ ] 错误处理是否完善？

#### 代码质量
- [ ] 代码是否易于理解？
- [ ] 是否遵循项目编码规范？
- [ ] 变量和函数命名是否清晰？
- [ ] 是否有冗余代码？
- [ ] 是否有魔法数字或字符串？

#### 架构设计
- [ ] 是否遵循DDD架构？
- [ ] 是否通过ServiceManager访问服务？
- [ ] 服务间通信是否使用EventBus？
- [ ] 数据访问是否通过Repository层？
- [ ] 是否违反项目约束？

#### 测试
- [ ] 是否有足够的单元测试？
- [ ] 测试覆盖率是否达标（85%+）？
- [ ] 测试用例是否覆盖主要场景？

#### 文档
- [ ] 是否更新了相关文档？
- [ ] 文档是否与代码一致？
- [ ] 是否有必要的注释？

#### 性能
- [ ] 是否有性能问题？
- [ ] 是否使用了batchUtils处理大量数据？
- [ ] setData调用是否合并？

#### UI/UX（如涉及）
- [ ] UI是否符合规范？
- [ ] 交互是否流畅？
- [ ] 错误提示是否友好？

### 审查流程

1. **提出审查意见**
   - 使用 GitHub 的 Review 功能
   - 标注具体的代码行
   - 说明问题和改进建议

2. **讨论和修改**
   - 开发者回应审查意见
   - 进行必要的修改
   - 重新提交审查

3. **批准或拒绝**
   - 审查通过：标记 `approved` 标签
   - 需要修改：标记 `changes-requested` 标签

4. **合并 PR**
   - 所有审查通过后合并
   - 删除功能分支

---

## 发布流程

### 版本号规范

使用语义化版本（Semantic Versioning）：

```
MAJOR.MINOR.PATCH

MAJOR：不兼容的API变更
MINOR：向下兼容的功能新增
PATCH：向下兼容的Bug修复
```

#### 版本号示例

- `3.2.0` - 新增功能
- `3.2.1` - Bug修复
- `4.0.0` - 重大变更（不兼容）

### 发布步骤

1. **更新版本号**
   ```bash
   # 编辑 package.json
   "version": "3.2.0"

   # 编辑 app.json
   "version": "3.2.0"
   ```

2. **更新 CHANGELOG.md**
   ```markdown
   ## [3.2.0] - 2026-02-27

   ### 新增
   - 添加xxx功能

   ### 修复
   - 修复xxx问题

   ### 优化
   - 优化xxx性能
   ```

3. **运行项目健康检查**
   ```bash
   npm run health-check
   ```

4. **提交到主分支**
   ```bash
   git add package.json app.json CHANGELOG.md
   git commit -m "chore: release v3.2.0"
   git push origin main
   ```

5. **创建版本标签**
   ```bash
   git tag -a v3.2.0 -m "Release v3.2.0"
   git push origin v3.2.0
   ```

6. **使用微信开发者工具上传代码**
   - 打开微信开发者工具
   - 点击"上传"按钮
   - 填写版本号和备注
   - 提交审核

---

## 常见问题

### Q: 如何快速开始一个新功能？

A:
```bash
# 1. 拉取最新代码
git checkout main
git pull origin main

# 2. 创建功能分支
git checkout -b feature/your-feature

# 3. 开始开发
# ... 编写代码 ...

# 4. 提交代码
git add .
git commit -m "feat: 添加新功能"

# 5. 推送到远程
git push origin feature/your-feature

# 6. 在 GitHub 创建 PR
```

---

### Q: 如何修复紧急 Bug？

A:
```bash
# 1. 创建 hotfix 分支（从 main）
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. 快速修复
# ... 修复代码 ...

# 3. 提交并推送
git add .
git commit -m "fix: 修复紧急Bug"
git push origin hotfix/critical-bug

# 4. 创建 PR，标记为高优先级
# 使用 hotfix 策略，快速合并
```

---

### Q: PR 审查被拒绝怎么办？

A:
1. 仔细阅读审查意见
2. 在功能分支上进行修改
3. 提交修改
4. 推送到远程
5. PR 会自动更新，等待再次审查

---

### Q: 如何回滚一个错误的合并？

A:
```bash
# 1. 回滚到指定 commit
git revert <commit-hash>

# 2. 推送到主分支
git push origin main
```

---

### Q: 如何处理多个 PR 冲突？

A:
```bash
# 1. 更新主分支
git checkout main
git pull origin main

# 2. 更新功能分支
git checkout feature/your-feature
git pull origin feature/your-feature

# 3. 合并主分支到功能分支
git merge main

# 4. 解决冲突
# 编辑冲突文件...

# 5. 提交合并
git add .
git commit -m "chore: merge main into feature branch"

# 6. 推送
git push origin feature/your-feature
```

---

## 相关文档

- **[CLAUDE.md](../../CLAUDE.md)** - AI 助手工作指南
- **[开发指南](workflow.md)** - 开发流程和文档维护规范
- **[编码规范](coding_standards.md)** - 编码规范权威来源（命名、代码风格、UI规范、日志规范等）
- **[更新日志](CHANGELOG.md)** - 版本变更历史

---

**最后更新**：2026-02-27
**维护者**：项目维护团队
