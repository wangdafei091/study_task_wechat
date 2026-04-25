# 里程碑-22B：系统管理员与动态准入底座 详细设计文档

> **设计状态**：✅ 已完成
> **创建日期**：2026-04-25
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **完成日期**：2026-04-25

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

`M22A` 已经把“应用级邀请制准入”做出来了，但当前准入开关仍然写死在 `process.env.APP_ACCESS_MODE`。这意味着每次切换开放制或邀请制，都要改环境变量并重启服务，既不够敏捷，也缺少一个正式的系统级操作入口。

`M22B` 的目标不是继续扩展邀请码玩法，而是先把“谁能改全局准入、从哪里进入、如何即时生效”这层底座正式建起来：引入系统管理员身份、增加一个轻量关于页作为隐藏入口载体，并把应用准入模式改成数据库权威配置，确保切换后不依赖重启。

### 业务价值

- [x] 用户价值：避免运营期因切换准入模式需要停服务或人工重启，减少不确定性。
- [x] 产品价值：把系统级治理能力从“运维约定”收口成可用的正式能力，为后续邀请链路统一和权限治理铺路。
- [x] 技术价值：建立系统管理员身份与全局配置存储基线，避免后续继续把安全能力分散在环境变量和临时脚本里。

### 功能范围

**包含**：

- [x] 引入系统管理员身份标记与后端权威校验
- [x] 新增轻量关于页，并作为隐藏系统入口载体
- [x] 关于页展示小程序二维码，作为传播与安装辅助信息
- [x] 新增系统管理页，首期只承载应用准入模式切换
- [x] 将应用准入模式从纯环境变量读取升级为“数据库优先、环境变量兜底”
- [x] 补齐系统管理员鉴权、迁移策略和自动化测试

**不包含**：

- [x] 不做系统级 `normal / readonly / blocked` 用户治理，这属于 `M22M`
- [x] 不做“邀请新用户进入小程序 / 邀请已有用户加入家庭”的统一邀请码链路，这属于 `M22L`
- [x] 不做系统管理员名单的页面化维护；首位系统管理员仍通过数据库手工指定
- [x] 不做管理员操作审计页、行为追踪或审批流
- [x] 不做 `nickname / avatar / gender / region` 采集扩展；其中 `nickname / avatar` 放到 `M22L` 一起收口，`gender / region` 暂不纳入当前主线

### 优先级

- **优先级**：P0
- **理由**：这是当前所有治理需求的共同前置条件。如果系统里没有正式的系统管理员入口和全局配置基线，后续 `M22M` 与 `M22L` 都只能继续依赖手工运维，治理闭环不成立。

---

## 现状问题复盘

### 问题1：当前应用准入模式只能靠环境变量切换

现有 [backend/services/appAccessService.js](/Users/wangdafei/code/study_task_wechat/backend/services/appAccessService.js) 中的 `getAccessMode()` 直接读取 `process.env.APP_ACCESS_MODE`。这带来三个直接问题：

1. 改模式必须重启服务。
2. 当前生效模式没有正式的数据库权威来源。
3. 小程序端没有地方可查看当前系统处于开放制还是邀请制。

### 问题2：系统级治理还没有“谁能操作”的正式身份

当前项目只有家庭内的 `manager / viewer` 治理能力，解决的是“谁能管理家庭”。但“谁能切换全局准入模式”属于另一层系统权限，现有代码中没有对应字段、没有对应接口，也没有正式鉴权中间件。

如果继续把全局准入改动交给随意脚本或环境变量操作，会出现：

1. 系统级能力和家庭级能力混淆。
2. 无法在小程序内形成受控入口。
3. 后续系统级权限治理没有稳定落点。

### 问题3：当前没有合适的隐藏入口承载页

当前前端没有现成的关于页，也没有“系统设置”容器页。若直接把系统入口塞进首页浮动菜单或家庭设置主操作区，会造成两个问题：

1. 系统治理入口过于显眼，和现有产品心智不匹配。
2. 普通用户会看到自己不该理解的全局概念。

