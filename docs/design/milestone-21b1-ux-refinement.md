# 里程碑-21B1-UX：模板体验优化 详细设计文档

> **设计状态**：✅ 已评审通过（待实施）
> **创建日期**：2026-04-08
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **依赖文档**：`docs/design/milestone-21b1-task-template-foundation.md`
> **预计工期**：1-2天

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)

---

## 需求分析

### 背景

`M21B1` 已经完成“任务模板基础闭环”，能力上已经具备：

- 家长管理模板
- 新建任务时选择模板并填充表单
- 模板跨设备同步

但基于模拟器实操反馈，当前交互仍有明显体验问题：模板作为“辅助工具”在任务创建页中过于抢眼，容易让用户误以为“必须先有模板才能继续添加任务”；模板标签信息层级偏重、信息重复；模板管理页按钮布局不协调；模板编辑页和任务编辑页的心智不一致，尤其“日期策略”概念过于技术化，给用户造成理解负担。

因此，需要在不改变 `M21B1` 基础能力边界的前提下，新增一个短周期的体验优化阶段，把模板入口、模板展示、模板编辑页和模板管理页的交互压顺，再进入 `M21B2`。

### 功能定位

`M21B1-UX` 的目标不是新增业务能力，而是修正现有模板能力的视觉层级、交互路径和用户心智：

- 让“直接添加任务”继续保持主流程地位
- 让“模板”明确呈现为加速器，而不是前置步骤
- 降低模板标签和模板卡片的信息密度
- 让模板编辑页尽量复用任务编辑页的结构和语言

### 体验问题归纳

1. `task-edit` 页模板区当前存在“宣宾夺主”的问题
2. “查看全部”放在“添加任务”卡片标题动作区，视觉层次过重
3. 模板标签当前高度偏大，且同时显示模板名与任务名，信息重复
4. 模板管理页卡片底部 4 个按钮同权排布，不协调
5. “模板名称”和“任务名称”同时强暴露，概念负担偏高
6. 模板管理页当前虽有 `新建模板` 入口，但位置与视觉权重偏弱，更像次级动作，首次进入时不够聚焦
7. 模板编辑页“日期策略”字段用户难以理解
8. 模板编辑页与任务编辑页布局差异较大，学习成本偏高

### 范围

**包含**：

- 调整 `task-edit` 页模板入口的视觉层级与文案
- 重做任务页模板标签样式和信息展示策略
- 调整模板管理页的主要入口和卡片动作分层
- 简化模板编辑页字段暴露，移除“日期策略”的显式用户输入
- 让模板编辑页整体布局尽量向任务编辑页靠拢

**不包含**：

- 不改变模板实体模型
- 不改变模板同步语义
- 不改变模板使用、创建、启停、删除等业务能力
- 不引入 `M21B2` 的推荐模板、相似任务聚类、从历史任务保存模板
- 不重新设计孩子端权限模型

### 成功标准

- 用户进入 `task-edit` 页时，不再感觉“必须先创建模板”
- 模板区视觉上从“主功能模块”降为“快捷填充辅助条”
- 模板标签单层展示，阅读成本明显下降
- 模板管理页的主要动作关系清晰
- 模板编辑页不再出现让普通用户困惑的“日期策略”字段
- 模板编辑页与任务编辑页的布局相似度明显提高

---

## 技术方案

### 方案概述

`M21B1-UX` 采用“入口降权 + 展示减负 + 编辑同构”的方案。

前端上不新增页面，不新增业务服务，不改变模板数据结构。工作重点全部放在现有 3 个页面：

- [task-edit.wxml](/Users/wangdafei/code/study_task_wechat/pages/task-edit/task-edit.wxml)
- [task-template-manage.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.wxml)
- [task-template-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-edit/task-template-edit.wxml)

### 关键策略

#### 1. 任务页模板入口降权

模板区从“卡片内独立模块”调整为“快捷填充辅助条”：

- 标题文案改为 `快捷填充`
- 右侧操作文案改为 `管理模板`
- 不再使用强提示式 `创建第一个模板` 按钮
- 无模板时只显示一行弱提示：`还没有模板，去创建 >`

这样可以明确：主流程仍然是直接填写任务表单，模板只是帮助用户减少录入成本的快捷工具。

#### 2. 任务页模板标签减负

模板标签改为更紧凑的单层胶囊：

