# 里程碑-22T：Android 任务输入焦点错位修复

> **设计状态**：🟢 审核通过
> **创建日期**：2026-05-21
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：1-2天

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

1. 用户点击“任务名称”输入框后，焦点态输入文字没有显示在输入框内。
2. 用户感觉到输入光标和正在输入的内容跑到了页面上方其他区域。
3. 当输入框失焦后，已输入的文字又会正确回填到输入框中。

这说明问题不在“值有没有保存”，而在“焦点态输入时 Android 原生输入层如何与当前页面结构配合渲染”。由于该问题直接影响“进入任务管理后新建任务”的主链路，而且只在真实 Android 设备上暴露，不能按普通样式小问题零散修补，必须作为独立里程碑处理。

本期目标是：基于现有代码事实，修复 Android 真机 `task-edit` 任务标题输入的焦点错位问题，恢复实时可见输入体验，并给出对同类结构风险的明确边界判断。

### 业务价值

- [x] 用户价值：Android 用户可以正常创建任务，不再出现“输入时看不到自己在写什么”的核心交互故障。
- [x] 产品价值：恢复任务主链路在主流真机环境下的可靠可用性，避免因为平台兼容性导致核心功能不可用。
- [x] 技术价值：厘清共享 `card` 结构在原生输入场景下的兼容边界，减少后续在输入密集页面重复踩坑。

### 功能范围

**包含**：
- ✅ 修复 Android 真机 `task-edit` 页面“添加任务”表单区域内原生输入组件的焦点态错位问题，包括任务名称输入框、积分输入框与描述输入框
- ✅ 基于实际代码确定问题结构边界，明确是否属于共享 `card` 容器兼容性问题
- ✅ 为 `task-edit` 设计一个不依赖高风险共享结构的表单容器方案
- ✅ 对当前已知同类页面做边界盘点，说明本期是否纳入，并明确哪些页面只做回归、不做同批改造
- ✅ 补齐对应页面测试与 Android 真机手工验证要求

**不包含**：
- ❌ 不在本期重构整个共享 `card` 组件
- ❌ 不在本期重做 `task-edit` 整页信息架构
- ❌ 不把所有输入页面统一迁移到新壳层
- ❌ 不把 Android 输入兼容问题扩展成全站 UI 治理专项

### 优先级

- **优先级**：P0
- **理由**：这是当前核心创建任务链路在 Android 真机上的真实可用性故障，影响用户是否能完成最基础的任务录入。

---

## 现状问题复盘

### 现象已经指向“焦点态渲染异常”，不是数据未保存

当前用户反馈与代码事实一致：

1. 点击输入框后，正在输入的文字不显示在输入框里。
2. 失焦后，输入内容又正确显示在输入框里。

若数据绑定有问题，常见结果会是：

- 输入内容直接丢失
- 失焦后仍然不显示
- 页面数据与最终保存值不一致

但当前并非如此。`task-edit` 中任务名称输入只是：

- WXML：`value="{{newTask.title}}" bindinput="onTaskTitleInput"`
- JS：`onTaskTitleInput` 内将 `e.detail.value` 写回 `newTask.title`

因此可以确认：

- 数据写回主链路是通的
- 问题集中在 Android 焦点态输入层的显示位置/裁剪行为

### 当前页面结构存在 Android 焦点态输入的高风险组合

`task-edit` 的“添加任务”表单当前结构是：

1. 页面使用共享 `<card title="添加任务" customClass="add-task-card">`
2. 表单内容通过 `slot` 落入 `card-content`
3. `card` 根容器 `.card-component` 设置了 `overflow: hidden`
4. `card-title` 通过负边距把头部背景向外回拉

当前相关事实如下：

- [packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:36) 使用共享 `card` 包裹“添加任务”表单
- [components/card/card.wxss](/Users/wangdafei/code/study_task_wechat/components/card/card.wxss:2) 的 `.card-component` 包含 `overflow: hidden`
- [components/card/card.wxss](/Users/wangdafei/code/study_task_wechat/components/card/card.wxss:18) 的 `.card-title` 使用负边距布局
- [packageTask/pages/task-edit/task-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageTask/pages/task-edit/task-edit.wxml:117) 的任务名称输入位于这个共享容器内部