因此需要一个用户可理解、又足够中性的载体页，最合适的就是轻量关于页。

### 问题4：系统管理员鉴权不能信任前端缓存或 JWT 旧声明

现有 [backend/middleware/auth.js](/Users/wangdafei/code/study_task_wechat/backend/middleware/auth.js) 只负责把 JWT payload 放入 `req.user`。如果未来把系统管理员身份直接塞进 token，再依赖 token 做放行，会产生两个问题：

1. 管理员资格被撤销后，旧 token 仍可能继续放行。
2. 系统级安全能力会和普通页面读缓存一样“最终一致”，不符合治理要求。

因此本期必须明确：系统管理员接口一律以后端实时回库校验为准。

### 问题5：必须兼容 `M22A` 已交付的 invite-only 行为

`M22A` 已经有：

- 应用级邀请码表 [backend/database/migrations/016_create_app_access_codes.sql](/Users/wangdafei/code/study_task_wechat/backend/database/migrations/016_create_app_access_codes.sql)
- 邀请制登录校验链路 [backend/controllers/authController.js](/Users/wangdafei/code/study_task_wechat/backend/controllers/authController.js)
- 前端邀请码页 [pages/access-gate/access-gate.js](/Users/wangdafei/code/study_task_wechat/pages/access-gate/access-gate.js)

`M22B` 不能破坏这条链路，只能替换“准入模式从哪里读”的 source of truth。

---

## 技术方案

### 方案概述

`M22B` 采用“四件事一次收口，但边界严格分层”的方案：

1. 在 `users` 表中新增最小化系统管理员标记，解决“谁有资格操作系统级配置”。
2. 新增 `system_settings` 表，承载应用准入模式等系统级配置，首期只落 `app_access_mode`。
3. 新增轻量关于页、小程序二维码和隐藏系统入口，作为系统管理页的前台承接面。
4. 新增系统管理员后端接口与鉴权中间件，所有系统级写操作一律回库校验。

这样做的目标不是一次把所有治理页面做完，而是先建立一套可靠的权威底座：

- 系统级身份有正式归属
- 全局开关有正式存储
- 隐藏入口有固定位置
- 后端放行有正式门槛

### 核心设计决策

#### 决策1：系统管理员首期采用 `users.is_system_admin` 最小字段，而不是独立权限表

本期新增用户字段：

```typescript
interface UserGovernanceFields {
  isSystemAdmin: boolean;
}
```

数据库层新增：

```sql
ALTER TABLE users
ADD COLUMN is_system_admin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否系统管理员';
```

选择理由：

1. 本期只有“是否系统管理员”一个系统级身份判断，使用单字段最直接。
2. 现有 `users` 已是认证、登录和身份主表，不需要再额外引入 join 才能做系统放行。
3. `M22M` 后续新增系统级 `normal / readonly / blocked` 时，仍可在 `users` 表继续扩展，不会和 `familyPermissionRole` 冲突。

边界说明：

- 首期只允许 `role='parent'` 的真实用户被标记为系统管理员，不支持孩子或虚拟成员承担系统治理职责。
- 首位系统管理员仍通过数据库手工指定，不提供“自助申请管理员”或“页面内提权”能力。
- `M22B` 不做系统管理员名单管理页，避免 scope 膨胀。

#### 决策2：系统级配置采用通用 `system_settings` 表，首期只落一个 key

新增表：

```typescript
interface SystemSettingRecord {
  settingKey: string;
  settingValue: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

建议表结构：

```sql
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(64) PRIMARY KEY COMMENT '配置键',
  setting_value VARCHAR(255) NOT NULL COMMENT '配置值',
  updated_by_user_id VARCHAR(36) DEFAULT NULL COMMENT '最后更新人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统级配置表';
