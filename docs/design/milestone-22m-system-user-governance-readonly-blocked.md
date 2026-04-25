# 里程碑-22M：系统级用户权限与禁入治理 详细设计文档

> **设计状态**：✅ 已审核通过，进入实施阶段
> **创建日期**：2026-04-25
> **设计者**：GPT5 Codex
> **审核者**：待定
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
- [审核要点自检](#审核要点自检)

---

## 需求分析

### 功能描述

`M22A` 已完成家庭内 `manager / viewer` 治理，`M22B` 已完成系统管理员底座与动态准入开关。但系统目前仍缺一层更高优先级的“系统级用户治理”能力：

1. 系统管理员无法把某个已有用户设为“只能看不能改”。
2. 系统管理员无法把某个已有用户直接禁入小程序。
3. 现有 JWT 与前端缓存没有承载这层治理语义，权限变更后不能保证尽量即时生效。

`M22M` 的目标，就是在家庭治理之上再补一层系统级 `normal / readonly / blocked`，并把这层能力接入现有 `M22B` 系统管理入口，使系统管理员可以在小程序内正式管理“谁还能正常用、谁只能查、谁不能再进来”。

### 业务价值

- [x] 用户价值：系统管理员可以直接在小程序内处理误操作、临时封控和观察期账号，不再依赖数据库手工修改。
- [x] 产品价值：把“家庭内角色”和“系统级使用资格”彻底拆开，减少权限心智混乱。
- [x] 技术价值：建立一套可扩展的系统级用户治理模型，为后续邀请码统一、新用户直达家庭和更细粒度系统策略打基础。

### 功能范围

**包含**：

- [x] 为真实登录用户新增系统级访问级别：`normal / readonly / blocked`
- [x] 系统管理员在小程序内查看用户治理列表并修改访问级别
- [x] 系统级 `blocked` 用户禁止继续进入程序
- [x] 系统级 `readonly` 用户保留查询能力，但禁止写操作
- [x] 权限调整尽量即时生效：至少在“下一次 API 请求”与“应用回前台刷新”时生效
- [x] 前后端统一错误码、页面拦截与基础说明文案

**不包含**：

- [x] 不做邀请码生成、邀请码用途统一和新用户直达家庭，这属于 `M22L`
- [x] 不做系统管理员名单维护或系统管理员提权，这仍沿用 `M22B` 既有底座
- [x] 不做 websocket / 实时推送，不承诺“管理员修改后对方当前静止页面无请求时立刻感知”
- [x] 不做虚拟孩子成员的系统级治理；治理对象仅限真实登录用户
- [x] 不做昵称/头像/性别/地区采集扩展，这不属于当前里程碑

### 优先级

- **优先级**：P0
- **理由**：`M22B` 已解决“谁能操作系统开关”，`M22M` 解决的是“管理员能控制哪些用户还能正常使用系统”。没有这层治理，邀请体系和新用户导入做得再完整，也缺少闭环约束。

---

## 现状问题复盘

### 问题1：当前只有家庭内 `viewer`，没有系统级只读

当前前端只在 [utils/permission-utils.js](/Users/wangdafei/code/study_task_wechat/utils/permission-utils.js) 与 [utils/user-context.js](/Users/wangdafei/code/study_task_wechat/utils/user-context.js) 中基于 `familyPermissionRole='viewer'` 推导“家庭查看者只读”。

这层语义解决的是：

1. 同一家庭里，某个家长只能查看，不能改任务/奖励/家庭设置。

但它解决不了：

1. 某个用户即使不在家庭里，也应该被系统级限制为只读。
2. 某个孩子或家长应该被系统级禁止继续进入程序。
3. 家庭只读与系统只读叠加时，哪一层优先、从哪里生效。

### 问题2：当前用户状态只有 `active / inactive`，无法表达 `readonly`

当前前后端用户模型中：

- 前端 [models/user.js](/Users/wangdafei/code/study_task_wechat/models/user.js)
- 后端 [backend/models/User.js](/Users/wangdafei/code/study_task_wechat/backend/models/User.js)

都只支持 `status='active' | 'inactive'`。

而现有实现里：

1. `inactive` 用户会直接被排除出用户缓存和查询结果。
2. [backend/services/userService.js](/Users/wangdafei/code/study_task_wechat/backend/services/userService.js) 的 `findByOpenid()` / `findById()` 只返回 `status='active'` 用户。

这意味着：

1. `inactive` 更接近“失效/不可用”而不是“只读”。
2. 如果直接复用 `status` 承载 `readonly / blocked`，会把旧语义打乱。
3. 系统级治理必须新增独立字段，而不是强行挤进现有 `status`。

### 问题3：当前受保护 API 只信任 JWT，不足以承载动态失权

当前 [backend/middleware/auth.js](/Users/wangdafei/code/study_task_wechat/backend/middleware/auth.js) 只做：

1. 提取 token
2. 校验 token
3. 把 payload 注入 `req.user`

它不会：

1. 回库确认用户当前是否被系统级禁入
2. 回库确认用户当前是否被系统级只读

而 JWT 当前也只带：

- `userId`
- `openid`
- `role`
- `familyId`
- `familyPermissionRole`

没有系统级治理字段。因此如果继续只靠旧 token：

1. 用户被设为 `blocked` 后，旧 token 仍可能继续调用接口。
2. 用户被设为 `readonly` 后，前端和后端都可能延迟很久才感知。

### 问题4：`M22B` 已经有系统管理员页，但还没有用户治理承接面

`M22B` 已新增：

- 关于页隐藏入口 [packageManage/pages/about/about.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/about/about.js)
- 系统管理页 [packageManage/pages/system-admin/system-admin.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/system-admin/system-admin.js)

当前系统管理页首期只承载“应用准入模式”，没有用户治理入口。

如果把用户治理直接塞成当前页面第二屏长列表，会带来两个问题：

1. 当前系统页会从“轻量系统设置页”膨胀成“伪后台首页”。
2. 应用准入和用户治理的阅读节奏会互相干扰。

因此 `M22M` 更适合在系统管理页内新增一个治理入口卡片，再进入专门的“系统用户治理页”。

### 问题5：系统级 `blocked` 与 `readonly` 需要比家庭权限更高优先级

当前家庭权限链路默认认为：

1. `manager` 家长可管理
2. `viewer` 家长只读
3. 孩子可执行自己的完成/重置/兑换等操作

但系统级治理一旦引入，优先级必须改为：

1. **系统级 `blocked`**：最高优先级，直接禁止进入或继续使用
2. **系统级 `readonly`**：次高优先级，只能查，不能写
3. **家庭级 `manager / viewer`**：仅在系统级允许使用时再继续生效

否则就会出现“系统上已经只读，但孩子还能打卡”“系统上已经 blocked，但旧 token 还在写任务”的冲突。

---

## 技术方案

### 方案概述

`M22M` 采用“**用户表最小扩展 + 后端统一回库守卫 + 前端治理页承接 + 前端只读态辅助**”的方案：

1. 在 `users` 表新增独立的系统级访问字段，明确表示 `normal / readonly / blocked`
2. 后端新增系统级用户访问守卫，对已登录用户的请求执行回库校验
3. 系统管理员入口继续复用 `M22B`，但把“用户治理”放到新的专门页面
4. 前端统一扩展用户上下文与权限工具，减少只靠接口报错才知道受限的突兀感

这样做的目标是：

- authoritative 守住所有写接口和 blocked 禁入
- 前端同步表达只读/禁入态，减少困惑
- 不破坏 `M22A` 家庭治理与 `M22B` 系统管理员底座

### 核心设计决策

#### 决策1：系统级治理使用独立字段 `system_access_level`，不复用 `status`

新增字段建议：

```sql
ALTER TABLE users
  ADD COLUMN system_access_level VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT '系统级访问级别 normal|readonly|blocked',
  ADD COLUMN system_access_updated_by_user_id VARCHAR(36) DEFAULT NULL COMMENT '系统级访问级别最后更新人',
  ADD COLUMN system_access_updated_at TIMESTAMP NULL DEFAULT NULL COMMENT '系统级访问级别最后更新时间';
```

合法值：

| 值 | 含义 |
|----|------|
| `normal` | 正常使用 |
| `readonly` | 允许登录和查询，但禁止写操作 |
| `blocked` | 禁止继续进入程序 |

选择理由：

1. 现有 `status` 已经承担活跃/失效语义，复用它会破坏已有逻辑。
2. `readonly` 无法通过现有 `active / inactive` 自然表达。
3. 单字段足以承载本期能力，且未来若要加 `suspended` 等，也能平滑扩展。

边界说明：

1. 治理对象仅限 `is_virtual=0` 的真实登录用户。
2. 虚拟孩子成员不进入系统级治理列表。
3. `status` 继续保留既有生命周期语义，不与系统级治理混义。

#### 决策2：系统级治理优先级高于家庭级治理

执行顺序明确为：

1. 先判断系统级 `system_access_level`
2. 再判断家庭级 `familyPermissionRole`
3. 再判断页面视图（家长视角 / 切换孩子视角）

具体规则：

1. `blocked` 用户：不允许继续进入程序，也不允许访问受保护业务接口。
2. `readonly` 用户：允许继续读取数据，但不允许发起任何业务写操作。
3. `viewer` 家长：只有在系统级不是 `blocked / readonly` 时，才继续按家庭只读语义生效。

#### 决策3：动态生效采用“后端回库 authoritative + 前端回前台刷新”组合，而不是依赖旧 JWT

新的生效策略：

1. 登录时读取数据库中的 `system_access_level`
2. 每次受保护业务请求，由新的 `systemUserAccessMiddleware` 回库检查当前用户
3. 小程序回前台时刷新当前用户信息，尽量让 UI 也尽快跟上

这意味着：

1. **强 authoritative 边界**：blocked/readonly 不会因为旧 token 而继续长期放行。
2. **尽量即时生效**：管理员改完后，对方最晚会在下一次 API 请求或下一次前台刷新时生效。
3. **不承诺无请求实时推送**：当前项目不引入 websocket，本期不追求真正毫秒级全端推送。

#### 决策4：blocked 与 readonly 的后端守卫统一通过新中间件收口

新增中间件：

- `backend/middleware/systemUserAccess.js`

职责：

1. 在 `authMiddleware` 之后运行
2. 回库读取当前用户最新记录
3. 根据 `system_access_level` 和接口语义做 authoritative 拦截

规则：

1. `blocked`：无论 `GET / POST / PATCH / DELETE`，统一拒绝
2. `readonly`：
   - 允许所有“纯读取 / 无持久化副作用”的接口
   - 拒绝所有“会改后端状态 / 产生持久化副作用”的接口
3. `normal`：继续交给现有家庭权限和业务权限链路处理

首期判定口径：

1. 不采用“按 HTTP method 一刀切”的方案，因为现有真实接口里已经存在查询型 `POST`。
2. 以“是否改变后端状态 / 是否产生持久化副作用”作为只读治理的 authoritative 标准。
3. 首期实现采用显式 allowlist 收口查询型 `POST` 与非持久化动作，避免误伤真实查询接口。

结合当前代码，首期至少需要覆盖的边界如下：

| 接口 | 当前方法 | 当前语义 | readonly 结论 |
|------|----------|----------|---------------|
| `/api/task-templates/recommendations/query` | `POST` | 查询推荐候选，不写库 | 允许 |
| `/api/users/switch` | `POST` | 当前实现仅做校验后直接返回 `USER_SWITCH_FORBIDDEN`，不写库 | 不纳入首期 allowlist，也不把它视为“必须拦截的写接口” |
| `/api/task-templates/:templateId/usage` | `POST` | 记录模板使用次数，写库 | 拒绝 |

边界要求：

1. allowlist 必须以“真实语义”命名和维护，不能退化为“某些 POST 特判越积越多”。
2. 未来若新增查询型 `POST` 或非持久化动作，必须在设计或接口评审时同步声明其 readonly 语义，再决定是否加入 allowlist。
3. 中间件返回的仍是统一错误码 `SYSTEM_USER_READONLY`，前端无需感知 allowlist 细节。

前端全局承接约束：

1. `SYSTEM_USER_BLOCKED` 不能依赖页面各自 `catch` 后弹 toast，自定义分流必须收口到统一 HTTP 层。
2. `utils/http-client.js` 需要新增对 `403 + SYSTEM_USER_BLOCKED` 的集中识别，并执行单次 `reLaunch('/pages/system-blocked/system-blocked')`。
3. 为避免多个并发请求同时跳转，前端需增加一个全局去重标记，例如 `systemBlockedRedirectInFlight`。
4. `SYSTEM_USER_READONLY` 不做全局跳页，继续交由调用页面按统一文案做轻提示，但错误码必须完整透传。

错误码建议：

| 错误码 | 含义 |
|--------|------|
| `SYSTEM_USER_BLOCKED` | 当前用户已被系统管理员禁入 |
| `SYSTEM_USER_READONLY` | 当前用户已被系统管理员设为只读 |
| `SYSTEM_USER_GOVERNANCE_INVALID` | 提交了非法访问级别 |
| `SYSTEM_USER_GOVERNANCE_TARGET_INVALID` | 目标用户不支持系统治理 |
| `SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED` | 必须至少保留一个正常可用的系统管理员 |

#### 决策5：系统管理员页只新增入口，不把用户治理列表直接堆在现页

前端结构建议：

1. 保留现有 `packageManage/pages/system-admin/system-admin`
2. 在该页新增一个“用户权限治理”卡片
3. 点击后进入新页面：
   - `packageManage/pages/system-user-governance/system-user-governance`

选择理由：

1. 当前系统页首期已经形成“轻量系统设置页”心智，不宜直接膨胀。
2. 用户治理天然是列表型和操作型页面，应有独立滚动空间与错误态。
3. 这也方便后续 `M22L` 在系统页继续增加其它治理入口，而不是把所有内容硬塞一页。

#### 决策5.1：系统用户治理页采用“说明卡 + 状态统计 + 单列用户卡片列表”

页面路径：

- `packageManage/pages/system-user-governance/system-user-governance`

页面目标：

1. 让系统管理员快速看清“当前谁是正常、谁是只读、谁已禁入”。
2. 让管理员在单个用户卡片内直接完成状态切换，不引入额外详情页。
3. 保持与当前 [system-admin.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/system-admin/system-admin.wxml) 和 [family-settings.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/family-settings/family-settings.wxml) 一致的卡片式管理体验。

页面信息架构：

1. 顶部说明卡
2. 状态统计卡
3. 用户列表区

页面结构说明：

1. **顶部说明卡**
   - 标题：`用户权限治理`
   - 副标题：`可把真实登录用户设为正常使用、只读或暂停使用`
   - 辅助说明：`家庭角色不变，系统级限制优先生效`
2. **状态统计卡**
   - 三个并排统计项：`正常`、`只读`、`已禁入`
   - 只展示数量，不做点击筛选首期交互，避免把首版页面做成“半后台报表”
3. **用户列表区**
   - 单列滚动列表
   - 每个用户一张卡片
   - 首期不做 tab，不做二级详情页，不做折叠分组

排序规则：

1. 默认按 `blocked -> readonly -> normal` 排序，让风险用户优先暴露。
2. 同状态内按 `isSystemAdmin desc` 排序，让系统管理员优先显示。
3. 再按 `updatedAt desc` 排序，让最近被处理的用户靠前。

选择理由：

1. 当前项目的系统管理页和家庭设置页都偏“轻管理卡片流”，不是复杂后台表格。
2. 小程序竖屏里单列卡片比多列表头更稳，更符合现有交互密度。
3. 首版最重要的是降低误操作和理解成本，而不是追求批量治理效率。

单个用户卡片设计：

1. **第一行：身份主信息**
   - 左侧：昵称
   - 昵称下方次级信息：`家长 / 孩子`
   - 若是当前登录管理员本人，补 `· 我`
   - 为避免同昵称误判，再补一条低噪音识别信息：`ID后缀：a8f3` 或 `未加入家庭`
   - 右侧：当前系统状态 badge，三种文案分别为 `正常使用`、`只读`、`已禁入`
2. **第二行：治理辅助信息**
   - 若为系统管理员，显示 `系统管理员` 小标签
   - 若存在家庭权限角色，显示 `家庭管理员` 或 `家庭查看者`
   - 若已加入家庭，可展示 `已加入家庭`
   - 若最近被修改过，显示 `最近调整：2026-04-25 18:05`
3. **第三行：操作区**
   - 使用 3 个并列状态按钮：`正常` / `只读` / `禁入`
   - 当前激活状态按钮高亮，其他为描边按钮
   - 保存采用“点击即提交”，不额外加二次确认页
4. **第四行：风险提示区**
   - 仅在特殊场景出现
   - 例如最后一个正常系统管理员不可降权时，在卡片底部展示原因说明，并禁用 `只读` / `禁入`

卡片交互约束：

1. 点击当前已生效状态不重复请求。
2. 请求中仅锁定当前卡片，不锁整页。
3. 请求成功后：
   - 立即更新卡片状态
   - 同步刷新顶部统计
   - 轻提示 `已更新`
4. 请求失败后：
   - 保持旧状态
   - 用 toast 展示后端返回错误文案
5. 若命中 `SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED`：
   - 不弹通用失败
   - 直接显示更具体文案：`至少保留一位可正常使用的系统管理员`

首期不展示的信息：

1. 不展示完整 `userId`
2. 不展示 `openid / unionid`
3. 不展示头像、性别、地区
4. 不展示修改人 `updatedByUserId` 原始 ID

不展示这些字段的理由：

1. 当前接口虽然可返回 `updatedByUserId`，但直接展示原始 ID 对管理员没有阅读价值。
2. 本页是治理页，不是账号审计页；首版先聚焦“识别对象 + 调整状态”。
3. 头像、地区等弱信息会增加噪音，但不能显著提高治理效率。
4. 但由于真实系统中昵称不唯一、且新用户默认昵称可能相同，卡片仍必须展示稳定识别信息；首期采用“`我` 标记 + 脱敏 `userId` 后缀 + 是否加入家庭”这一组低噪音标识，而不是完全只看昵称。

文案与视觉约束：

1. 继续沿用当前系统管理相关页面的白底卡片、浅灰页面背景、蓝色主操作色。
2. `正常` 用中性蓝灰或浅蓝，不做“成功绿”强化，避免像监控后台。
3. `只读` 用低饱和琥珀色或暖灰强调“受限但可进”。
4. `禁入` 用浅红底或红色文字强调，但只放在状态 badge 和禁入按钮上，不把整卡刷成红色。
5. 页面说明文案必须用管理员视角的大白话，不使用“access level / governance”等英文术语。

页面状态设计：

1. **加载态**
   - 使用和当前系统管理页一致的卡片式 `加载中...`
2. **空列表态**
   - 标题：`还没有可治理用户`
   - 说明：`当前没有真实登录用户进入过系统`
3. **加载失败态**
   - 标题：`用户列表暂时不可用`
   - 说明展示后端错误文案
   - 提供 `重新加载` 按钮
   - 仅用于普通接口失败，不承接权限失效
4. **local mode 禁用态**
   - 不进入本页
   - 在入口页直接禁用并说明 `仅云端模式可用`
5. **管理员权限失效态**
   - 若接口返回 `SYSTEM_ADMIN_REQUIRED`
   - 不展示普通失败卡
   - 直接沿用当前系统管理页的处理方式：toast 提示 `仅系统管理员可访问` 后返回上一页

特殊交互规则：

1. **管理员修改自己为 `readonly`**
   - 允许操作
   - 当前更新请求成功后，先展示 `已更新为只读` 轻提示
   - 不立即强制跳页
   - 但紧随其后的列表刷新、概览刷新和后续治理请求都必须按只读权限处理
   - 本页上的状态按钮需同步整体降为不可操作，并显示说明 `当前账号为只读，仅可查看`
2. **管理员修改自己为 `blocked`**
   - 允许操作，但成功后不留在原页
   - 更新请求返回成功后，前端需立即执行与 `SYSTEM_USER_BLOCKED` 相同的清会话和阻断页跳转，不等待下一次普通请求再触发
   - 这样可以避免“刚显示成功又因后续刷新突兀跳走”的割裂体验
3. **最后一个正常系统管理员**
   - 不允许改为 `readonly` 或 `blocked`
   - 卡片按钮直接禁用，并在卡片底部展示原因说明
4. **非最后一个正常系统管理员**
   - 允许自我降权或禁入
   - 但前端必须按上述 `self readonly / self blocked` 专门流程收口，不能和普通目标用户共用“成功后刷新列表”逻辑

首期交互边界：

1. 不做搜索
2. 不做筛选抽屉
3. 不做批量操作
4. 不做用户详情页
5. 不做操作历史时间线

原因：

1. 当前真实系统管理员底座刚建立完成，首期先保证治理链路正确和稳。
2. 当前页面目标是“可靠调整少量用户状态”，不是大规模账号运营台。
3. 这些增强项未来可在列表真实规模上来后再补，不应拖慢 `M22M` 首版落地。

#### 决策6：至少保留一个 `normal` 状态的系统管理员

新增系统级业务规则：

1. 若目标用户是系统管理员，且当前系统内只剩最后一个 `system_access_level='normal'` 的系统管理员
2. 则不允许把该用户改成 `readonly` 或 `blocked`

选择理由：

1. 否则系统可能进入“所有管理员都被自己锁死”的状态。
2. 当前项目没有后台脚本运维台或系统管理员名册页，必须在业务上兜底。

边界说明：

1. 允许存在多个系统管理员。
2. 允许把某个系统管理员设为受限，但前提是系统中仍有其他 `normal` 管理员可恢复。

#### 决策7：blocked 用户使用专门阻断页，readonly 用户使用轻量说明

blocked 用户体验：

1. 登录时若被拒绝，不再落通用“网络错误”弹窗，而是直接进入专门阻断页
2. 已登录用户若在下一次请求中被发现 blocked，前端跳到独立阻断页：
   - `pages/system-blocked/system-blocked`
3. 阻断页只提供说明与“重新检查”按钮，不提供业务入口
4. 阻断页文案统一为“当前账号已被管理员暂停使用”，并提供“重新检查”而非“返回首页”

readonly 用户体验：

1. 不做重型阻断页
2. 首次感知时用轻量 toast 或状态说明提示“当前账号为只读，仅可查看”
3. 关键写入口在 UI 上同步降权 / 禁用，减少不断试错

选择理由：

1. blocked 是“不能继续使用”，需要页面级明确阻断。
2. readonly 仍可继续浏览，不适合大面积打断体验。

登录链路约束：

1. `auth/login` 若命中 `blocked`，后端返回专用错误码 `SYSTEM_USER_BLOCKED`，不生成新 token。
2. 前端启动链路 [bootstrap-auth.js](/Users/wangdafei/code/study_task_wechat/utils/app/bootstrap-auth.js) 需要像当前邀请制 `access-gate` 分流一样，对该错误码执行专门跳转，而不是继续走通用登录失败弹窗。
3. 前端 [services/user-service.js](/Users/wangdafei/code/study_task_wechat/services/user-service.js) 的 `initialize()` 当前会先调用 `AUTH_CURRENT`，失败后再 fallback 用旧 token 构造 `loginUser`。`M22M` 必须显式改掉这条降级路径：一旦识别到 `SYSTEM_USER_BLOCKED`，必须中止初始化、清理本地 token 与 `lastUserInfo`，禁止 fallback 到旧 token 用户态。
4. 若用户原本已有旧 token，但在后续请求中被识别为 `blocked`，前端需要清理本地 token 与 `lastUserInfo`，再跳转阻断页，避免自动重登继续循环。

### DDD分层设计

**领域层（models/）**：

- [x] 修改模型：[backend/models/User.js](/Users/wangdafei/code/study_task_wechat/backend/models/User.js)
  - 增加 `systemAccessLevel / systemAccessUpdatedAt / systemAccessUpdatedByUserId`
- [x] 修改模型：[models/user.js](/Users/wangdafei/code/study_task_wechat/models/user.js)
  - 增加前端同构字段与 helper

**服务层（services/）**：

- [x] 修改服务：[backend/services/userService.js](/Users/wangdafei/code/study_task_wechat/backend/services/userService.js)
  - 扩展用户读写字段
- [x] 新建服务：`backend/services/systemUserGovernanceService.js`
  - 查询可治理用户列表、更新访问级别、校验最后正常管理员约束
- [x] 修改服务：[services/user-service.js](/Users/wangdafei/code/study_task_wechat/services/user-service.js)
  - 同步当前用户系统级治理状态
- [x] 修改服务：[services/system-service.js](/Users/wangdafei/code/study_task_wechat/services/system-service.js)
  - 新增用户治理查询与更新接口

**中间件层（middleware/）**：

- [x] 新建中间件：`backend/middleware/systemUserAccess.js`
  - authoritative 拦截 `blocked / readonly`

**表现层（pages/）**：

- [x] 修改页面：[packageManage/pages/system-admin/system-admin.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/system-admin/system-admin.js)
  - 新增“用户权限治理”入口卡片
- [x] 新建页面：`packageManage/pages/system-user-governance/`
  - 系统用户治理列表页
- [x] 新建页面：`pages/system-blocked/`
  - 被禁入用户阻断页
- [x] 修改高频权限表达页面：
  - 首页、奖励页、家庭设置页及各管理页入口

### 数据模型

```typescript
type SystemAccessLevel = 'normal' | 'readonly' | 'blocked';

interface UserSystemGovernance {
  userId: string;
  role: 'parent' | 'child';
  isVirtual: boolean;
  isSystemAdmin: boolean;
  systemAccessLevel: SystemAccessLevel;
  systemAccessUpdatedAt: string | null;
  systemAccessUpdatedByUserId: string | null;
}
```

### 接口设计

**新增后端接口**：

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/system/admin/users/governance` | 查询系统级可治理用户列表 | 系统管理员 |
| `PATCH` | `/api/system/admin/users/:userId/access-level` | 更新目标用户系统访问级别 | 系统管理员 |

`GET /api/system/admin/users/governance`

响应体：

```json
{
  "users": [
    {
      "userId": "user_xxx",
      "nickname": "家长A",
      "role": "parent",
      "familyId": "fam_001",
      "familyPermissionRole": "manager",
      "isSystemAdmin": true,
      "systemAccessLevel": "normal",
      "systemAccessUpdatedAt": "2026-04-25T18:00:00.000Z",
      "systemAccessUpdatedByUserId": "admin_xxx"
    }
  ]
}
```

`PATCH /api/system/admin/users/:userId/access-level`

请求体：

```json
{
  "accessLevel": "readonly"
}
```

响应体：

```json
{
  "userId": "user_xxx",
  "systemAccessLevel": "readonly",
  "systemAccessUpdatedAt": "2026-04-25T18:05:00.000Z",
  "systemAccessUpdatedByUserId": "admin_xxx"
}
```

---

## 代码结构

### 文件变更清单

**新增文件**：

- `backend/database/migrations/018_add_user_system_access_governance.sql`
- `backend/services/systemUserGovernanceService.js`
- `backend/middleware/systemUserAccess.js`
- `backend/test/unit/systemUserGovernanceService.test.js`
- `backend/test/unit/systemUserAccessMiddleware.test.js`
- `backend/test/integration/system-user-governance-m22m-real.test.js`
- `packageManage/pages/system-user-governance/`
- `pages/system-blocked/`
- `test/pages/system-user-governance.page.test.js`
- `test/pages/system-blocked.page.test.js`

**修改文件**：

- `backend/models/User.js`
- `backend/services/userService.js`
- `backend/controllers/authController.js`
- `backend/controllers/systemAdminController.js`
- `backend/routes/system.js`
- `backend/server.js`
- `backend/middleware/auth.js`
- `models/user.js`
- `services/user-service.js`
- `services/system-service.js`
- `utils/user-context.js`
- `utils/permission-utils.js`
- `utils/http-client.js`
- `utils/app/bootstrap-auth.js`
- `utils/token-manager.js`
- `utils/api-config.js`
- `packageManage/pages/system-admin/`
- `pages/index/`
- `packageManage/pages/family-settings/`
- 其他高频管理页与入口壳

### 核心代码结构

```javascript
// backend/middleware/systemUserAccess.js
async function systemUserAccessMiddleware(req, res, next) {
  // 1. 回库读取最新用户
  // 2. blocked -> 403 SYSTEM_USER_BLOCKED
  // 3. readonly + 有持久化副作用的接口 -> 403 SYSTEM_USER_READONLY
  // 4. 挂到 req.systemUser 后继续
}

// backend/services/systemUserGovernanceService.js
class SystemUserGovernanceService {
  async listGovernableUsers() {
    // 查询所有真实登录用户
    // 按 blocked/readonly/normal 排序
  }

  async updateAccessLevel(targetUserId, accessLevel, operatorUserId) {
    // 校验目标用户
    // 校验 accessLevel
    // 校验最后 normal 系统管理员约束
    // 更新 users.system_access_level
  }
}

// packageManage/pages/system-user-governance/system-user-governance.js
Page({
  async onLoad() {
    // 加载治理列表
  },
  async onAccessLevelTap() {
    // 更新 normal / readonly / blocked
  }
});
```

---

## 实施步骤

### 第1步：补用户系统级治理字段与服务边界（预计4小时）

- [ ] **任务**：新增数据库迁移、扩展用户模型与后端服务
- [ ] **验证**：用户记录可正确携带 `systemAccessLevel`
- [ ] **依赖**：无

### 第2步：补后端动态守卫与系统治理接口（预计6小时）

- [ ] **任务**：新增 `systemUserAccessMiddleware`、治理查询/更新接口与最后管理员约束
- [ ] **验证**：blocked/readonly 在下一次请求时 authoritative 生效
- [ ] **依赖**：第1步

### 第3步：补系统治理页与 blocked/readonly 前端体验（预计8小时）

- [ ] **任务**：新增系统用户治理页、blocked 阻断页、系统只读 UI 收口
- [ ] **验证**：管理员可改、blocked 会拦、readonly 只能查
- [ ] **依赖**：第2步

**实施要点**：

1. `SYSTEM_USER_BLOCKED` 需要在 `utils/http-client.js` 和启动登录链路双处集中承接，不能把 blocked 处理分散到页面层各自判断。
2. [services/user-service.js](/Users/wangdafei/code/study_task_wechat/services/user-service.js) 命中 `SYSTEM_USER_BLOCKED` 时必须停止 `initialize()` 的 token fallback，blocked 跳转前必须清理旧 token 与缓存用户信息，避免自动登录死循环。
3. `local mode` 不做伪实现：
   - 系统管理页中的“用户权限治理”入口在 `ENABLE_API=false` 时显示为禁用态并带说明“仅云端模式可用”
   - 不允许继续进入治理页，更不允许展示本地伪列表
4. `readonly` 后端拦截要按“接口语义”而不是按 method 收口，查询型 `POST` 与未来的非持久化动作只能通过显式 allowlist 放行。
5. `readonly` 仍需在高频入口同步禁用写按钮，减少用户每次点击后才看到 403。

### 第4步：补测试与回归（预计6小时）

- [ ] **任务**：补齐后端单测、真实集成测试与前端页面/权限测试
- [ ] **验证**：关键治理链路回归通过
- [ ] **依赖**：第2步、第3步

---

## 测试方案

### 单元测试

**后端**：

- `systemUserGovernanceService`
  - 正常用户可切换到 `readonly / blocked / normal`
  - 非真实登录用户不可作为治理目标
  - 最后一个 `normal` 系统管理员不可被改成 `readonly / blocked`
- `systemUserAccessMiddleware`
  - `blocked` 用户所有受保护请求都被拒绝
  - `readonly` 用户的查询型 `POST` 允许，例如 `/api/task-templates/recommendations/query`
  - `readonly` 用户的写接口拒绝，例如模板启停、模板使用次数记录、任务/奖励编辑等
  - `normal` 用户继续放行
- `authController`
  - 已存在用户若被 blocked，登录应返回明确错误码

**前端**：

- `http-client`
  - `SYSTEM_USER_BLOCKED` 时统一清理会话并跳转阻断页
  - 多个并发 403 不会触发重复跳转
- 系统治理页
  - 正确展示列表
  - 同昵称用户仍可通过 `我` 标记和脱敏 `userId` 后缀区分
  - 切换访问级别成功后更新卡片状态
  - 当前管理员把自己改为 `readonly` 后，本页转为只读展示态
  - 当前管理员把自己改为 `blocked` 后，立即清会话并进入阻断页
  - 命中 `SYSTEM_ADMIN_REQUIRED` 时不展示普通失败卡，而是提示后返回上一页
  - 错误码提示正确
- blocked 页
  - 正确展示说明与重试按钮
- 启动登录链路
  - 冷启动登录命中 `SYSTEM_USER_BLOCKED` 时直接进入阻断页，而不是展示通用网络错误
  - `UserService.initialize()` 命中 `SYSTEM_USER_BLOCKED` 时不会再 fallback 构造旧 `loginUser`
- 权限工具
  - 系统 `readonly` 与家庭 `viewer` 叠加时保持系统级优先

### 集成测试

- 已登录用户被改成 `blocked` 后：
  - 下一次 `GET /api/auth/current` 返回 `SYSTEM_USER_BLOCKED`
  - 下一次任务/奖励接口请求返回 `SYSTEM_USER_BLOCKED`
  - 前端统一清理本地 token 并跳转 `system-blocked`
- 已登录用户被改成 `readonly` 后：
  - `GET` 类接口仍成功
  - 查询型 `POST` 仍成功
  - 真正写库的 `POST / PUT / PATCH / DELETE` 接口返回 `SYSTEM_USER_READONLY`
- 系统管理员治理接口：
  - 非管理员不可访问
  - 不可治理虚拟孩子
  - 最后一个正常系统管理员不可被限制
- local mode：
  - 系统管理页不开放治理入口跳转
  - 不出现本地伪治理数据

### 手动测试

1. 以系统管理员进入关于页，进入系统管理页，再进入“用户权限治理”页。
2. 把一个普通家长设为 `readonly`，验证其可登录、可查看，但首页新增、任务编辑、奖励管理等写入口被禁用或被拦截。
3. 把一个普通家长设为 `blocked`，验证其重新进入小程序时被阻断，不能继续浏览业务内容。
4. 把一个真实孩子设为 `readonly`，验证其不能再完成任务或兑换奖励，但仍能查看任务和奖励。
5. 准备两个昵称相同的真实用户，验证治理页仍能通过 `我` 标记和脱敏 `userId` 后缀分辨目标。
6. 尝试把最后一个正常系统管理员改成 `blocked` 或 `readonly`，验证被业务规则拒绝。
7. 用非最后一个正常系统管理员把自己改成 `readonly`，验证当前页转为只读态，不再允许继续治理操作。
8. 用非最后一个正常系统管理员把自己改成 `blocked`，验证成功后立即清会话并跳阻断页，而不是等待后续刷新报错。
9. 在 API mode 下让一个已登录用户被后台改成 `blocked`，验证其下一次请求后会被统一踢到阻断页，而不是停留在原页面只弹错误。
10. 在治理页停留时后台撤销当前用户系统管理员权限，验证前端提示后返回上一页，而不是展示普通加载失败。
11. 在 local mode 下进入系统管理页，验证“用户权限治理”入口不可进入，并有明确说明。

### 回归测试

- `M22A` 家庭 `manager / viewer` 治理
- `M22B` 系统管理员入口与系统管理页
- 登录态 bootstrap 与 `auth/current`
- 首页任务执行与奖励兑换入口

---

## 风险评估

### 风险1：把 readonly 简化成按 method 拦截，误伤查询型 POST 或漏放真实写接口

- **原因**：当前系统既有标准 REST 写接口，也有查询型 `POST`，仅凭 method 无法准确表达真实语义
- **应对**：
  - 统一中间件按“是否持久化写入 / 是否产生副作用”判定
  - 首期维护显式 allowlist，先覆盖已知查询型 `POST`
  - 补高风险接口集成测试兜底，避免语义漂移

### 风险2：blocked 用户的旧会话没有及时感知

- **原因**：当前没有推送机制，且 [services/user-service.js](/Users/wangdafei/code/study_task_wechat/services/user-service.js) 存在 `AUTH_CURRENT` 失败后 fallback 旧 token 用户态的真实逻辑
- **应对**：
  - authoritative 目标定义为“下一次 API 请求 / 下一次前台刷新”生效
  - 前端 bootstrap 和全局请求错误处理补齐 blocked 跳转
  - 清理旧 token 与缓存用户信息，避免自动重登循环
  - `initialize()` 命中 `SYSTEM_USER_BLOCKED` 时禁止 fallback 构造旧用户态

### 风险3：系统管理员把自己和其他管理员全部锁死

- **原因**：系统级治理比家庭权限更高，若无约束会产生自锁
- **应对**：
  - 增加“至少保留一个 normal 系统管理员”业务规则
  - 治理页显式提示受限原因

### 风险4：系统级 readonly 与家庭 viewer 表达混乱

- **原因**：两者都属于“不能改”，但层级不同
- **应对**：
  - 文档和代码中明确区分：
    - 家庭级：`familyPermissionRole`
    - 系统级：`systemAccessLevel`
  - 前端 reason code 也要区分 `viewer-readonly` 与 `system-readonly`

### 风险5：local mode 与 API mode 语义漂移

- **原因**：系统级治理 authoritative 依赖后端
- **应对**：
  - 明确 M22M 只在 API mode 下正式生效
  - local mode 不新增伪实现，避免口径继续分裂
  - 页面层明确禁用入口和说明文案，不让用户误以为功能已可用

---

## 替代方案

### 方案A：直接复用 `users.status`

**未选择原因**：

1. 现有 `status` 已承担活跃/失效语义。
2. 无法自然表达 `readonly`。
3. 旧代码中大量地方已把 `inactive` 当成“直接不存在”处理，风险过高。

### 方案B：把系统级只读继续塞到 `familyPermissionRole`

**未选择原因**：

1. `familyPermissionRole` 只适用于已加入家庭的家长，不适用于系统全局用户。
2. 这会继续混淆“家庭协作角色”和“系统使用资格”。
3. `blocked` 无法被该字段正确表达。

### 方案C：把用户治理直接并进当前系统管理页

**未选择原因**：

1. 当前系统页首期已经形成轻量心智，不适合堆长列表。
2. 准入开关和用户治理属于两类不同任务，强行放一页会降低可读性。

### 方案D：把系统级治理字段写进 JWT，前端自行判断

**未选择原因**：

1. 无法满足“管理员修改后尽量即时生效”的核心目标。
2. blocked/readonly 的 authoritative 边界仍会被旧 token 拖后。

---

## 审核要点自检

- [x] 已明确系统级 `normal / readonly / blocked` 与家庭 `manager / viewer` 是两层治理
- [x] 已说明为什么不能复用现有 `status`
- [x] 已明确动态生效依赖后端回库而不是旧 JWT
- [x] 已复用 `M22B` 系统管理员底座，没有另起一套入口
- [x] 已覆盖 blocked、readonly、最后管理员保护、前端体验与测试策略
- [x] 已补齐 blocked 的全局统一分流、登录阶段承接与 local mode 边界
- [x] 已把 readonly 从“按 method 一刀切”修正为“按接口语义治理”