- 降低高度和内边距
- 默认只显示一个名称
- 当 `name` 非空且与 `taskPayload.title` 不同时，显示 `name`
- 当 `name` 为空，或与 `taskPayload.title` 相同时，显示 `taskPayload.title`
- 标签中不再重复展示第二行任务名称

类型色可保留，但应降低饱和度，避免抢过任务表单主视觉。

#### 3. 模板管理页动作分层

模板管理页卡片底部动作改为“主动作 + 次动作”：

- `select` 模式下：仅保留 `使用模板` 主按钮
- `manage` 模式下：卡片主按钮为 `编辑`
- `启用/停用` 与 `删除` 不再与主按钮并列，统一收纳到 `更多` 文本入口触发的 action sheet 中

避免 4 个同权按钮并列导致视觉失衡和误操作成本上升。

#### 4. 模板名称与任务名称的语义收敛

数据模型层面继续保留两个字段，但交互上弱化“双名称”概念：

- 保留 `taskPayload.title` 作为真实任务名称
- `name` 仅作为“模板别名（可选）”
- 编辑页允许用户不主动填写别名
- 保存时统一执行回填规则：`name = alias.trim() || taskPayload.title.trim()`
- 展示时统一执行回退规则：
  - 若 `name` 为空，显示 `taskPayload.title`
  - 若 `name === taskPayload.title`，只显示一份名称
  - 若两者不同，仅显示 `name` 作为主名称，任务名称不在标签中重复展示

第一版不强制改数据库结构，先通过文案和展示策略收敛用户认知。

#### 5. 移除“日期策略”的显式输入

模板编辑页不再向用户暴露 `dateStrategy.mode`。

内部继续保留该字段，但 UI 不提供直接配置入口，系统自动按如下规则确定：

- 重复类型为 `none` 时：默认 `today`
- 重复类型不为 `none` 时：默认 `inherit-repeat-rule`
- `autoShiftExpiredEndDate` 在本期也不再暴露为显式开关，内部固定为 `true`

如果未来确实需要开放此能力，再通过“高级设置”进入，不在本期主界面暴露。

#### 6. 模板编辑页与任务编辑页同构

模板编辑页尽量复用任务编辑页的布局语言：

- 先填任务内容，再填时间与重复，再给出保存动作
- 字段顺序与任务编辑页保持接近
- 文案尽量沿用任务编辑页已有表达
- 目标字段顺序明确固定为：
  - `任务名称`
  - `任务类型`
  - `星星 + 有效期`
  - `必做任务`
  - `任务描述`
  - `日期范围`
  - `全天`
  - `时间范围`
  - `无结束日期`
  - `重复方式`
  - `自定义重复星期（仅 custom 时显示）`
  - `提醒`
  - `模板别名（可选）`
  - `启用模板`

模板特有输入收敛为两个：

- `模板别名（可选）`
- `启用模板`

### 交互结构调整

#### `task-edit`

现状：

- 模板区块存在较强独立视觉
- `查看全部` 与“添加任务”卡片标题叠加

调整后：

- 模板条放在任务表单顶部，但视觉上为附属条
- 左侧 `快捷填充`
- 右侧 `管理模板`
- 模板标签改为单层紧凑胶囊
- 无模板时仅显示轻提示

#### `task-template-manage`

现状：

- 顶部新建入口偏弱
- 卡片动作过多且同权

调整后：

- 页面顶部保留明确 `新建模板` 主入口，并提升为该页唯一头部主操作
- 空状态仍使用主按钮
- 卡片底部动作分层：主区只保留 `编辑` 或 `使用模板`，危险与状态动作统一进入 `更多`

#### `task-template-edit`

现状：

- 模板信息与任务内容并列，但与任务编辑页差异较大
- “日期策略”概念直接暴露

调整后：

- 模板别名和启用状态放在更轻的位置
- 主体表单尽量复用任务编辑页分组顺序
- 去掉“日期策略”选择器
- 去掉“结束日期过期时自动顺延”显式开关
- 保存时由页面层自动按重复方式推导 `dateStrategy.mode`

### DDD边界

本期不改变 DDD 分层职责：

- 不新增模型
- 不新增服务
- 不新增后端接口
- 不变更模板数据结构

本期仅允许：

- 页面结构调整
- 页面字段显隐调整
- 文案调整
- 前端展示态派生逻辑调整
- 同步清理因本期 UX 调整而失效的旧字段、旧事件、旧样式和废弃测试夹具，不保留死代码