```

首期只使用一个键：

| setting_key | 合法值 | 说明 |
|------------|--------|------|
| `app_access_mode` | `open` / `invite_only` | 应用当前准入模式 |

选择理由：

1. 当前项目还没有系统配置表，直接补通用表比“再做一个只存单字段的专用表”更稳。
2. 后续 `M22M`、`M22L` 可能继续有全局治理开关，可复用同一套读写基础。
3. 首期只用一个 key，可以保持实现简单，不会带来抽象过度。

#### 决策3：应用准入模式采用“数据库优先；非法 DB 配置显式报错；仅无记录时才回退”的兼容迁移策略

新的读取顺序：

1. 优先读取 `system_settings.app_access_mode`
2. 若数据库已有记录但值非法，直接返回 `SYSTEM_SETTING_CORRUPTED`
3. 若数据库无记录，再回退到 `process.env.APP_ACCESS_MODE`
4. 若环境变量也缺失，则按现有默认行为落为 `open`

这意味着：

1. 旧环境可以平滑升级，不会因为还没手工插入配置就改变线上行为。
2. 一旦系统管理员在小程序里保存过模式，数据库就成为新的正式权威来源。
3. 如果数据库配置被误写脏值，系统会明确进入“配置异常待修复”状态，而不是悄悄回退到旧值。
4. 切换后下一次登录立即生效，不依赖服务重启。

#### 决策4：系统管理员鉴权一律回库，不把管理员资格写入 JWT

新增后端鉴权能力：

- `authMiddleware` 继续负责基础登录态
- 新增 `systemAdminMiddleware`
- `systemAdminMiddleware` 每次都从数据库读取最新用户记录，检查：
  - 用户存在且 `status='active'`
  - `role='parent'`
  - `is_system_admin = 1`

只有满足条件才允许进入系统管理写接口。

选择理由：

1. 系统级权限安全级别高，不能允许旧 token 长时间持有旧管理员资格。
2. 这样做还能和 `M22M` 的“动态禁入 / 只读尽量即时生效”思路保持一致。
3. 当前系统级接口很少，回库成本可接受。

#### 决策5：隐藏入口放在新增“关于页”的版本区，采用多次点击触发

前端新增两个页面：

1. `packageManage/pages/about/about`
2. `packageManage/pages/system-admin/system-admin`

入口方案：

1. 在家庭设置页页面级公共底部新增一个显性但中性的“关于小CEO日程表”入口
2. 用户进入关于页后，可查看版本、产品说明、当前环境等轻量信息
3. 连续点击版本信息 7 次，触发隐藏系统入口检测
4. 只有当前用户是系统管理员时，才跳转到系统管理页

选择理由：

1. 关于页符合用户认知，承载“版本信息 + 隐藏入口”最自然。
2. 不需要在首页或家庭设置主操作区暴露新的系统级按钮。
3. 多击版本号是成熟心智，维护成本低，也不会误导普通用户。

交互约束：

- 家庭设置页无论处于“未加入家庭”还是“已加入家庭”状态，都必须展示该入口。
- 入口属于页面级公共 footer，不得只挂在某一个业务卡片内部。
- 版本点击计数窗口为 2 秒，超时自动清零
- 非系统管理员触发时不暴露错误堆栈，不进入系统页
- 系统管理页即使被直接输入路径访问，也必须再次走后端鉴权校验

#### 决策5A：关于页固定展示小程序二维码，但二维码不参与系统入口语义

关于页内容拆为两层：

1. **对所有用户可见的公开信息区**
   - 产品名
   - 当前版本号
   - 简短产品说明
   - 小程序二维码
2. **隐藏系统入口触发区**
   - 仅版本信息区域承担 7 次连击探测
   - 二维码区域只负责查看，不承载任何隐藏操作

二维码设计约束：

1. 二维码使用前端静态资源，不走后端动态配置。
2. 二维码资源放在 `packageManage` 分包内或其可复用静态资源目录，避免为此增加主包体积。
3. 页面支持点击二维码后使用 `wx.previewImage` 预览大图。
4. 正式环境展示二维码；开发/测试环境不展示二维码实图，只展示“二维码仅在正式环境提供”的说明文案。
5. 首期不做“保存到相册”“动态替换二维码”“多环境二维码切换”。

选择理由：

1. 这是稳定展示物料，不值得为首期引入后台配置链路。
2. 把二维码和隐藏入口语义拆开，能避免用户把“扫二维码”和“进入管理”误认为同一件事。
3. 当前项目已有真实的运行时环境区分，开发/测试环境隐藏实图比强行做多套二维码更稳，也能避免误扫到正式小程序。
4. 点击预览已经能满足大多数查看需求，交互足够简单。

#### 决策6：系统管理页首期只提供一个核心能力，不做“大而全后台”

系统管理页首期只展示：

1. 当前应用准入模式
2. 模式说明文案
3. `open / invite_only` 切换控件
4. 最后更新时间与最近更新人（若有）

不在本期加入：

- 应用邀请码生成列表
- 用户封禁与只读调整
- 管理员名单维护
- 系统审计日志

这样可以把 `M22B` 严格收口为“底座”，不和 `M22M / M22L` 的真正业务治理页面混在一起。

### DDD分层设计

**领域层（models/）**：

- [x] 修改模型：[backend/models/User.js](/Users/wangdafei/code/study_task_wechat/backend/models/User.js)
  - 补 `isSystemAdmin`
- [x] 新建模型：[backend/models/SystemSetting.js](/Users/wangdafei/code/study_task_wechat/backend/models/SystemSetting.js)
  - 描述系统配置记录与合法值

**服务层（services/）**：

- [x] 修改服务：[backend/services/appAccessService.js](/Users/wangdafei/code/study_task_wechat/backend/services/appAccessService.js)
  - 仅保留邀请码能力，并委托新的模式读取逻辑
- [x] 新建服务：[backend/services/systemSettingService.js](/Users/wangdafei/code/study_task_wechat/backend/services/systemSettingService.js)
  - 负责读取 / upsert `app_access_mode`
- [x] 新建服务：[backend/services/systemAdminService.js](/Users/wangdafei/code/study_task_wechat/backend/services/systemAdminService.js)
  - 负责管理员资格校验与系统页聚合信息

**仓储层（repositories/）**：

- [ ] 不单独新增仓储
- 说明：当前后端仍以 service + SQL 为主，本期延续现有模式，避免只为单表引入孤立仓储层风格偏差

**适配器层（adapters/）**：

- [ ] 不涉及

**表现层（pages/、components/）**：

- [x] 新建页面：`packageManage/pages/about/`
- [x] 新建页面：`packageManage/pages/system-admin/`
- [x] 修改页面：[packageManage/pages/family-settings/family-settings.js](/Users/wangdafei/code/study_task_wechat/packageManage/pages/family-settings/family-settings.js)
  - 增加关于页入口
- [x] 新建服务：`services/system-service.js`
  - 封装系统管理相关接口
- [x] 修改配置：[app.json](/Users/wangdafei/code/study_task_wechat/app.json)、[utils/api-config.js](/Users/wangdafei/code/study_task_wechat/utils/api-config.js)
  - 注册页面与接口常量

### 架构图

```mermaid
graph TD
    A[家庭设置页] --> B[关于页]
    B -->|连续点击版本 7 次| C[系统入口探测]
    C -->|管理员| D[系统管理页]
    D --> E[SystemService]
    E --> F[/api/system/admin/*]
    F --> G[systemAdminMiddleware]
    G --> H[systemAdminService]
    H --> I[systemSettingService]
    I --> J[(system_settings)]
    F --> K[appAccessService]
    K --> L[(app_access_codes)]
```

### 数据模型

```typescript
type AppAccessMode = 'open' | 'invite_only';

interface SystemSetting {
  settingKey: 'app_access_mode' | string;
  settingValue: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SystemAdminBootstrap {
  canEnterSystemAdmin: boolean;
}

interface SystemAdminOverview {
  appAccessMode: AppAccessMode;
  modeSource: 'db' | 'env' | 'default';
  updatedAt: string | null;
  updatedByUserId: string | null;
}
```

### 接口设计

**新增后端接口**：

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/system/admin/bootstrap` | 返回当前用户是否具备进入系统管理页的资格 | 已登录 |
| `GET` | `/api/system/admin/overview` | 返回系统管理页所需的准入模式摘要 | 系统管理员 |
| `PATCH` | `/api/system/admin/app-access-mode` | 修改应用准入模式 | 系统管理员 |

`GET /api/system/admin/bootstrap`

响应体：

```json
{
  "canEnterSystemAdmin": true
}
```

`GET /api/system/admin/overview`

响应体：

```json
{
  "appAccessMode": "open",
  "modeSource": "db",
  "updatedAt": "2026-04-25T10:00:00.000Z",
  "updatedByUserId": "user_xxx"
}
```

`PATCH /api/system/admin/app-access-mode`

请求体：

```json
{
  "mode": "open"
}
```

响应体：

```json
{
  "appAccessMode": "open",
  "modeSource": "db",
  "updatedAt": "2026-04-25T10:00:00.000Z",
  "updatedByUserId": "user_xxx"
}
```

错误码建议：

| 错误码 | 含义 |
|--------|------|
| `SYSTEM_ADMIN_REQUIRED` | 当前用户不是系统管理员 |
| `SYSTEM_SETTING_INVALID` | 提交了非法模式值 |
| `SYSTEM_SETTING_CORRUPTED` | 数据库中的系统准入配置已损坏，需要管理员重新修复 |
| `SYSTEM_SETTING_UPDATE_FAILED` | 系统配置更新失败 |

---

## 代码结构

### 文件变更清单

**新增文件**：

- `backend/database/migrations/017_add_system_admin_and_settings.sql` - 新增 `users.is_system_admin` 和 `system_settings`
- `backend/models/SystemSetting.js` - 系统配置模型
- `backend/services/systemSettingService.js` - 系统配置读写服务
- `backend/services/systemAdminService.js` - 系统管理员聚合服务
- `backend/middleware/systemAdmin.js` - 系统管理员鉴权中间件
- `backend/controllers/systemAdminController.js` - 系统管理接口控制器
- `backend/routes/system.js` - 系统管理路由
- `services/system-service.js` - 小程序系统接口服务
- `packageManage/pages/about/` - 关于页
- `packageManage/pages/system-admin/` - 系统管理页
- `packageManage/assets/about/mini-program-qrcode.png` - 关于页二维码静态资源
- `test/services/system-service.test.js` - 前端系统服务测试
- `test/pages/about.page.test.js` - 关于页行为测试
- `test/pages/system-admin.page.test.js` - 系统管理页行为测试
- `backend/test/unit/systemSettingService.test.js` - 后端系统配置服务测试
- `backend/test/unit/systemAdminController.test.js` - 后端系统控制器测试
- `backend/test/unit/systemAdminMiddleware.test.js` - 后端系统管理员中间件测试
- `backend/test/integration/auth-api-m22b-real.test.js` - 动态准入真实集成测试

**修改文件**：

- `backend/models/User.js` - 增加 `isSystemAdmin`
- `backend/services/userService.js` - 读取/写入 `isSystemAdmin`
- `backend/services/appAccessService.js` - 模式解析切换到 `systemSettingService`
- `backend/controllers/authController.js` - 邀请制判断改用数据库优先配置
- `backend/middleware/auth.js` - 保持原职责，不扩张为系统管理员放行
- `backend/server.js` - 注册 `/api/system`
- `packageManage/pages/family-settings/family-settings.js` - 新增关于页跳转
- `packageManage/pages/family-settings/family-settings.wxml` - 新增关于入口
- `utils/api-config.js` - 新增系统接口常量
- `app.json` - 注册新页面

### 核心代码结构

```javascript
// backend/services/systemSettingService.js
class SystemSettingService {
  async getAppAccessMode() {
    // 1. 读 DB
    // 2. 没有则回退 env
    // 3. 返回 mode + source + metadata
  }

  async updateAppAccessMode(mode, operatorUserId) {
    // 校验 mode
    // UPSERT system_settings
  }
}

// backend/middleware/systemAdmin.js
async function systemAdminMiddleware(req, res, next) {
  // 1. 校验登录态
  // 2. 读取最新用户记录
  // 3. 检查 is_system_admin
}

// packageManage/pages/about/about.js
Page({
  onVersionTap() {
    // 2 秒窗口累计 7 次
    // 达标后请求 bootstrap
    // 管理员才跳到 system-admin
  },

  onQrcodeTap() {
    // 预览二维码大图
  }
});
```

### 关键函数

**函数1**：`systemSettingService.getAppAccessMode()`

- **输入**：无
- **输出**：`{ mode, source, updatedAt, updatedByUserId }`
- **职责**：统一应用准入模式的权威读取口径
- **依赖**：`system_settings`、环境变量兜底逻辑

**函数2**：`systemAdminService.getBootstrapContext(userId)`

- **输入**：`userId`
- **输出**：`{ canEnterSystemAdmin }`
- **职责**：为关于页隐藏入口提供最小权限探测结果
- **依赖**：`userService.findById()`

**函数3**：`systemAdminService.getOverview()`

- **输入**：无
- **输出**：`{ appAccessMode, modeSource, updatedAt, updatedByUserId }`
- **职责**：为系统管理页提供完整模式摘要
- **依赖**：`systemSettingService.getAppAccessMode()`

**函数4**：`systemAdminController.updateAppAccessMode(req, res)`

- **输入**：`req.body.mode`
- **输出**：更新后的模式摘要
- **职责**：执行系统管理员模式切换
- **依赖**：`systemAdminMiddleware`、`systemSettingService.updateAppAccessMode(...)`

---

## 实施步骤

### 第1步：补系统管理员字段与系统配置表（已完成）

- [x] **任务**：已新增数据库迁移，给 `users` 增加 `is_system_admin`，新增 `system_settings`
- [x] **验证**：测试库结构已补齐；`users` 老数据默认 `is_system_admin=0`
- [x] **依赖**：无

**实施要点**：

1. 迁移必须保持对现有数据无破坏。
2. `system_settings` 不强制插入初始 `app_access_mode` 记录，避免部署时与现有 env 配置冲突。
3. 文档中明确“首位管理员需手工在 DB 标记”。

### 第2步：完成后端系统配置读写与系统管理员鉴权（已完成）

- [x] **任务**：已补 `systemSettingService`、`systemAdminService`、`systemAdminMiddleware` 和系统接口
- [x] **验证**：模式切换后，无需重启，下一次新用户登录按新模式执行
- [x] **依赖**：第1步

**实施要点**：

1. `appAccessService` 不再直接读环境变量作为唯一来源。
2. 所有系统管理写接口必须经过 `systemAdminMiddleware`。
3. `bootstrap` 接口只返回最小权限探测结果，不返回系统治理摘要，也不返回重复状态字段。
4. 当数据库存在非法 `app_access_mode` 时，`auth/login` 返回 `503 + SYSTEM_SETTING_CORRUPTED`，系统管理页进入“修复态”，不再静默回退。

### 第3步：补关于页、隐藏入口与系统管理页（已完成）

- [x] **任务**：已新增关于页、二维码展示与预览、隐藏多击入口、系统管理页和家庭设置页跳转
- [x] **验证**：普通用户可查看关于页与二维码；系统管理员连击后可进入系统页并切模式
- [x] **依赖**：第2步

**实施要点**：

1. 关于页视觉保持轻量，不做复杂运营信息堆叠；二维码作为公开信息块独立展示，且仅在正式环境展示实图。
2. 系统管理页首期只保留一个主动作，避免“伪后台感”。
3. 非系统管理员直达系统页时，要有明确拦截和回退。
4. 系统管理页已补齐三态：正常态、概览失败错误态、`SYSTEM_SETTING_CORRUPTED` 修复态。

### 第4步：补测试与回归（已完成）

- [x] **任务**：已补齐后端单测、真实集成测试、前端页面/服务测试
- [x] **验证**：核心自动化通过，并完成手工准入切换回归
- [x] **依赖**：第2步、第3步

**实施要点**：

1. 必须覆盖“先 open，再切 invite_only，再切回 open”的动态切换链路。
2. 必须覆盖“非管理员无法写系统配置”和“直接访问系统页被拒绝”。
3. 继续确保 `M22A` 的 access gate 页面与邀请码登录链路不回归。

---

## 测试方案

### 单元测试

**后端**：

- `systemSettingService`
  - 无 DB 配置时应回退 env
  - DB 有值时应覆盖 env
  - 非法值应拒绝写入
  - DB 存在非法值时应抛出 `SYSTEM_SETTING_CORRUPTED`
- `systemAdminMiddleware`
  - `is_system_admin=1` 时放行
  - 非管理员返回 `SYSTEM_ADMIN_REQUIRED`
- `authController`
  - invite-only 判断改为读取新模式来源后仍保持原有错误码

**前端**：

- 关于页
  - 正式环境正确展示二维码，并支持点击预览
  - 开发/测试环境不展示二维码实图，只展示说明文案
  - 连续点击未达 7 次不触发系统探测
  - 超时后计数清零
  - 达到阈值后仅管理员进入系统页
- 系统管理页
  - 正确展示当前模式
  - 切换成功后刷新展示
  - 非法模式或接口失败时提示清晰
  - `SYSTEM_SETTING_CORRUPTED` 时进入修复态而不是展示默认开放态

### 集成测试

- `auth/login`
  - DB 为 `open` 时，新用户无需邀请码
  - DB 为 `invite_only` 时，新用户必须输入邀请码
  - 模式切换后不重启服务，下一次登录立即按新模式执行
- 系统管理接口
  - 非管理员读取 bootstrap 时只返回最小布尔结果
  - 管理员读取 overview 时返回完整模式摘要
  - 非管理员写配置返回 403
  - 管理员写配置成功后数据库记录更新 `updated_by_user_id`

### 手动测试

1. 在“未加入家庭”状态进入家庭设置页，验证页面底部能看到关于页入口。
2. 在“已加入家庭”状态进入家庭设置页，验证页面底部同样能看到关于页入口。
3. 以普通家长进入关于页，验证能看到基础信息；正式环境可看到二维码并支持预览，开发/测试环境只显示说明文案，且无法进入系统页。
4. 以系统管理员进入关于页，连续点击版本号 7 次，验证可进入系统管理页。
5. 在系统管理页把模式切到 `invite_only`，使用一个全新微信账号登录，验证必须进入邀请码页。
6. 再把模式切回 `open`，使用另一个全新微信账号登录，验证无需邀请码即可进入。
7. 验证已有老用户在两种模式间切换时都仍可正常登录。
8. 验证二维码区域点击、预览行为不会触发隐藏入口计数。

### 回归测试

- `M22A` 应用邀请码消费链路
- 家庭邀请码加入链路
- 家庭设置页已有权限逻辑
- access-gate 页面缓存邀请码与重试逻辑

### 实际验证结果

- 前端页面/服务回归已通过：
  - `npm test -- --runInBand test/pages/about.page.test.js test/pages/system-admin.page.test.js test/pages/family-settings.page.test.js test/services/system-service.test.js test/models/user.test.js test/services/user-service.test.js`
- 后端单元回归已通过：
  - `npm run test:backend:unit -- authController.test.js systemAdminController.test.js systemSettingService.test.js`
- 真实数据库集成回归已通过：
  - `npm --prefix backend run test -- --runInBand test/integration/auth-api-m22b-real.test.js`
- 模拟器日志与数据库抽检已通过：
  - 已确认系统管理员在关于页进入系统管理页后，可成功把 `app_access_mode` 改为 `invite_only`
  - `system_settings` 中已落库 `setting_key=app_access_mode`、`setting_value=invite_only`
  - `updated_by_user_id` 与操作日志中的管理员用户一致

---

## 风险评估

### 风险1：模式切换后出现“显示已切换，但登录仍按旧模式”

- **原因**：若代码仍在某处直接读 `process.env.APP_ACCESS_MODE`，会产生双来源
- **应对**：
  - 全量搜索并收口 `APP_ACCESS_MODE` 使用点
  - 自动化覆盖动态切换场景

### 风险2：没有首位管理员，导致系统管理页永远无人可进

- **原因**：本期不做管理员名册维护页
- **应对**：
  - 设计中明确手工 bootstrap 流程
  - 只把这件事保留为运维初始化动作，不让页面自助提权

### 风险3：普通用户误触隐藏入口后产生困惑

- **原因**：多次点击版本区域可能偶发触发
- **应对**：
  - 使用 7 次点击 + 2 秒窗口，降低误触概率
  - 非管理员不展示复杂报错，只做静默失败或轻提示

### 风险3A：二维码资源放置不当导致主包再次膨胀

- **原因**：关于页新增图片资源，如果误放入主包公共目录，会拉高主包体积
- **应对**：
  - 二维码资源放入 `packageManage` 分包目录
  - 实施后复查微信开发工具包体结果

### 风险3B：开发或测试环境误展示正式二维码，造成环境认知错乱

- **原因**：当前项目前端本身存在运行时环境区分，如果所有环境都展示同一张正式码，测试操作容易偏离当前环境
- **应对**：
  - 关于页按运行时环境控制二维码展示
  - 非正式环境只展示说明文案，不展示正式二维码图片

### 风险4：把系统治理和家庭治理混成一套权限

- **原因**：当前项目已存在 `manager / viewer`
- **应对**：
  - 文档和代码中显式区分：
    - 家庭内治理：`familyPermissionRole`
    - 系统级治理：`isSystemAdmin`
  - 接口和页面命名都避免沿用家庭“管理员”语义

### 风险5：为后续里程碑提前做过度抽象

- **原因**：治理需求多，容易想一次做完
- **应对**：
  - `M22B` 只做一个系统级配置 key
  - 不提前做用户禁入、不提前做邀请码统一、不提前做审计后台

---

## 替代方案

### 方案A：继续用环境变量 + 运维重启

**未选择原因**：

1. 不满足“数据库动态切换、不重启生效”的明确目标。
2. 运营成本高，容易出现环境值和实际状态认知不一致。

### 方案B：单独新建 `system_admins` 表维护管理员名单

**未选择原因**：

1. 本期只有一个布尔型系统身份判断，引入独立表成本偏高。
2. 每个系统管理接口都要额外 join 或二次查询，收益不足。
3. 先用 `users.is_system_admin` 更符合当前最小可行底座目标。

### 方案C：直接把隐藏入口做在首页或家庭设置主按钮区

**未选择原因**：

1. 首页是高频任务页，不适合承载系统治理入口。
2. 家庭设置主区域已经承担家庭治理能力，再混入系统治理会让信息层级变脏。
3. 关于页更中性，也更符合多击版本号的用户心智。

### 方案D：把系统管理员身份写进 JWT，前端直接据此控制页面

**未选择原因**：

1. 无法满足系统级权限变更尽量即时生效的安全目标。
2. 旧 token 持续有效会放大治理风险。
3. 本期系统接口很少，回库鉴权更稳。

---

## 审核要点自检

- [x] 已明确 `M22B` 只做系统管理员与动态准入底座，不混入 `M22M / M22L`
- [x] 已基于真实代码现状说明为什么必须做 DB 配置与新入口
- [x] 已给出数据模型、接口、页面入口、迁移策略和兼容策略
- [x] 已明确系统管理员接口以后端回库校验为准，不依赖 JWT 旧声明
- [x] 已覆盖自动化测试、手工回归、日志/数据库抽检和主要风险
- [x] 已同步最终落地口径：数据库脏值显式报错，系统管理页存在错误态与修复态