对微信小程序 Android 端而言，焦点态输入通常依赖原生输入层覆盖渲染。结合当前症状与代码结构，本期将“共享 slot 容器 + 根容器裁剪 + 头部负边距”的组合作为最可信的主因判断：它比普通静态布局更容易在 Android 真机上触发原生输入层位置计算或裁剪异常。最终验证标准不是口头推断，而是实施后在 Android 真机上是否恢复正常输入。

### 为什么不采纳“是额外 setData 导致”的主因判断

代码里确实存在 `markTemplateFillUndoDirty()`，而它在某些条件下可能先于 `setData` 执行额外逻辑。但这条链路并不能解释当前主现象：

1. 当前用户反馈的是“输入文字显示跑位”，不是“输入有延迟但位置正常”。
2. `markTemplateFillUndoDirty()` 只有在模板撤销态可见且快照存在时才会真正继续执行；默认场景下大概率直接返回。
3. 即便出现额外 `setData`，它更可能放大性能抖动，而不是稳定制造几何位置错乱。

因此，本期设计不把“优化 `bindinput` 内部 `setData` 次序”作为主方案，而把它保留为次级可选优化；只有当页面结构收口后 Android 真机仍能复现时，才回头评估这条逻辑链路。

### 同类结构风险盘点

当前代码复核发现：

- [packageManage/pages/task-template-edit/task-template-edit.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-edit/task-template-edit.wxml:8) 也把输入表单放在共享 `card` 里
- [packageManage/pages/task-template-manage/task-template-manage.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.wxml:13) 和 [152]( /Users/wangdafei/code/study_task_wechat/packageManage/pages/task-template-manage/task-template-manage.wxml:152 ) 也在共享 `card` 结构里放了搜索输入框

这说明共享 `card` + 输入表单的结构风险不是 `task-edit` 独有。但目前只有 `task-edit` 在真实 Android 路径上被确认出现问题。因此：

- 本期必须修复 `task-edit`
- `task-template-edit` 需要做 Android 真机回归验证，因为它同样包含多组表单输入与 `textarea`
- `task-template-manage` 需要做 Android 真机搜索输入回归，但它属于搜索场景，不纳入本期同批结构改造范围
- 若这些页面验证未复现，不在本期主动扩写为共享组件全站改造

---

## 技术方案

### 方案概述

`M22T` 采用“**保留页面视觉风格，但将 `task-edit` 的输入密集表单从共享 `card` 结构中抽离，改为页面局部表单壳层**”方案。

核心思路：

1. 不把问题继续压在 Android 平台输入实现细节上猜测
2. 直接消除当前已知高风险结构组合
3. 只改 `task-edit` 的受影响表单区域，避免公共组件级回归面扩大
4. 保持页面现有视觉语言一致，避免修 bug 顺手引入样式重设计

### 核心设计决策

#### 决策1：首选修复路径是页面局部去 `card` 化，而不是修改共享 `card`

具体做法：

- 把“添加任务”表单区域从 `<card title="添加任务">` 中移出
- 在 `task-edit` 页面内新增局部结构，例如：
  - `form-shell`
  - `form-header`
  - `form-body`
- 视觉上继续保持白底、圆角、阴影、标题头部风格，确保整体页面观感不变

这样做的理由：

- 修改面只限于一个真实故障页面
- 不会影响热力图卡片、模板页卡片、其他展示型卡片
- 避免把 Android 输入兼容风险转移到所有 `card` 使用方

#### 决策2：共享 `card` 组件本期只做“风险边界记录”，不做全站语义变更

本期不直接改 `components/card/` 的原因：

- `card` 在项目中复用范围广，动公共样式需要大面积回归
- 当前只确认了输入密集场景的兼容性风险，未证明展示型卡片也存在问题
- 即使为 `card` 增加 `inputSafe` 变体，也仍需逐页替换使用方式，本质上并不比页面局部壳层更省事

因此，本期正式边界是：

- `task-edit` 页面局部收口
- 共享 `card` 继续保留
- 将“输入密集表单不默认放在当前共享 `card` 结构内”作为经验结论沉淀

#### 决策3：同类页面只做验证，不默认同批改造

`task-template-edit` 具有相似结构，但没有被用户报告为必现问题。本期策略是：