---

## 代码结构

### 主要改动文件

**表现层**：

- [pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/pages/task-edit/task-edit.wxml)
- [pages/task-edit/task-edit.wxss](/Users/wangdafei/code/study_task_wechat/pages/task-edit/task-edit.wxss)
- [pages/task-edit/task-edit.js](/Users/wangdafei/code/study_task_wechat/pages/task-edit/task-edit.js)
- [packageManage/pages/task-template-manage/task-template-manage.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.wxml)
- [packageManage/pages/task-template-manage/task-template-manage.wxss](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.wxss)
- [packageManage/pages/task-template-manage/task-template-manage.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.js)
- [packageManage/pages/task-template-edit/task-template-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-edit/task-template-edit.wxml)
- [packageManage/pages/task-template-edit/task-template-edit.wxss](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-edit/task-template-edit.wxss)
- [packageManage/pages/task-template-edit/task-template-edit.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-edit/task-template-edit.js)
- [pages/task-edit/modules/task-template-entry.js](/Users/wangdafei/code/study_task_wechat/pages/task-edit/modules/task-template-entry.js)

**测试**：

- [test/pages/task-edit.page.test.js](/Users/wangdafei/code/study_task_wechat/test/pages/task-edit.page.test.js)
- [test/pages/task-template-manage.page.test.js](/Users/wangdafei/code/study_task_wechat/test/pages/task-template-manage.page.test.js)
- [test/pages/task-template-edit.page.test.js](/Users/wangdafei/code/study_task_wechat/test/pages/task-template-edit.page.test.js)

### 不改动文件

- `models/task-template.js`
- `services/task-template-service.js`
- `repositories/task-template-repository.js`
- 后端模板控制器、服务、路由、迁移

---

## 实施步骤

### 第1步：调整 `task-edit` 模板区层级

目标：

- 把模板区从“主模块”降级为“辅助条”

实施：

- 调整标题文案：`从模板快速填充` -> `快捷填充`
- 将 `查看全部` 调整为 `管理模板`
- 将无模板态从大按钮改为弱提示链接
- 弱提示文案固定为 `还没有模板，去创建 >`
- 弱提示点击后统一跳转模板管理页，不直接进入模板编辑页
- 缩小模板区上下留白和边框存在感

验收标准：

- 进入页面后，视觉焦点首先落在任务表单而不是模板入口

### 第2步：重做任务页模板标签

目标：

- 提高模板标签信息效率和视觉轻盈感

实施：

- 模板标签改成单层胶囊
- 只显示单个主名称
- 显示规则固定为：
  - `name` 非空且不等于 `taskPayload.title` 时显示 `name`
  - 其他情况显示 `taskPayload.title`
- 降低高度、内边距和背景强度
- 保留轻量类型色，不再做两层文本堆叠

验收标准：

- 用户一眼能扫出常用模板，不会困惑“模板名称”和“任务名称”的区别

### 第3步：调整模板管理页动作分层

目标：

- 消除 4 个同权按钮的割裂感

实施：

- `select` 模式：只保留 `使用模板`
- `manage` 模式：主按钮为 `编辑`
- `启用/停用`、`删除` 统一收纳到 `更多` action sheet
- `更多` 中的动作顺序固定为：`启用/停用`、`删除`

验收标准：

- 单张模板卡片的主动作和危险动作不再同权并排

### 第4步：简化模板编辑页字段暴露

目标：

- 减少用户无法理解的概念

实施：

- 移除“日期策略”选择器
- `模板名称` 文案改为 `模板别名（可选）`
- 保留 `启用模板`
- 移除 `结束日期过期时自动顺延` 开关
- 保存前自动执行：`name = alias.trim() || taskTitle.trim()`
- 保存前自动按重复类型推导 `dateStrategy.mode`
- 同步删除仅为旧日期策略 UI 服务的表单字段、选项常量、事件处理函数和样式

验收标准：

- 用户进入编辑页后，能用与任务编辑页相近的心智完成设置

### 第5步：模板编辑页向任务编辑页同构

目标：

- 降低新功能学习成本

实施：

