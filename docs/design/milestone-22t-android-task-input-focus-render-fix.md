# 里程碑-22T：Android 任务输入焦点错位修复

> **设计状态**：🟢 审核通过
> **创建日期**：2026-05-21
> **最近修订**：2026-05-22
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：2-3天

---

## 📋 目录

- [需求分析](#需求分析)
- [现状问题复盘](#现状问题复盘)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)

---

## 需求分析

### 功能描述

当前 `task-edit` 页面在 iPhone 与微信开发者工具模拟器中表现正常，但在 Android 真机上出现高优先级兼容性问题：

1. 用户点击“任务名称”输入框后，焦点态文字会跑到页面偏上区域，而不留在输入框内。
2. 该现象在“输入框里原本已有文字，仅点击聚焦、不输入新字符”时也会立刻发生。
3. 输入框失焦后，文字又会回到输入框中。

这说明问题不在“值有没有保存”，而在“聚焦瞬间 Android 原生输入层如何与当前页面结构协同渲染”。由于该问题直接影响“进入任务管理后新建任务”的主链路，而且只在 Android 真机暴露，不能继续在当前页结构上做低置信度微调，必须调整方案层级。

本次修订后的目标是：**停止在 `task-edit` 当前页内继续做第三轮局部补丁，而是把“创建任务表单”从热力图管理页中隔离出去，改用独立创建页承载原生输入，恢复 Android 真机的稳定输入体验。**

### 业务价值

- [x] 用户价值：Android 用户可以稳定创建任务，不再出现“点击输入框后文字跑位”的核心故障。
- [x] 产品价值：把高频主链路从平台兼容性高风险页面中剥离，提升任务创建成功率和可维护性。
- [x] 技术价值：沉淀“输入密集表单不与复杂热力图管理视图强耦合”的页面边界，为后续同类页面提供稳定范式。

### 功能范围

**包含**：
- ✅ 修复 Android 真机 `task-edit` 页面内联“添加任务”表单的焦点错位问题
- ✅ 将任务创建表单迁移为独立创建页，避免与热力图管理区域共页
- ✅ 复用现有任务表单归一化、展示和校验能力，避免业务规则分叉
- ✅ 保留模板快捷填充、推荐模板、表现项入口等现有能力，但按新页面边界重新落位
- ✅ 对 `task-template-edit`、`task-template-manage` 做 Android 真机回归边界验证

**不包含**：
- ❌ 不在本期继续尝试通过 `adjust-position`、`flex`、隐藏输入清理等页面内微调解决问题
- ❌ 不在本期重构整个共享 `card` 组件
- ❌ 不在本期重做热力图组件交互结构
- ❌ 不把全站所有输入页统一迁移为独立编辑页

### 优先级

- **优先级**：P0
- **理由**：这是当前核心创建任务链路在 Android 真机上的真实可用性故障，前两轮页面内微调已被真机证伪，必须提升方案层级。

---

## 现状问题复盘

### 已确认：这不是数据未保存问题

当前用户反馈与代码事实一致：

1. 点击输入框后，文字跑位，但失焦后会回到输入框。
2. 当前 `task-edit` 页的标题输入仍是标准受控写回：
   - WXML：`value="{{newTask.title}}" bindinput="onTaskTitleInput"`
   - JS：`onTaskTitleInput` 内将 `e.detail.value` 写回 `newTask.title`

因此可以确认：

- 数据写回主链路是通的
- 问题集中在 Android 焦点态原生输入层的显示位置，而不是值同步

### 已确认：前两轮主因判断都被真机否掉

本里程碑已经发生过两轮实现尝试，但均未命中真机问题：

1. **第一轮判断**：共享 `card` 的 `overflow: hidden`、负边距标题和 slot 结构导致焦点态错位  
   结果：将“添加任务”表单从共享 `card` 中迁出后，Android 真机问题依旧。

2. **第二轮判断**：热力图组件里隐藏但常驻的原生输入干扰了当前输入框  
   结果：将热力图编辑输入改为按需挂载后，Android 真机问题依旧。

3. **第三个关键事实**：用户明确反馈“输入框里已经有几个字，只是点击聚焦，不输入新字符，字就跑到了上面”  
   这直接排除了 `bindinput`、`setData`、模板撤销状态等输入后才触发的逻辑链路。

因此，本次修订必须明确承认：

- 之前两套页面内结构判断已经被证伪
- 继续在同一页面里微调 CSS、输入属性或隐藏输入结构，成功概率已经明显下降
- 问题更接近 Android 真机对“复杂长页中的原生输入层”渲染不稳定，而不是某一个单独的局部样式属性

### 当前高风险组合不是“单一属性”，而是“复杂管理页 + 内联原生表单”

当前 `task-edit` 页面同时承载了多类内容：

- 上方热力图和日期详情管理区  
  参考：[packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:6)
- 中部模板快捷填充与推荐模板区  
  参考：[packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:38)
- 下方完整任务创建表单，包含多个原生 `input` / `textarea`  
  参考：[packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:109)
- 页面底部还挂有多个面板容器（重复、提醒、积分有效期等）  
  参考：[packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:275)

这意味着 `task-edit` 本质上已经不是“一个表单页”，而是“一个复杂管理页 + 一个完整表单页”的混合体。  
在这种页面中继续追逐 Android 原生输入层的局部兼容细节，边际收益很低。

### 为什么本次不再把“继续猜 CSS / 参数组合”作为主方案

当前已经被真机否掉的微调方向包括：

- 去共享 `card`
- 清理热力图隐藏输入
- 关闭 `adjust-position`
- 去页面根 `flex` 包装

这说明本问题至少对当前代码库来说，不适合继续依赖页面内局部参数试错。  
更高置信度的工程决策应当是：**把输入密集型原生表单从复杂管理页中隔离出去，改到独立页面承载。**

---

## 技术方案

### 方案概述

`M22T` 修订后采用“**任务管理页保留热力图与概览，任务创建表单迁移到独立创建页**”方案。

核心思路：

1. 承认当前页内微调已被真机证伪，不再继续在同一页上叠补丁
2. 将任务创建表单从 `task-edit` 页中物理隔离出去，避免与热力图管理区共页
3. 复用现有任务表单业务逻辑，而不是重新发明一套创建规则
4. 控制变更在任务域内，不扩散成全站输入治理专项

### 核心设计决策

#### 决策1：任务创建改为独立页面，而不是继续保留内联“添加任务”表单

具体做法：

- 保留 `task-edit` 作为“任务管理页”，并继续保持页面导航标题为 `任务管理`
- 删除当前页内完整“添加任务”表单
- 在 `task-edit` 中保留一张 `card title="添加任务"` 的轻量入口卡片，卡片内只放：
  - 一段说明文案
  - 一个主按钮 `新建任务`
- 不在本里程碑给 `task-edit` 增加并列的“使用模板新建”入口按钮
- 新增独立页面，例如：`packageTask/pages/task-create/task-create`

这样做的理由：

- 直接切断“热力图复杂管理区 + 原生输入表单共页”的高风险组合
- 不再要求 Android 在同一页里同时处理热力图管理和输入密集表单
- 相比继续猜页面局部属性，这是一条更稳定、更可验证的修复路径

补充约束：

- `task-edit` 的页面路由与导航栏文案不变，用户仍从“任务管理”进入这条业务链路
- 模板选择、推荐模板、手动创建模板等能力统一收口到 `task-create` 页内，不再分散为 `task-edit` 上的平级创建入口

#### 决策2：独立创建页复用现有任务表单逻辑，不做业务规则重写

当前仓库已有可复用的任务表单基础能力：

- [utils/task-form-core.js](/Users/wangdafei/code/study_task_wechat/utils/task-form-core.js)  
  负责草稿归一化、校验、payload 构建等规则
- [utils/task-form-adapter.js](/Users/wangdafei/code/study_task_wechat/utils/task-form-adapter.js)  
  负责页面状态与标准草稿之间的适配
- [utils/task-form-display.js](/Users/wangdafei/code/study_task_wechat/utils/task-form-display.js)  
  负责重复、提醒、有效期等文案展示
- [packageTask/pages/task-edit/modules/task-template-entry.js](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/modules/task-template-entry.js)  
  已承载模板快捷填充加载逻辑

因此本期不应复制一份新规则，而应：

- 复用已有 `taskFormCore` / `taskFormAdapter` / `taskFormDisplay`
- 将当前 `task-edit.js` 中真正属于“创建表单”的逻辑迁出或复用到新页
- 保证新页与旧页在任务校验、payload、模板回填上的行为一致

模板来源约定必须在本期一次性定清：

- `task-create` 打开模板选择页时，统一使用 `source=task-create`
- `task-create` 打开模板推荐草稿时，统一使用 `sourceType=task-create-recommendation`
- `task-template-manage` 对 `source=task-create` 的回传行为与现有 `task-edit` 路径保持同级能力
- `task-template-edit` 对 `sourceType=task-create-recommendation` 的提示文案、保存后回传语义必须显式兼容
- 本期不再保留“若必要再兼容新来源”的模糊表述，来源标识属于正式范围

#### 决策3：`task-edit` 只保留管理视图与创建入口，不再承担输入密集表单职责

`task-edit` 页面调整后职责应明确为：

- 保留页面权限守卫与 `targetUserId` 透传
- 展示热力图与日期任务分布
- 保留热力图月份切换、任务刷新与 `onShow` 刷新任务数据
- 保留表现项入口
- 提供“新建任务”进入独立创建页的入口

不再承担：

- 原生输入表单的直接承载
- 多字段即时编辑和提交
- 模板快捷填充列表、推荐模板摘要与模板应用逻辑

`task-create` 页面承担以下职责：

- 持有 `newTask`、`errors` 等创建态页面数据
- 承载标题、类型、星星、描述、日期、重复、提醒、积分有效期等表单区
- 承载 `validateTaskForm` / `validateTaskFormLocal`、`addTask`、清空表单等创建动作
- 承载模板快捷填充、推荐模板草稿应用、手动创建模板入口
- 在创建成功后 `navigateBack` 返回 `task-edit`

#### 决策4：同类页面本期只做边界回归，不扩 scope

`task-template-edit` 和 `task-template-manage` 依然需要 Android 真机回归，但本期不强行改造，原因是：

- 当前只有 `task-edit` 真机路径被确认必现
- 当前更高置信度的结论是“复杂管理页内联创建表单”风险高，而不是“所有输入页都必须拆成独立页”
- 若相似页面回归正常，本期不主动扩 scope

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 任务创建承载页 | 新增独立 `task-create` 页面 | 继续保留 `task-edit` 内联表单 | 物理隔离输入表单，修复置信度最高 |
| 任务创建返回刷新 | 复用 `task-edit onShow` 刷新 | 复杂 eventChannel 双向同步 | 当前页已有 `onShow` 刷新，成本更低 |
| 模板能力接入 | 在新页复用当前模板快捷填充逻辑 | 在旧页保留模板、创建页不接模板 | 保持用户能力完整，不牺牲现有入口价值 |
| 表单规则 | 复用 `taskFormCore` / `taskFormAdapter` / `taskFormDisplay` | 复制 `task-edit.js` 一份新逻辑 | 避免业务规则分叉 |
| 旧页结构 | 保留热力图与管理区，仅替换表单为入口卡片 | 重写整个任务管理页 | 控制范围，专注修 bug |

### DDD分层设计

**领域层（models/）**：
- [ ] 新建模型：无
- [ ] 修改模型：无
- 说明：这是前端表现层与页面边界修复，不涉及领域模型。

**服务层（services/）**：
- [ ] 新建服务：无
- [ ] 修改服务：无
- 说明：任务创建仍复用现有任务服务。

**仓储层（repositories/）**：
- [ ] 新建仓储：无
- [ ] 修改仓储：无
- 说明：不涉及数据访问层改造。

**适配器层（adapters/）**：
- [ ] 新建适配器：无
- [ ] 修改适配器：无
- 说明：继续复用现有表单适配工具。

**表现层（pages/、components/）**：
- [x] 新建页面：`packageTask/pages/task-create/`
- [x] 修改页面：`packageTask/pages/task-edit/`
- [ ] 新建组件：无
- [ ] 修改组件：无
- 说明：本期核心是重画页面边界，而不是继续微调热力图组件本身。

### 数据模型

本期不新增数据模型。

### 接口设计

本期不新增后端接口。

---

## 代码结构

### 文件变更清单

**新增文件**：
- `packageTask/pages/task-create/task-create.js` - 任务创建页逻辑，承载原“添加任务”表单
- `packageTask/pages/task-create/task-create.wxml` - 任务创建页视图
- `packageTask/pages/task-create/task-create.wxss` - 任务创建页样式
- `packageTask/pages/task-create/task-create.json` - 页面配置

**修改文件**：
- `app.json` - 在 `packageTask` 分包中注册 `task-create` 页面
- `utils/permission-utils.js` - 为家长角色新增 `task-create` 页面访问权限
- `packageTask/pages/task-edit/task-edit.wxml` - 删除内联“添加任务”表单，改为创建入口卡片
- `packageTask/pages/task-edit/task-edit.wxss` - 删除旧表单样式，补创建入口卡片样式
- `packageTask/pages/task-edit/task-edit.js` - 调整为“任务管理页”，新增进入创建页逻辑，移除或迁出表单专属逻辑
- `packageTask/pages/task-edit/modules/task-template-entry.js` - 提炼为可被 `task-create` 复用的模板入口/模板应用能力
- `packageManage/pages/task-template-manage/task-template-manage.js` - 显式支持 `source=task-create` 的模板选择与推荐模板保存后回传
- `packageManage/pages/task-template-edit/task-template-edit.js` - 显式支持 `sourceType=task-create-recommendation` 的草稿提示与保存回传语义
- `test/pages/task-edit.page.test.js` - 改为断言管理页只保留创建入口，而不再存在完整内联表单
- `test/pages/task-create.page.test.js` - 新增创建页测试
- `test/pages/task-template-edit.page.test.js` - 补新来源页回传与推荐草稿回填测试
- `test/pages/task-template-manage.page.test.js` - 补模板选择页对 `task-create` 打开来源的测试
- `docs/development/CHANGELOG.md` - 实施完成后补记 Android 兼容性修复事实

### 核心代码结构

#### `task-edit` 管理页

```xml
<card customClass="task-heatmap-card">
  <!-- 热力图与管理视图 -->
</card>

<card title="添加任务" customClass="task-create-entry-card">
  <view class="task-create-entry-copy">
    <text>在独立页面中创建任务，输入更稳定</text>
  </view>
  <view class="task-create-entry-actions">
    <button bindtap="openTaskCreatePage">新建任务</button>
  </view>
</card>
```

#### `task-create` 创建页

```xml
<view class="container">
  <view class="task-create-shell">
    <!-- 模板快捷填充 -->
    <!-- 模板选择 / 推荐模板入口 / 手动创建模板入口 -->
    <!-- 标题 / 类型 / 星星 / 描述 -->
    <!-- 时间 / 重复 / 提醒 -->
    <!-- 提交 / 清空 -->
  </view>
</view>
```

#### 页面跳转与返回

```js
openTaskCreatePage() {
  const targetUserId = this.data.targetUserId || '';
  const query = targetUserId ? `?targetUserId=${targetUserId}` : '';
  wx.navigateTo({
    url: `/packageTask/pages/task-create/task-create${query}`
  });
}
```

```js
// task-create 提交成功后
wx.navigateBack({ delta: 1 });
```

由于 [packageTask/pages/task-edit/task-edit.js](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.js:241) 已在 `onShow` 中刷新任务数据，创建页成功返回后旧页可以自然刷新，无需先设计更重的同步机制。

### 关键实现约束

- 新创建页必须完整承接当前任务创建能力，不能只迁标题输入
- `task-edit` 侧只保留一个“新建任务”主入口，不再并列摆放“使用模板新建”
- 模板快捷填充、推荐模板、手动创建模板入口必须全部迁入 `task-create`
- `targetUserId` 透传必须保留，避免家长为孩子创建任务路径回退
- 模板来源标识必须统一为：
  - 模板选择页：`source=task-create`
  - 推荐模板草稿：`sourceType=task-create-recommendation`
- 视觉风格应与现有任务域保持一致，但不要求继续复用“内联卡片 + 热力图同页”的结构

---

## 实施步骤

### 第1步：重画页面职责边界（预计4小时）

- [ ] **任务**：将 `task-edit` 从“管理页 + 创建表单混合页”改为纯管理页，并新增 `task-create` 独立创建页
- [ ] **验证**：`task-edit` 页面中不再直接承载标题、星星、描述等原生输入组件
- [ ] **依赖**：无

**实施要点**：
1. `task-edit` 保留热力图、表现项入口和创建入口
2. `task-create` 独立承载原完整表单
3. 不在此阶段改业务规则，只先重画页面边界

---

### 第2步：迁移并复用表单能力（预计6小时）

- [ ] **任务**：将当前创建任务所需的表单逻辑迁移到 `task-create`
- [ ] **验证**：标题、类型、星星、描述、时间、重复、提醒、模板快捷填充均可正常工作
- [ ] **依赖**：第1步完成

**实施要点**：
1. 优先复用 `taskFormCore` / `taskFormAdapter` / `taskFormDisplay`
2. 尽量提炼 `task-edit.js` 中“表单相关”逻辑，而不是复制一份
3. 确保模板页 eventChannel 回传仍能工作
4. 确保 `targetUserId` 在新页中仍可生效

---

### 第3步：测试补齐与 Android 真机回归（预计4小时）

- [ ] **任务**：补齐新创建页测试、旧管理页入口测试与相似页面回归结论
- [ ] **验证**：自动化测试通过，且 Android 真机主链路恢复
- [ ] **依赖**：第1步、第2步完成

**实施要点**：
1. `task-edit` 页面测试要从“表单存在”切换为“创建入口存在”
2. `task-create` 页面测试要覆盖模板回填、表单校验、创建成功返回
3. Android 真机必须作为发布前强制验证项

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| `task-edit` 创建入口结构 | 页面测试检查不再存在内联创建表单，而存在创建入口卡片 | 管理页职责收口完成 |
| `task-create` 表单渲染 | 页面测试检查标题、类型、星星、描述、时间、重复、提醒完整存在 | 创建页能力完整迁移 |
| `task-create` 模板快捷填充 | 事件与数据回填测试 | 模板选择、推荐模板与回填链路正常 |
| `task-create` 表单校验 | 触发校验失败/通过路径 | 规则与旧页一致 |
| `task-create` 创建成功返回 | 模拟创建成功后 `navigateBack` | 返回管理页并触发旧页刷新 |
| 权限与路由接入 | 静态断言新路由已注册、权限已配置 | 新页可被家长访问 |
| `task-template-edit` 新来源回传 | 页面测试 | 推荐草稿回填对新创建页仍可用 |
| `task-template-manage` 新来源回传 | 页面测试 | 模板选择对新创建页仍可用 |

### 集成测试

- [ ] 场景1：从任务管理页点击“新建任务”进入独立创建页
- [ ] 场景2：在创建页输入标题、星星、描述后成功提交并返回
- [ ] 场景3：在创建页通过模板快捷填充后继续编辑并成功提交
- [ ] 场景4：家长代孩子创建任务路径仍正常
- [ ] 场景5：`task-template-edit`、`task-template-manage` Android 回归未被意外影响

### 手动测试

1. **Android 真机重点验证**：
   - [ ] 从任务管理页进入创建页
   - [ ] 创建页标题输入框中已有文字时，仅点击聚焦，不输入新字符，文字不再跑位
   - [ ] 连续输入中文、英文、数字时，文字始终显示在输入框内
   - [ ] 点击星星数字输入框并输入数字时，文字始终显示在输入框内
   - [ ] 点击描述输入框并输入多行文字时，文字始终显示在文本区域内
   - [ ] 模板快捷填充后继续编辑标题、星星、描述，不出现焦点错位
   - [ ] 创建成功返回任务管理页后，热力图与任务数据已刷新

2. **iPhone / 开发者工具回归**：
   - [ ] 管理页热力图与创建入口展示正常
   - [ ] 创建页整体视觉风格与任务域保持一致
   - [ ] 创建页所有输入、面板、按钮交互正常

3. **相似页面回归**：
   - [ ] `task-template-edit` 在 Android 真机输入标题、星星、描述、别名时未出现同类错位
   - [ ] `task-template-manage` 在 Android 真机搜索输入时未出现同类错位

### 测试覆盖率目标

- 最低要求：85%
- 推荐目标：90%

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 新建页迁移时复制了旧逻辑，导致规则分叉 | 高 | 中 | 强制复用 `taskFormCore` / `taskFormAdapter` / `taskFormDisplay`，避免复制业务规则 |
| 模板选择/推荐草稿回传仍绑定 `task-edit` 旧来源 | 中 | 中 | 设计阶段即纳入 `task-template-*` 页来源兼容调整 |
| 任务管理页去掉内联表单后，用户路径多一步 | 中 | 中 | 保持入口清晰直达，并以稳定输入体验换取额外一步 |
| Android 真机即使独立页仍复现 | 高 | 低 | 若独立创建页仍复现，再单独进入平台级兼容专项；本期先用更高置信度隔离方案验证 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 用户对“原本在当前页直接创建，现在需要点一下进入新页”不适应 | 中 | 中 | 在入口卡片中明确提示“进入新建页”，并保持按钮显著 |
| 修 bug 时顺手改动太多任务管理体验 | 中 | 中 | 明确本期只调整创建表单边界，不重做热力图管理信息架构 |

---

## 替代方案

### 方案A：继续在 `task-edit` 当前页里调 CSS / 输入属性

**优点**：
- 改动小
- 不需要新增页面

**缺点**：
- 前两轮已经被 Android 真机证伪
- 继续试错成功率低
- 风险是又做出一轮“模拟器正常、真机无效”的改动

**结论**：不选。已经不符合当前证据状态。

### 方案B：继续保留当前页结构，但把表单改成页内全屏 overlay

**优点**：
- 不新增页面路由
- 交互上仍停留在当前页上下文

**缺点**：
- 仍与当前复杂管理页同页，不能彻底切断原生输入层风险
- 在平台兼容性问题上，隔离强度弱于独立页面

**结论**：暂不选。若后续用户强烈要求不跳页，可作为二选方案再评估。

### 方案C：新增独立 `task-create` 页面

**优点**：
- 对当前真机问题的隔离强度最高
- 与已有 `task-occurrence-edit` 的“管理页/编辑态分离”思路一致
- 便于后续继续复用任务表单能力

**缺点**：
- 用户路径会多一步
- 需要新增页面与测试接入

**结论**：选用，作为本期正式实施方案。