- 实施后对 `task-template-edit` 做 Android 真机回归
- 若验证正常，则记录为“存在结构相似风险，但暂不扩 scope”
- 若验证中同样复现，则在实施评审阶段再决定是否并入同一修复批次

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 表单容器 | 页面局部 `form-shell` | 继续复用共享 `card` | 最小影响面，最直接规避当前兼容风险 |
| 共享组件策略 | 维持现状 | 给 `card` 增加 `inputSafe` 变体 | 公共组件回归成本更高，当前无必要立即放大 |
| 输入逻辑 | 维持现有 `bindinput + setData` | 改为延迟同步/失焦同步 | 当前数据逻辑已正确，问题不在值同步 |

### DDD分层设计

**领域层（models/）**：
- [ ] 新建模型：无
- [ ] 修改模型：无
- 说明：这是前端表现层兼容性修复，不涉及领域模型。

**服务层（services/）**：
- [ ] 新建服务：无
- [ ] 修改服务：无
- 说明：不变更任务服务、模板服务或用户服务职责。

**仓储层（repositories/）**：
- [ ] 新建仓储：无
- [ ] 修改仓储：无
- 说明：不涉及数据访问。

**适配器层（adapters/）**：
- [ ] 新建适配器：无
- [ ] 修改适配器：无
- 说明：不涉及平台适配器。

**表现层（pages/、components/）**：
- [ ] 新建页面：无
- [x] 修改页面：`packageTask/pages/task-edit/`
- [ ] 新建组件：无
- 说明：主要变更集中在 `task-edit` 页面结构与样式，必要时补充对应页面测试。

### 数据模型

本期不新增数据模型。

### 接口设计

本期不新增服务接口。

---

## 代码结构

### 文件变更清单

**新增文件**：
- 无

**修改文件**：
- `packageTask/pages/task-edit/task-edit.wxml` - 将“添加任务”表单从共享 `card` 结构改为页面局部壳层
- `packageTask/pages/task-edit/task-edit.wxss` - 新增局部表单壳层样式，保持现有视觉语言、规避裁剪/负边距结构，并显式保留当前底部 `safe-area` 补偿语义
- `test/pages/task-edit.page.test.js` - 补齐结构渲染与主链路回归测试，并把现有“标题右侧 `card action slot`”断言改为“本地表单头部动作位”断言
- `test/pages/task-template-edit.page.test.js` - 若本期决定加入自动化结构守卫，则补充相似输入页仍保留共享 `card` 结构的基线断言；若不补自动化，则至少维持手工回归记录
- `test/pages/task-template-manage.page.test.js` - 若本期决定加入自动化结构守卫，则补充搜索输入仍保留共享 `card` 结构的基线断言；若不补自动化，则至少维持手工回归记录
- `docs/development/CHANGELOG.md` - 实施完成后补记一条 Android 真机兼容性修复事实

### 核心代码结构

```xml
<view class="task-form-shell">
  <view class="task-form-header">
    <text class="task-form-title">添加任务</text>
    <view wx:if="{{occurrenceEntryVisible}}" class="occurrence-entry-action">...</view>
  </view>

  <view class="task-form-body">
    <view class="add-task-content">
      <!-- 模板快捷填充 -->
      <!-- 任务名称 / 类型 / 星星 / 描述 / 时间频率等 -->
    </view>
  </view>
</view>
```

```css
.task-form-shell {
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
  margin: 30rpx 30rpx 40rpx;
  padding-bottom: env(safe-area-inset-bottom, 20rpx);
}

.task-form-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 32rpx;
  font-weight: 600;
  color: #333333;
}

.task-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 16rpx 16rpx 0 0;
  padding: 24rpx 30rpx 20rpx;
  border-bottom: 1rpx solid #f0f0f0;
  background: #fbfbfb;
}

.task-form-body {
  padding: 4rpx 24rpx 0;
}

.add-task-content {
  padding: 24rpx 20rpx;
}
```

补充约束：