- 复用任务编辑页中的字段顺序、分组结构和主操作节奏
- 模板特有字段放在弱化位置
- 同步清理旧布局遗留的无效 class、仅旧按钮布局使用的样式和不再触发的事件分支
- 以以下顺序作为验收基线：
  - `任务名称`
  - `任务类型`
  - `星星 + 有效期`
  - `必做任务`
  - `任务描述`
  - `日期范围`
  - `全天`
  - `时间范围`
  - `无结束日期`
  - `重复方式`
  - `自定义重复星期`
  - `提醒`
  - `模板别名（可选）`
  - `启用模板`

验收标准：

- 用户从“添加任务”切换到“新建模板”时，不会感到进入了完全不同的系统

---

## 测试方案

### 单元测试

- `task-edit` 模板区无模板态和有模板态文案切换
- 模板标签展示规则：
  - 模板名与任务名相同
  - 模板名与任务名不同
  - 模板名为空时回退展示任务名
- 模板管理页不同模式下的按钮显隐
- 模板管理页 `更多` 操作菜单中的动作顺序与显隐
- 模板编辑页移除日期策略后的保存逻辑保持正确：
  - 不再提交 `dateStrategyMode` 表单字段
  - 自动推导 `dateStrategy.mode`
  - 自动固定 `autoShiftExpiredEndDate = true`
  - 别名为空时自动回填 `name`

### 手动测试

1. 无模板时进入 `task-edit`
   - 确认不会误以为必须先创建模板
2. 有多个模板时进入 `task-edit`
   - 确认模板标签紧凑、易扫读
3. 进入模板管理页
   - 确认 `新建模板` 入口清晰
   - 确认卡片动作层级更合理
4. 进入模板编辑页
   - 确认整体结构与任务编辑页一致
   - 确认没有“日期策略”这类难懂概念
   - 确认没有“结束日期过期时自动顺延”显式开关
   - 确认不填写模板别名也可正常保存

### 回归测试

- 模板创建、编辑、启停、删除、使用不回归
- `task-edit` 直接手工创建任务主流程不受影响
- 模板使用后任务表单填充逻辑不回归

---

## 风险评估

### 风险1：体验优化时误伤已实现的模板主链路

风险：

- 页面重构可能导致模板选择、回填或管理链路回归
- “别名可选”如果只改文案不改保存逻辑，会与现有校验直接冲突
- 只删 UI 不删旧状态和旧事件，后续会形成隐藏分支和死代码，增加维护成本

应对：

- 不改服务层与后端链路
- 仅调整表现层结构
- 页面保存前显式做 `name` 回填，避免触发前后端空名称校验
- 每删一个 UI 能力，都同步移除其无用状态、事件、样式与测试夹具
- 以现有模板相关测试为基础补充页面测试

### 风险2：过度弱化模板入口，导致用户找不到

风险：

- 如果入口降权过头，用户反而无法发现模板能力

应对：

- 在 `task-edit` 顶部保留清晰但轻量的 `快捷填充` + `管理模板`
- 在模板管理页保留明确 `新建模板` 入口

### 风险3：模板名称与任务名称收敛不当，影响既有数据解释

风险：

- 已有模板数据中可能已经出现两者不一致
- 少量历史模板如果曾保存 `autoShiftExpiredEndDate = false`，在本期规则下用户重新编辑并保存后会被统一收敛为 `true`

应对：

- 第一版只调整展示策略，不修改数据结构
- 通过“别名（可选）”文案弱化差异，不做迁移
- 将 `autoShiftExpiredEndDate` 的静默收敛视为本期设计预期，而非回归缺陷；如后续需要恢复手动控制，应通过独立高级设置能力重新引入

---

## 替代方案

### 方案A：直接修改原 `M21B1` 设计文档

不采用原因：

- 会把“基础能力设计”和“体验修正设计”混在一起，后续难以追踪边界

### 方案B：把体验优化延后到 `M21B3`

不采用原因：

- 当前问题直接影响用户对模板能力的理解，如果继续叠加 `M21B2` 功能，只会把复杂度继续放大

### 方案C：重新推翻模板页和任务页结构

不采用原因：

- 当前主链路已经稳定，没必要在 `M21B1` 后立刻大改架构
- 本期更适合做小范围、确定性的体验修正

---

## 结论

`M21B1-UX` 应作为 `M21B1` 完成后的短周期体验收尾阶段执行。它不改变模板系统的业务能力边界，只修正当前表现层在视觉层级、概念暴露和操作节奏上的问题，为后续 `M21B2` 和 `M21B3` 提供更稳定、更自然的用户基础。