- 新壳层必须显式保留当前 `.add-task-card` 的底部 `safe-area` 补偿语义，避免 Android 修复后 iPhone 底部留白回退。
- 若最终选择把 `safe-area` 放在 `task-form-body` 而不是 `task-form-shell`，也需要保证视觉结果与当前页面底部节奏等价。
- 新壳层应尽量保留现有 `add-task-content` 包裹层，或以等效方式保留当前内容区水平间距；不能让内容区从当前约 `44rpx` 的有效左右内边距直接收窄到 `20rpx`。
- 标题文字样式需要与当前共享 `card-title-text` 保持一致，避免热力图卡片与“添加任务”表单头部出现明显割裂。
- 由于新方案不再依赖父容器 `overflow: hidden` 裁剪头部背景，`task-form-header` 需要显式声明顶部圆角，避免其浅灰背景在左右上角轻微顶入白色壳层圆角区域。

### 关键函数

**函数1**：`onTaskTitleInput`
- **输入**：`e.detail.value`
- **输出**：更新 `newTask.title`
- **职责**：继续负责值同步，不承担 Android 焦点态修复职责
- **依赖**：`setData`

---

## 实施步骤

### 第1步：页面结构收口（预计2小时）

- [ ] **任务**：把 `task-edit` 的“添加任务”表单从共享 `card` 结构中迁出，改为页面局部壳层
- [ ] **验证**：代码中不再存在 `<card title="添加任务"...>` 包裹任务标题输入的结构
- [ ] **依赖**：无

**实施要点**：
1. 不改热力图卡片等未受影响区域
2. 保留现有标题文案、动作入口和内容顺序
3. 不顺手调整业务交互逻辑
4. 明确“新建表现项”入口从 `card action slot` 迁移到本地表单头部动作位，不改变其业务入口职责
5. 迁移范围覆盖整块“添加任务”表单中的原生输入组件，而不是只围绕任务名称输入框做局部补丁

---

### 第2步：样式等价迁移（预计2小时）

- [ ] **任务**：新增页面局部表单壳层样式，保持当前整体风格一致
- [ ] **验证**：iPhone、开发者工具视觉与当前版本关键指标等价；Android 焦点态不再错位
- [ ] **依赖**：第1步完成

**实施要点**：
1. 复用当前卡片视觉语言，而不是重新设计表单外观
2. 避免使用可能继续影响原生输入层定位的裁剪/负边距组合
3. 确保标题动作区和模板快捷填充区仍然正常布局
4. 显式保留当前底部 `safe-area` 补偿，避免 iPhone/全面屏设备底部间距回退
5. 建议实施时对比 before / after 截图，至少核对以下视觉项：
   - 标题区字号、字重、颜色与背景一致
   - 标题区顶部圆角与当前卡片观感一致，不出现头部背景顶入圆角的问题
   - 标题区高度与上下节奏一致
   - 内容区左右间距与现状等价
   - 卡片圆角、阴影、上下外边距一致

---

### 第3步：测试补齐与相似页面回归（预计2小时）

- [ ] **任务**：补充页面测试，并对 `task-template-edit`、`task-template-manage` 做同类结构回归验证
- [ ] **验证**：自动化测试通过，且形成明确的相似页面验证结论
- [ ] **依赖**：第1步、第2步完成

**实施要点**：
1. 自动化测试至少覆盖结构渲染与关键交互仍可用
2. `task-edit` 现有依赖共享 `card action slot` 的断言需要同步改写，否则实施后会出现“设计已变、测试仍按旧结构检查”的假失败
3. Android 真机需要列入强制手工回归项
4. `task-template-edit` 至少做 Android 真机手工回归；若本期希望把“相似结构仍未扩改”也固化下来，可补一条自动化结构基线测试
5. `task-template-manage` 至少做 Android 真机搜索输入回归；若本期希望把“搜索输入场景未受影响”也固化下来，可补一条自动化结构基线测试
6. 若相似页面复现，再单独记录是否扩 scope

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| `task-edit` 表单结构渲染 | 页面测试检查“添加任务”表单壳层存在 | 不再依赖共享 `card` 包裹标题输入 |
| 任务标题输入值同步 | 触发 `onTaskTitleInput` | `newTask.title` 正常更新 |
| 积分输入与描述输入主链路 | 页面测试/行为回归 | `stepper-input` 与 `textarea` 仍正常工作，且不因结构迁移被破坏 |
| 模板快捷填充与表单头部动作 | 页面测试/事件触发 | 现有入口仍可见、仍可响应 |
| “新建表现项”入口结构断言迁移 | 重写 `task-edit.page.test.js` 中旧 `card action slot` 断言 | 改为校验本地表单头部动作位，而不是继续绑定共享 `card` |
| `task-template-edit` 相似页基线 | 手工回归，必要时补页面测试 | 明确其本期“未改结构但已验证未受影响”的结论 |
| `task-template-manage` 搜索输入基线 | 手工回归，必要时补页面测试 | 明确其本期“搜索输入场景已验证未受影响”的结论 |

### 集成测试

- [ ] 场景1：进入 `task-edit` 后正常加载模板快捷填充、任务基础表单和时间频率区域
- [ ] 场景2：输入任务名称、积分值、描述等核心字段后仍能正常提交
- [ ] 场景3：`task-template-edit` Android 回归验证不因本次改动被意外影响
- [ ] 场景4：`task-template-manage` Android 搜索输入回归不因本次改动被意外影响

### 手动测试

1. **Android 真机重点验证**：
   - [ ] 进入任务管理页并点击“任务名称”输入框
   - [ ] 连续输入中文、英文、数字时，文字始终显示在输入框内
   - [ ] 点击积分数字输入框并输入数字时，文字始终显示在输入框内
   - [ ] 点击描述输入框并输入多行文字时，文字始终显示在文本区域内
   - [ ] 失焦后内容不丢失、位置不跳变
   - [ ] 模板快捷填充后继续编辑标题、积分、描述，不出现焦点错位

2. **iPhone / 开发者工具回归**：
   - [ ] 页面视觉风格与当前版本保持一致
   - [ ] 标题样式、标题区背景、内容区左右间距、圆角阴影与当前版本等价
   - [ ] 输入任务名称、描述、星星数等交互正常
   - [ ] 热力图、模板快捷填充、表现项入口未被破坏

3. **相似页面回归**：
   - [ ] `task-template-edit` 在 Android 真机输入标题时未出现同类错位
   - [ ] `task-template-edit` 在 Android 真机输入积分、描述、别名等字段时未出现同类错位
   - [ ] `task-template-manage` 在 Android 真机搜索输入时未出现同类错位

### 测试覆盖率目标

- 最低要求：85%
- 推荐目标：90%

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 页面局部壳层替换后出现视觉回归 | 中 | 中 | 严格复用现有卡片视觉语义，只移除高风险结构 |
| Android 修复后 iPhone/开发者工具样式错位 | 中 | 低 | 补齐多端回归，优先保持现有 spacing 和标题布局 |
| `task-template-edit` 也复现同类问题 | 中 | 中 | 将其列为强制验证项，若复现再单独决定是否扩 scope |
| 误判根因为 `setData` 导致修复无效 | 高 | 低 | 首选直接移除高风险容器结构，以结果验证；不先做低置信度逻辑微调 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 修 bug 时顺手改动太多页面体验 | 中 | 中 | 明确本期只修兼容性，不重做信息架构 |
| Android 用户路径恢复但测试不足导致回归漏网 | 高 | 中 | 把 Android 真机验证列为发布前必做项 |

---

## 替代方案

### 方案A：继续保留 `card`，只调整 `bindinput`/`setData` 时序

**优点**：
- 改动小
- 不触碰页面结构

**缺点**：
- 不能解释当前几何错位主现象
- 即使缓解输入卡顿，也不一定能解决显示位置异常
- 风险在于做了改动却没有真正命中根因

**结论**：不选。本期不把它作为主方案。

### 方案B：修改共享 `card` 组件，增加 `inputSafe` 模式

**优点**：
- 理论上可为后续其他输入页复用
- 能从公共层解决一类问题

**缺点**：
- 共享组件改动面广，回归成本高
- 仍需逐页替换或新增属性接入
- 当前没有足够证据证明应当立即放大为公共组件治理

**结论**：暂不选。保留为后续若多页复现时的二阶段方案。

### 方案C：`task-edit` 页面局部去 `card` 化

**优点**：
- 直接移除当前已知高风险结构组合
- 影响面最小
- 最容易在真实 Android 路径上验证结果

**缺点**：
- 页面会出现一个“视觉上像卡片但不是共享 `card` 组件”的局部壳层
- 同类页面若未来复现，仍需再评估是否推广

**结论**：选用，作为本期正式实施方案。
