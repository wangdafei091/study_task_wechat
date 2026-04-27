# 后端 REST API 契约

> 项目后端 HTTP/REST 接口的权威说明文档
> **最后更新**：2026-04-25
> **维护者**：项目维护团队

---

## 文档定位

- 本文档描述后端 Express 服务对外暴露的 REST 接口契约
- 本文档聚焦 HTTP 路径、认证方式、关键参数、统一响应格式和常见错误码
- 前端服务层接口说明请参阅 [services-guide.md](./services-guide.md)
- 后端真实数据库集成测试说明请参阅 [backend/test/README.md](../../backend/test/README.md)

---

## 1. 通用约定

### 1.1 基础入口

- 健康检查：`GET /health`
- 根信息：`GET /`
- 业务接口前缀：`/api`

### 1.2 认证方式

- 除 `POST /api/auth/login`、`GET /health`、`GET /` 外，其余接口默认使用 Bearer Token
- Header 格式：

```http
Authorization: Bearer <token>
```

- JWT 认证成功后，服务端在 `req.user` 中解析出：
  - `userId`
  - `openid`
  - `role`
  - `familyId`
  - `familyPermissionRole`

### 1.3 统一响应格式

成功响应：

```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

失败响应：

```json
{
  "success": false,
  "data": null,
  "message": "错误说明",
  "error_code": "ERROR_CODE"
}
```

说明：
- 统一响应壳由 `backend/utils/response.js` 与错误中间件共同约束
- 各接口的 `data` 结构按业务对象不同而变化

### 1.4 常见 HTTP 状态码

| 状态码 | 含义 | 常见场景 |
|--------|------|---------|
| `200` | 请求成功 | 查询、更新、删除、状态切换 |
| `400` | 参数或业务校验失败 | 缺少参数、非法状态、邀请码无效 |
| `401` | 未认证或 token 无效 | 未提供 token、token 过期 |
| `403` | 权限不足 | 跨家庭访问、孩子越权管理奖励 |
| `404` | 资源不存在 | 任务/奖励/消息/用户不存在 |
| `409` | 幂等或资源冲突 | taskId 冲突、奖励已兑换 |
| `500` | 服务端错误 | 未分类异常 |

### 1.5 文档条目模板

后续新增接口时，建议按以下骨架补充：

```markdown
#### [接口名称]

- Method: `POST | GET | PUT | PATCH | DELETE`
- Path: `/api/...`
- Auth: `Public | Bearer Token`
- Query: [关键查询参数，若无则写“无”]
- Body: [关键请求体字段，若无则写“无”]

成功响应：
- Status: `200 / 201`
- Body: `{ success, data, message }`

常见错误：
- `400` - [参数或业务校验失败]
- `401` - [未认证或 token 失效]
- `403` - [权限不足]
- `404` - [资源不存在]
```

---

## 2. 系统入口

### 2.1 健康检查

- Method: `GET`
- Path: `/health`
- Auth: `Public`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body: `{ status, timestamp, uptime, environment }`

### 2.2 服务根信息

- Method: `GET`
- Path: `/`
- Auth: `Public`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body: `{ name, version, description, endpoints }`

---

## 3. 认证接口

### 3.1 微信登录

- Method: `POST`
- Path: `/api/auth/login`
- Auth: `Public`
- Query: 无
- Body：
  - `code` - 微信登录 code
  - `accessCode` - 可选；当当前权威准入模式为 `invite_only` 且当前为新用户创建时必填

成功响应：
- Status: `200`
- Body：`data.token`、`data.user`

常见错误：
- `400` - `AUTH_INVALID_PARAMS` / `AUTH_WECHAT_LOGIN_FAILED`
- `400` - `AUTH_APP_ACCESS_CODE_REQUIRED` / `AUTH_APP_ACCESS_CODE_INVALID` / `AUTH_APP_ACCESS_CODE_EXPIRED`
- `503` - `SYSTEM_SETTING_CORRUPTED`
- `500` - `AUTH_LOGIN_FAILED`

说明：
- 邀请制只拦截“新用户创建”，已有用户在 `invite_only` 模式下仍可正常登录
- 准入模式读取口径为“数据库优先；仅在无数据库记录时回退环境变量”；若数据库已有非法值，登录接口会返回 `503 + SYSTEM_SETTING_CORRUPTED`
- `data.user` 在家长已加入家庭时会包含 `familyPermissionRole`

### 3.2 验证 Token

- Method: `GET`
- Path: `/api/auth/validate`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.valid`、`data.userId`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `AUTH_VALIDATE_FAILED`

### 3.3 获取当前用户

- Method: `GET`
- Path: `/api/auth/current`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：当前登录用户对象

说明：
- 当前登录用户对象包含 `familyPermissionRole`；当用户是孩子或尚未加入家庭的家长时，该字段为 `null`

常见错误：
- `404` - `USER_NOT_FOUND`
- `500` - `USER_GET_FAILED`

---

## 3.4 系统管理接口

### 3.4.1 获取系统入口探测信息

- Method: `GET`
- Path: `/api/system/admin/bootstrap`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：
  ```json
  {
    "success": true,
    "data": {
      "canEnterSystemAdmin": true
    },
    "message": "获取成功"
  }
  ```

说明：
- 该接口只返回最小布尔结果，用于关于页隐藏入口探测
- 只要已登录即可访问；不会返回系统管理摘要，也不会暴露当前准入模式

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `SYSTEM_BOOTSTRAP_FAILED`

### 3.4.2 获取系统管理概览

- Method: `GET`
- Path: `/api/system/admin/overview`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：
  ```json
  {
    "success": true,
    "data": {
      "appAccessMode": "invite_only",
      "modeSource": "db",
      "updatedAt": "2026-04-25T15:09:45.000Z",
      "updatedByUserId": "user_xxx"
    },
    "message": "获取成功"
  }
  ```

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `500` - `SYSTEM_OVERVIEW_FAILED`
- `500` - `SYSTEM_SETTING_CORRUPTED`

说明：
- `modeSource` 取值为 `db | env | default`
- 若数据库存在非法 `app_access_mode`，接口会返回 `SYSTEM_SETTING_CORRUPTED`，前端应进入“修复态”而不是假装展示默认开放态

### 3.4.3 更新应用准入模式

- Method: `PATCH`
- Path: `/api/system/admin/app-access-mode`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body：
  - `mode` - `open | invite_only`

成功响应：
- Status: `200`
- Body：
  ```json
  {
    "success": true,
    "data": {
      "appAccessMode": "open",
      "modeSource": "db",
      "updatedAt": "2026-04-25T15:09:45.000Z",
      "updatedByUserId": "user_xxx"
    },
    "message": "更新成功"
  }
  ```

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `400` - `SYSTEM_SETTING_INVALID`
- `500` - `SYSTEM_SETTING_UPDATE_FAILED`

说明：
- 写入成功后，数据库立即成为权威来源；后续新用户登录无需重启服务即可按新模式执行
- 该接口只影响“新用户是否需要邀请码”；已有用户登录不受影响

### 3.4.4 获取新用户邀请码全局治理概览

- Method: `GET`
- Path: `/api/system/admin/invite-governance`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.quotaTotal`、`data.quotaUsed`、`data.quotaRemaining`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `500` - `SYSTEM_INVITE_GOVERNANCE_GET_FAILED`

说明：
- 该接口只统计第一类邀请码 `admission_only` 的全局成功消费量

### 3.4.5 更新新用户邀请码全局治理概览

- Method: `PATCH`
- Path: `/api/system/admin/invite-governance`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body：
  - `quotaTotal` - `number | null`

成功响应：
- Status: `200`
- Body：`data.quotaTotal`、`data.quotaUsed`、`data.quotaRemaining`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `400` - `INVITE_CODE_GLOBAL_QUOTA_INVALID`
- `500` - `SYSTEM_INVITE_GOVERNANCE_UPDATE_FAILED`

说明：
- `quotaTotal=null` 表示未配置全局上限

### 3.4.6 获取系统用户治理列表

- Method: `GET`
- Path: `/api/system/admin/users/governance`
- Auth: `Bearer Token + System Admin`
- Query：
  - `keyword` - 按昵称或 `userId` 后 4 位模糊筛选
  - `accessLevel` - `all | normal | readonly | blocked`
  - `role` - `all | parent | child`
  - `canIssueAdmissionCode` - `all | true | false`
- Body: 无

成功响应：
- Status: `200`
- Body：`data.users`、`data.summary`、`data.nextCursor`、`data.hasMore`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `500` - `SYSTEM_USER_GOVERNANCE_LIST_FAILED`

说明：
- 当前返回仍为单页全量结果，`nextCursor=''`、`hasMore=false`
- `canIssueAdmissionCode` 筛选按“当前有效发码能力”判断，而不是只看原始字段

### 3.4.7 更新用户系统访问级别

- Method: `PATCH`
- Path: `/api/system/admin/users/:userId/access-level`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body：
  - `accessLevel` - `normal | readonly | blocked`

成功响应：
- Status: `200`
- Body：`data.userId`、`data.systemAccessLevel`、`data.systemAccessUpdatedAt`、`data.systemAccessUpdatedByUserId`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `400` - `SYSTEM_USER_GOVERNANCE_INVALID` / `SYSTEM_USER_GOVERNANCE_TARGET_INVALID`
- `409` - `SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED`
- `500` - `SYSTEM_USER_GOVERNANCE_UPDATE_FAILED`

说明：
- 当用户被降为 `readonly / blocked` 时，后端会同时失效该用户已生成的有效邀请码

### 3.4.8 更新用户新用户发码能力

- Method: `PATCH`
- Path: `/api/system/admin/users/:userId/admission-issuer`
- Auth: `Bearer Token + System Admin`
- Query: 无
- Body：
  - `canIssueAdmissionCode` - `boolean`
  - `admissionCodeQuotaTotal` - `number | null`

成功响应：
- Status: `200`
- Body：`data.userId`、`data.canIssueAdmissionCode`、`data.admissionCodeQuotaTotal`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `SYSTEM_ADMIN_REQUIRED`
- `400` - `SYSTEM_USER_GOVERNANCE_INVALID` / `SYSTEM_USER_GOVERNANCE_TARGET_INVALID`
- `500` - `SYSTEM_USER_INVITE_GOVERNANCE_UPDATE_FAILED`

说明：
- 仅正常状态的家长可配置该能力
- 当 `canIssueAdmissionCode=false` 时，后端会同步失效该用户已有的有效第一类邀请码

---

## 4. 用户接口

### 4.1 获取用户列表

- Method: `GET`
- Path: `/api/users`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.users`、`data.total`

说明：
- 当前阶段仅返回当前登录用户，不等同于家庭全量成员接口

### 4.2 获取当前用户信息

- Method: `GET`
- Path: `/api/users/current`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：当前登录用户对象

说明：
- 当前登录用户对象包含 `familyPermissionRole`；当前端做家庭治理和只读态判断时，应使用该字段而不是只看 `role`

### 4.3 验证会话用户

- Method: `GET`
- Path: `/api/users/session/validate`
- Auth: `Bearer Token`
- Query：
  - `sessionUserId`
- Body: 无

成功响应：
- Status: `200`
- Body：`data.valid`、`data.sessionUserId`

常见错误：
- `400` - `USER_INVALID_PARAMS`
- `500` - `USER_SESSION_VALIDATE_FAILED`

### 4.4 获取指定用户信息

- Method: `GET`
- Path: `/api/users/:userId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：目标用户对象

常见错误：
- `403` - `USER_ACCESS_DENIED`
- `404` - `USER_NOT_FOUND`
- `500` - `USER_GET_FAILED`

### 4.5 创建用户

- Method: `POST`
- Path: `/api/users`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `name`
  - `role` - `parent | child`

成功响应：
- Status: `200`
- Body：新创建用户对象

常见错误：
- `400` - `USER_INVALID_PARAMS` / `USER_INVALID_ROLE`
- `500` - `USER_CREATE_FAILED`

### 4.6 切换用户

- Method: `POST`
- Path: `/api/users/switch`
- Auth: `Bearer Token`
- Query：
  - `targetUserId`
- Body: 无

成功响应：
- Status: `200`
- Body：当前仅支持“目标用户就是自己”的无操作成功返回

常见错误：
- `400` - `USER_INVALID_PARAMS`
- `403` - `USER_SWITCH_FORBIDDEN`
- `404` - `USER_NOT_FOUND`
- `500` - `USER_SWITCH_FAILED`

说明：
- 当前实现仍处于受限状态，非自切换默认返回 `403`

### 4.7 修改用户昵称

- Method: `PATCH`
- Path: `/api/users/:userId/nickname`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `nickname`

成功响应：
- Status: `200`
- Body：`data.userId`、`data.nickname`

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `404` - `USER_NOT_FOUND`
- `500` - `USER_UPDATE_FAILED`

### 4.7A 修改当前登录用户资料

- Method: `PATCH`
- Path: `/api/users/current/profile`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `nickname` - 可选
  - `avatarUrl` - 可选

成功响应：
- Status: `200`
- Body：更新后的当前用户对象

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `USER_PROFILE_UPDATE_FAILED`

说明：
- 允许只更新昵称、只更新头像，或同时更新两者
- 若请求体未提供有效字段，后端会直接返回当前用户最新快照

### 4.8 删除用户

- Method: `DELETE`
- Path: `/api/users/:userId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- 当前实现未开放一般删除路径

常见错误：
- `400` - `USER_INVALID_PARAMS` / `USER_DELETE_SELF`
- `403` - `USER_DELETE_FORBIDDEN`
- `404` - `USER_NOT_FOUND`
- `500` - `USER_DELETE_FAILED`

---

## 5. 家庭接口

### 5.1 创建家庭

- Method: `POST`
- Path: `/api/families`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `name`

成功响应：
- Status: `200`
- Body：`data.familyId`、`data.name`、`data.inviteCode`、`data.inviteCodeExpiresAt`、`data.token`

常见错误：
- `400` - `INVALID_PARAMS` / `FAMILY_ALREADY_JOINED`
- `403` - `FAMILY_CREATE_DENIED`
- `500` - `FAMILY_CREATE_FAILED`

### 5.2 加入家庭

- Method: `POST`
- Path: `/api/families/join`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `inviteCode`

成功响应：
- Status: `200`
- Body：`data.token`

常见错误：
- `400` - `INVALID_PARAMS` / `FAMILY_ALREADY_JOINED` / `FAMILY_INVITE_CODE_INVALID` / `FAMILY_INVITE_CODE_EXPIRED`
- `500` - `FAMILY_JOIN_FAILED`

说明：
- 使用“家长邀请码”加入家庭的新用户，后端会 authoritative 写入 `role='parent'` 且 `familyPermissionRole='viewer'`

### 5.3 获取当前家庭信息

- Method: `GET`
- Path: `/api/families/current`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.data` 为当前家庭信息或 `null`

### 5.4 获取家庭成员

- Method: `GET`
- Path: `/api/families/current/members`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.members`

常见错误：
- `400` - `FAMILY_NOT_JOINED`
- `500` - `FAMILY_MEMBERS_GET_FAILED`

说明：
- 家庭成员对象中的家长成员会包含 `familyPermissionRole`

### 5.5 刷新邀请码

- Method: `POST`
- Path: `/api/families/current/invite-code`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `role` - `parent | child`

成功响应：
- Status: `200`
- Body：新的邀请码信息

常见错误：
- `400` - `FAMILY_NOT_JOINED` / `INVALID_PARAMS`
- `403` - `FAMILY_PARENT_REQUIRED` / `FAMILY_MANAGER_REQUIRED`
- `500` - `FAMILY_INVITE_CODE_REFRESH_FAILED`

说明：
- 当前接口由家庭内 `manager` 家长执行；`viewer` 家长会收到 `FAMILY_MANAGER_REQUIRED`
- `role=parent` 生成的是“加入家庭的家长邀请码”，加入后默认只拥有 `viewer` 权限，不等于直接授予管理权
- 当前接口保留兼容旧家庭邀请码链路；邀请码中心主链路已迁移到 `/api/invites/family-code`

### 5.6 创建虚拟成员

- Method: `POST`
- Path: `/api/families/members`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `name`

成功响应：
- Status: `200`
- Body：新成员对象

常见错误：
- `400` - `FAMILY_NOT_JOINED` / `INVALID_PARAMS` / `FAMILY_MEMBER_DUPLICATE`
- `403` - `FAMILY_PARENT_REQUIRED` / `FAMILY_MANAGER_REQUIRED`
- `500` - `FAMILY_MEMBER_CREATE_FAILED`

### 5.7 删除家庭成员

- Method: `DELETE`
- Path: `/api/families/members/:userId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：空数据成功响应

常见错误：
- `400` - `FAMILY_NOT_JOINED` / `FAMILY_CANNOT_DELETE_SELF` / `FAMILY_VIRTUAL_MEMBER_ONLY`
- `403` - `FAMILY_PARENT_REQUIRED` / `FAMILY_MANAGER_REQUIRED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `404` - `USER_NOT_FOUND`
- `500` - `FAMILY_MEMBER_DELETE_FAILED`

### 5.8 调整家庭内家长权限

- Method: `PATCH`
- Path: `/api/families/members/:userId/permission-role`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `familyPermissionRole` - `manager | viewer`

成功响应：
- Status: `200`
- Body：`data.userId`、`data.familyPermissionRole`，以及操作者在修改自己权限时返回的 `data.token`

常见错误：
- `400` - `INVALID_PARAMS` / `FAMILY_PARENT_MEMBER_REQUIRED` / `FAMILY_LAST_MANAGER_REQUIRED`
- `403` - `FAMILY_PARENT_REQUIRED` / `FAMILY_MANAGER_REQUIRED`
- `500` - `FAMILY_PERMISSION_ROLE_UPDATE_FAILED`

说明：
- 仅家庭内 `manager` 家长可调整其他家长权限
- 当操作者修改的是自己时，后端会回发新 token，前端应立即刷新当前用户上下文

### 5.9 预览邀请码摘要

- Method: `POST`
- Path: `/api/invites/preview`
- Auth: 可选
- Query: 无
- Body：
  - `inviteCode`

成功响应：
- Status: `200`
- Body：`data.inviteCode`、`data.purpose`、`data.status`、`data.targetRole`、`data.familyId`、`data.familyName`、`data.currentAction`、`data.currentActionMessage`、`data.requiresProfileAuthorization`

常见错误：
- `400` - `INVITE_CODE_REQUIRED`
- `500` - `INVITE_PREVIEW_FAILED`

说明：
- 该接口绝不消费邀请码，只返回摘要与当前用户下一步可执行动作
- 未登录时会根据邀请码用途返回 `enter_app / join_family`
- 已登录时可能返回 `already_has_access / already_in_family / has_other_family / system_readonly / system_blocked / invalid`

### 5.10 获取邀请码能力摘要

- Method: `GET`
- Path: `/api/invites/bootstrap`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.canIssueAdmissionCode`、`data.admissionCodeQuotaTotal`、`data.admissionCodeQuotaUsed`、`data.admissionCodeQuotaRemaining`、`data.admissionGlobalQuotaTotal`、`data.admissionGlobalQuotaUsed`、`data.admissionGlobalQuotaRemaining`、`data.canIssueFamilyInviteCode`、`data.familyId`、`data.availableFamilyInviteRoles`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `INVITE_BOOTSTRAP_FAILED`

说明：
- 第一类邀请码能力由系统管理员身份或“家长 + 正常状态 + 被授权 + 额度有效”共同决定

### 5.11 获取当前有效邀请码摘要

- Method: `GET`
- Path: `/api/invites/current`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.admissionCode`、`data.familyInviteCodes`

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `INVITE_CURRENT_FAILED`

说明：
- `admissionCode` 最多只有 1 个当前有效邀请码
- `familyInviteCodes` 可能同时包含邀请孩子、邀请家长两种当前有效家庭邀请码

### 5.12 生成或刷新新用户邀请码

- Method: `POST`
- Path: `/api/invites/admission-code`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：当前有效第一类邀请码对象

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `INVITE_CODE_ISSUER_FORBIDDEN` / `INVITE_CODE_QUOTA_EXCEEDED` / `INVITE_CODE_GLOBAL_QUOTA_EXCEEDED`
- `500` - `INVITE_ADMISSION_ISSUE_FAILED`

说明：
- 同一发码人当前只保留 1 个有效 `admission_only` 邀请码；刷新时旧码会先失效

### 5.13 生成或刷新家庭邀请码

- Method: `POST`
- Path: `/api/invites/family-code`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `targetRole` - `parent | child`

成功响应：
- Status: `200`
- Body：当前角色对应的有效家庭邀请码对象

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `403` - `INVITE_CODE_FAMILY_MANAGER_REQUIRED` / `INVITE_CODE_ISSUER_FORBIDDEN`
- `400` - `INVITE_CODE_TARGET_ROLE_INVALID`
- `500` - `INVITE_FAMILY_ISSUE_FAILED`

说明：
- 同一家庭同一角色槽位当前只保留 1 个有效邀请码
- `targetRole=parent` 生成的是默认 `viewer` 家长邀请码

---

## 6. 任务接口

### 6.0 任务写接口统一返回约定

自 `M19B` 起，任务写接口统一返回 `TaskMutationResponse`，并在过渡期保留兼容字段：

```json
{
  "primaryTask": {},
  "affectedTasks": [],
  "operation": "create",
  "task": {},
  "tasks": [],
  "taskId": "task_xxx"
}
```

说明：
- `primaryTask` 是当前操作的主任务；删除场景可为 `null`
- `affectedTasks` 是本次受影响任务集合；重复任务创建时包含主任务和后端展开的子任务
- `operation` 取值：`create | update | delete | complete | reset | required | unrequired`
- `task / tasks / taskId` 为过渡期兼容字段，调用方应优先读取 `primaryTask / affectedTasks`

### 6.1 获取任务列表

- Method: `GET`
- Path: `/api/tasks`
- Auth: `Bearer Token`
- Query（常用）：
  - `date`
  - `status`
  - `targetUserId`
  - `scope` - `family` 时仅家长可用
  - `startDate`
  - `endDate`
  - `includeOccurrence` - 可选，`true` 时允许返回表现项数据
  - `occurrenceMode` - 可选，`config | record | all`
  - `includeInactive` - 可选，仅 `occurrenceMode=config` 生效；`true` 时返回全部未删除表现项配置
- Body: 无

成功响应：
- Status: `200`
- Body：`data.tasks`、`data.total`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED` / `PERMISSION_DENIED`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_GET_FAILED`

说明：
- 默认仍以 planned 任务查询为主；只有显式传 `includeOccurrence=true` 才会返回表现项数据
- `occurrenceMode=config&startDate/endDate` 按有效时间段 overlap 查询，供分析看板按月拉取表现项骨架
- `occurrenceMode=record&startDate/endDate` 返回日期范围内的表现记录实例

### 6.2 统计任务

- Method: `GET`
- Path: `/api/tasks/count`
- Auth: `Bearer Token`
- Query：
  - `date`
  - `status`
  - `targetUserId`
- Body: 无

成功响应：
- Status: `200`
- Body：`data.count`、`data.userId`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `TASK_COUNT_FAILED`

### 6.3 获取任务详情

- Method: `GET`
- Path: `/api/tasks/:taskId`
- Auth: `Bearer Token`
- Query：
  - `targetUserId` - 可选
- Body: 无

成功响应：
- Status: `200`
- Body：任务对象

常见错误：
- `403` - `TASK_FORBIDDEN`
- `404` - `TASK_NOT_FOUND`
- `500` - `TASK_GET_FAILED`

### 6.4 创建任务

- Method: `POST`
- Path: `/api/tasks`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `taskId` - 可选，幂等/同步场景常用
  - `targetUserId` - 家长为孩子创建任务时传入
  - `title`
  - `type`
  - `date`
  - `points`
  - `executionMode` - 可选，`planned | occurrence`
  - `activeRange` - `executionMode=occurrence` 时必填
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `400` - `TASK_INVALID_PARAMS`
- `400` - `TASK_OCCURRENCE_INVALID_FIELDS`
- `400` - `TASK_REPEAT_RANGE_TOO_LARGE` / `TASK_ACTIVE_RANGE_TOO_LARGE`
- `403` - `FAMILY_TASK_CREATE_DENIED` / `FAMILY_NOT_JOINED`
- `409` - `TASK_ID_USER_MISMATCH`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_CREATE_FAILED`

说明：
- 云端模式下，重复任务实例由后端在事务内展开
- 创建重复任务时，`data.affectedTasks` 会一次性返回主任务与已展开的子任务集合
- 当 `executionMode=occurrence` 时创建的是“表现项配置任务”，不能通过通用创建接口直接写入 `isOccurrenceRecord / occurrenceOutcome / recordedAt`

### 6.5 更新任务

- Method: `PUT`
- Path: `/api/tasks/:taskId`
- Auth: `Bearer Token`
- Query: 无
- Body：仅允许白名单字段，例如：
  - `title`
  - `description`
  - `date`
  - `type`
  - `startTime`
  - `endTime`
  - `duration`
  - `isAllDay`
  - `isRequired`
  - `penaltyApplied`
  - `points`
  - `pointsExpiry`
  - `tags`
  - `hasNoEndDate`
  - `repeat`
  - `executionMode`
  - `activeRange`

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `400` - `NO_UPDATABLE_FIELDS` / `INVALID_TASK_DATA`
- `400` - `TASK_OCCURRENCE_INVALID_FIELDS` / `TASK_OCCURRENCE_USE_CONVERT_API`
- `400` - `TASK_REPEAT_RANGE_TOO_LARGE` / `TASK_ACTIVE_RANGE_TOO_LARGE`
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_UPDATE_FAILED`

说明：
- `occurrence` 配置任务允许通过该接口维护名称、类别、积分和有效时间
- `planned -> occurrence` 必须走专用转换接口，不能直接改 `executionMode`

### 6.6 删除任务

- Method: `DELETE`
- Path: `/api/tasks/:taskId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `500` - `TASK_DELETE_FAILED`

说明：
- 当前为软删除语义
- 删除场景下 `data.primaryTask` 为空，`data.taskId` 保留被删除任务 ID 兼容字段

### 6.7 更新任务状态

- Method: `PATCH`
- Path: `/api/tasks/:taskId/status`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `status` - 必填，仅允许 `0 | 1`
  - `starAwarded` - 可选布尔值
  - `modifyTime`
  - `operationKey`
  - `operatorContext`

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `400` - `INVALID_STATUS` / `INVALID_STAR_AWARDED`
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `409` - `INSUFFICIENT_STARS`
- `500` - `TASK_STATUS_UPDATE_FAILED`

说明：
- 同一接口统一承接普通完成、过去日期补做完成和任务重置三类状态变更
- 当任务满足“已逾期且此前已实际扣星”条件时，首次完成会在同一事务内退回 `penaltyDeductedPoints` 对应的星星；返回的任务对象会同步反映 `penaltyRefunded` 与 `penaltyRefundTime`
- 当任务已发生“逾期补做退星”后再次重置为未完成，如果当前永久星星不足以全额回滚这笔退星，接口返回 `409 INSUFFICIENT_STARS`
- `data.operation` 会按本次状态流转返回 `complete` 或 `reset`
- 查看者家长默认没有任务治理权限；但在孩子视角下发起执行型完成/重置请求并透传 `operatorContext.actorUserId=<childId>` 时，后端允许作为“孩子执行”处理

### 6.7A 记录表现项结果

- Method: `POST`
- Path: `/api/tasks/:taskId/occurrence-record`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `targetUserId` - 家长为孩子记录时必填；孩子视角默认自己
  - `date` - 记录日期，`YYYY-MM-DD`
  - `outcome` - `success | failure`
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data` 包含 `configTask`、`recordTask`、`starsAwarded`、`operation='occurrence_record'`

常见错误：
- `400` - `INVALID_PARAMS` / `TASK_OCCURRENCE_INVALID_TASK` / `TASK_OCCURRENCE_INVALID_FIELDS`
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `404` - `TASK_NOT_FOUND`
- `409` - `TASK_OCCURRENCE_FUTURE_DATE` / `TASK_OCCURRENCE_DATE_OUT_OF_RANGE`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_OCCURRENCE_RECORD_FAILED`

说明：
- 同一表现项、同一孩子、同一天最多保留一条记录
- 同日再次提交会复用同一记录；`success -> failure` 会在同一事务内撤回已发星星

### 6.7B 停用表现项

- Method: `POST`
- Path: `/api/tasks/:taskId/disable-occurrence`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `disableFromDate`
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data.disabledTask`、`data.operation='disable_occurrence'`

常见错误：
- `400` - `INVALID_PARAMS` / `TASK_OCCURRENCE_INVALID_TASK`
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_OCCURRENCE_DISABLE_FAILED`

说明：
- 仅家长可停用
- 停用只收口未来有效期，不删除历史表现记录

### 6.7C 转换为表现项

- Method: `POST`
- Path: `/api/tasks/:taskId/convert-occurrence`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `effectiveFromDate`
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data.convertedTask`、`data.archivedFutureTaskIds`、`data.operation='convert_occurrence'`

常见错误：
- `400` - `INVALID_PARAMS` / `TASK_OCCURRENCE_INVALID_TASK`
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `503` - `TASK_OCCURRENCE_SCHEMA_MISSING`
- `500` - `TASK_OCCURRENCE_CONVERT_FAILED`

说明：
- 仅支持 `planned -> occurrence`
- 仅归档未来未完成实例，历史已完成实例保留

### 6.8 同步必做任务惩罚

- Method: `POST`
- Path: `/api/tasks/penalties/sync`
- Auth: `Bearer Token`
- Query / Body（关键字段）：
  - `scope` - 可选，`family | user`；未传时家长默认 `family`，孩子默认 `user`
  - `targetUserId` - `scope=user` 时可选，家长可为同家庭孩子执行
  - `operationKey`
  - `modifyTime`

成功响应：
- Status: `200`
- Body：`data.penaltyCount`、`data.affectedTaskIds`、`data.results`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `TASK_PENALTY_SYNC_FAILED`

说明：
- 对已完成或已处理过惩罚的任务保持幂等，不重复扣星
- 扣星流水、任务状态更新与消息写入在同一事务内完成

### 6.9 同步 upcoming 任务提醒

- Method: `POST`
- Path: `/api/tasks/upcoming/sync`
- Auth: `Bearer Token`
- Query / Body（关键字段）：
  - `scope` - 可选，`family | user`；未传时家长默认 `family`，孩子默认 `user`
  - `targetUserId` - `scope=user` 时可选，家长可为同家庭孩子执行
  - `operationKey`
  - `modifyTime`

成功响应：
- Status: `200`
- Body：`data.createdCount`、`data.dedupedCount`、`data.activeCount`、`data.affectedTaskIds`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `503` - `TASK_REMINDER_SCHEMA_MISSING`
- `500` - `TASK_UPCOMING_SYNC_FAILED`

说明：
- upcoming 提醒采用活跃提醒模型，同一任务重复 sync 时会幂等去重并替换旧提醒

### 6.10 标记任务为必做

- Method: `PATCH`
- Path: `/api/tasks/:taskId/required`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `500` - `TASK_REQUIRED_UPDATE_FAILED`

说明：
- 仅任务本人或同家庭家长可操作
- 对已是必做状态的任务保持幂等

### 6.11 取消任务必做

- Method: `PATCH`
- Path: `/api/tasks/:taskId/unrequired`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data` 为 `TaskMutationResponse`

常见错误：
- `403` - `PERMISSION_DENIED`
- `404` - `TASK_NOT_FOUND`
- `500` - `TASK_REQUIRED_UPDATE_FAILED`

说明：
- 仅任务本人或同家庭家长可操作
- 对非必做任务保持幂等

### 6.12 转移家长名下任务

- Method: `POST`
- Path: `/api/tasks/transfer`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `toUserId`

成功响应：
- Status: `200`
- Body：`data.count`

常见错误：
- `400` - `INVALID_PARAMS` / `FAMILY_NOT_JOINED` / `TRANSFER_TARGET_INVALID`
- `403` - `TRANSFER_PARENT_REQUIRED`
- `500` - `TASK_TRANSFER_FAILED`

### 6.13 获取任务模板列表

- Method: `GET`
- Path: `/api/task-templates`
- Auth: `Bearer Token`
- Query：
  - `keyword` - 可选，按模板名称 / 模板说明 / 任务标题搜索
  - `type` - 可选，`all | study | habit | interest`
  - `status` - 可选，`all | enabled | disabled`
  - `sortBy` - 可选，`recent | usage`
- Body: 无

成功响应：
- Status: `200`
- Body：`data.templates`、`data.total`

说明：
- 服务端按当前登录用户所属 `familyId` 返回同家庭模板
- `taskPayload` 与 `dateStrategy` 按模板契约返回为 JSON 对象

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `TASK_TEMPLATE_LIST_FAILED`

### 6.14 创建任务模板

- Method: `POST`
- Path: `/api/task-templates`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `name` - 模板显示名称
  - `description` - 模板说明，可选
  - `enabled` - 是否启用，可选
  - `taskPayload` - 模板内任务表单快照
  - `dateStrategy` - 模板日期策略

成功响应：
- Status: `200`
- Body：`data.template`

说明：
- 服务端会自动补齐 `familyId`、`createdByUserId`、`usageCount`、`lastUsedAt`
- `taskPayload.repeat`、`taskPayload.reminder`、`dateStrategy` 会按模板契约做归一化

常见错误：
- `400` - `TASK_TEMPLATE_INVALID_PARAMS`
- `401` - `AUTH_INVALID_TOKEN`
- `500` - `TASK_TEMPLATE_CREATE_FAILED`

### 6.15 更新任务模板

- Method: `PUT`
- Path: `/api/task-templates/:templateId`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `name` - 可选，模板显示名称
  - `description` - 可选，模板说明
  - `enabled` - 可选，是否启用
  - `taskPayload` - 可选，局部或完整任务表单快照
  - `dateStrategy` - 可选，局部或完整日期策略

成功响应：
- Status: `200`
- Body：`data.template`

常见错误：
- `400` - `TASK_TEMPLATE_INVALID_PARAMS`
- `401` - `AUTH_INVALID_TOKEN`
- `404` - `TASK_TEMPLATE_NOT_FOUND`
- `500` - `TASK_TEMPLATE_UPDATE_FAILED`

### 6.16 启用或停用任务模板

- Method: `PATCH`
- Path: `/api/task-templates/:templateId/enabled`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `enabled` - `true | false`

成功响应：
- Status: `200`
- Body：`data.template`

常见错误：
- `400` - `TASK_TEMPLATE_INVALID_PARAMS`
- `401` - `AUTH_INVALID_TOKEN`
- `404` - `TASK_TEMPLATE_NOT_FOUND`
- `500` - `TASK_TEMPLATE_SET_ENABLED_FAILED`

### 6.17 删除任务模板

- Method: `DELETE`
- Path: `/api/task-templates/:templateId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.deleted = true`

说明：
- 删除模板不会影响已经创建出的真实任务实例

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `404` - `TASK_TEMPLATE_NOT_FOUND`
- `500` - `TASK_TEMPLATE_DELETE_FAILED`

### 6.18 回写任务模板使用统计

- Method: `POST`
- Path: `/api/task-templates/:templateId/usage`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.template`

说明：
- 成功后模板的 `usageCount` 会自增，`lastUsedAt` 会更新为最新时间

常见错误：
- `401` - `AUTH_INVALID_TOKEN`
- `404` - `TASK_TEMPLATE_NOT_FOUND`
- `500` - `TASK_TEMPLATE_RECORD_USAGE_FAILED`

---

## 7. 星星接口

### 7.1 获取星星余额与分组

- Method: `GET`
- Path: `/api/stars`
- Auth: `Bearer Token`
- Query：
  - `userId` - 可选，家长代理孩子视角时使用
- Body: 无

成功响应：
- Status: `200`
- Body：余额摘要与 `groups`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_GET_FAILED`

### 7.2 获取星星流水

- Method: `GET`
- Path: `/api/stars/records`
- Auth: `Bearer Token`
- Query：
  - `scope` - `family | user`
  - `userId` - `scope=user` 时可选
- Body: 无

成功响应：
- Status: `200`
- Body：`data.records`、`data.total`

常见错误：
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_RECORDS_GET_FAILED`

### 7.3 写入星星流水

- Method: `POST`
- Path: `/api/stars/records`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `recordId`
  - `userId`
  - `type`
  - `source`
  - `sourceId`
  - `points`
  - `description`
  - `expiryType`
  - `expiryDate`
  - `modifyTime`

成功响应：
- Status: `200`
- Body：`data.record`、`data.updatedGroupsSnapshot`、`data.idempotent`

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `409` - 冲突型幂等/归属错误
- `500` - `STAR_RECORD_CREATE_FAILED`

### 7.4 扣减星星

- Method: `POST`
- Path: `/api/stars/consume`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `userId`
  - `requestedPoints`
  - `reason`
  - `sourceType`
  - `sourceId`
  - `originalTaskDate`
  - `idempotencyKey`
  - `modifyTime`

成功响应：
- Status: `200`
- Body：`data.consumedPoints`、`data.isPartial`、`data.deductionBreakdown`、`data.record`

常见错误：
- `400` - `INVALID_PARAMS` / `INSUFFICIENT_STARS`
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_CONSUME_FAILED`

### 7.5 获取星星分组

- Method: `GET`
- Path: `/api/stars/groups`
- Auth: `Bearer Token`
- Query：
  - `userId`
- Body: 无

成功响应：
- Status: `200`
- Body：`data.groups`、`data.total`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_GROUPS_GET_FAILED`

### 7.6 获取家庭星星汇总

- Method: `GET`
- Path: `/api/stars/family-summary`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.scope`、`data.subjectUserIds`、`data.totalPoints`、`data.groups`

常见错误：
- `403` - `PERMISSION_DENIED`
- `500` - `STAR_FAMILY_SUMMARY_GET_FAILED`

说明：
- 仅家长且已加入家庭时可访问
- `subjectUserIds` 只包含当前家庭下 `status=active` 的孩子
- `groups` 只包含活跃孩子名下“未过期且星星数大于 0”的分组快照，并保留 `userId`
- 该接口为分析页 family 余额锚定提供正式当前余额输入，不替代 `/api/stars/records?scope=family`

### 7.7 执行星星到期权威结算

- Method: `POST`
- Path: `/api/stars/expiry-authority/sync`
- Auth: `Bearer Token`
- Query / Body（关键字段）：
  - `scope` - 可选，`family | user`；未传时默认 `user`
  - `targetUserId` - `scope=user` 时可选；家长可指定同家庭孩子，孩子本人固定为自己
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data.affectedUserIds`、`data.settledGroupCount`、`data.settledPoints`、`data.createdRecordCount`、`data.invalidGroupCount`

常见错误：
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_EXPIRY_AUTHORITY_FAILED`

说明：
- 该接口用于把“已到期星星”正式结算为后端权威流水，并删除对应已到期分组
- 孩子 + `scope=user`：仅允许为自己触发结算
- 家长 + `scope=user`：可为当前家庭下目标孩子触发结算；未传 `targetUserId` 时回落到当前请求用户
- 家长 + `scope=family`：扫描家庭下全部活跃孩子，并逐个在独立事务中执行结算
- 结算幂等键采用“用户 + 分组 + 规范化到期日”构造，重复触发不会重复落账
- 该接口只处理到期结算，不负责 materialize 提醒消息；提醒仍使用 `/api/stars/expiring-reminders/sync`

### 7.8 同步星星即将过期提醒

- Method: `POST`
- Path: `/api/stars/expiring-reminders/sync`
- Auth: `Bearer Token`
- Query / Body（关键字段）：
  - `scope` - 可选，`family | user`；未传时家长默认 `family`，孩子默认 `user`
  - `targetUserId` - `scope=user` 时可选；家长可指定同家庭孩子，孩子本人固定为自己
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data.createdCount`、`data.updatedCount`、`data.dedupedCount`、`data.archivedCount`、`data.activeCount`、`data.affectedUserIds`

常见错误：
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `STAR_EXPIRING_SYNC_FAILED`

说明：
- 该接口用于将“星星即将过期”提醒 materialize 为正式云端消息，消息类型为 `type=system`、`notification_type=star_expiring`
- 孩子 + `scope=user`：仅同步自己的提醒
- 家长 + `scope=user`：仅同步 `targetUserId` 对应成员的提醒；未传时回落到当前请求用户
- 家长 + `scope=family`：同步家庭下全部活跃孩子，并按孩子分别生成个人流与家庭流提醒
- 非家长无权请求 `scope=family`
- 同一孩子仅保留 1 条“最近到期批次”活跃提醒；到期批次变化或不再满足提醒窗口时，旧提醒会被归档

---

## 8. 奖励接口

### 8.1 获取奖励列表

- Method: `GET`
- Path: `/api/rewards`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.rewards`、`data.total`

说明：
- 家庭模式下按 `familyId` 返回全家可见奖励
- 兼容历史个人奖励补齐 `family_id`

### 8.2 创建奖励

- Method: `POST`
- Path: `/api/rewards`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `rewardId`
  - `name`
  - `description`
  - `type`
  - `points`
  - `icon`
  - `modifyTime`

成功响应：
- Status: `200`
- Body：奖励对象

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED`
- `500` - `REWARD_CREATE_FAILED`

### 8.3 更新奖励

- Method: `PUT`
- Path: `/api/rewards/:rewardId`
- Auth: `Bearer Token`
- Query: 无
- Body：奖励可更新字段与 `modifyTime`

成功响应：
- Status: `200`
- Body：奖励对象

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED`
- `404` - `REWARD_NOT_FOUND`
- `500` - `REWARD_UPDATE_FAILED`

### 8.4 删除奖励

- Method: `DELETE`
- Path: `/api/rewards/:rewardId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.rewardId`

常见错误：
- `403` - `PERMISSION_DENIED`
- `404` - `REWARD_NOT_FOUND`
- `500` - `REWARD_DELETE_FAILED`

### 8.5 兑换奖励

- Method: `PATCH`
- Path: `/api/rewards/:rewardId/exchange`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `exchangeUserId` - 家长代孩子兑换时传入
  - `modifyTime`

成功响应：
- Status: `200`
- Body：`data.reward`、`data.record`、`data.consumedPoints`、`data.deductionBreakdown`、`data.updatedGroupsSnapshot`、`data.idempotent`

常见错误：
- `400` - `INVALID_PARAMS` / `INSUFFICIENT_STARS` / `REWARD_DISABLED`
- `403` - `FAMILY_MEMBER_ACCESS_DENIED` / `PERMISSION_DENIED`
- `404` - `REWARD_NOT_FOUND`
- `409` - `REWARD_ALREADY_EXCHANGED`
- `500` - `REWARD_EXCHANGE_FAILED`

### 8.6 取消奖励兑换

- Method: `PATCH`
- Path: `/api/rewards/:rewardId/cancel-exchange`
- Auth: `Bearer Token`
- Query: 无
- Body（关键字段）：
  - `exchangeUserId` - 可选；家长可为同家庭孩子取消兑换
  - `modifyTime`
  - `operationKey`

成功响应：
- Status: `200`
- Body：`data.reward`、`data.refundRecord`、`data.refundedPoints`、`data.updatedGroupsSnapshot`、`data.idempotent`

常见错误：
- `400` - `REWARD_DELIVERED`
- `403` - `FAMILY_MEMBER_ACCESS_DENIED` / `PERMISSION_DENIED`
- `404` - `REWARD_NOT_FOUND`
- `500` - `REWARD_CANCEL_EXCHANGE_FAILED`

说明：
- 已撤销或未兑换状态按幂等成功返回，不重复退款
- 退款流水、奖励状态回退与消息写入在同一事务内完成

---

## 9. 消息接口

### 9.1 获取消息列表

- Method: `GET`
- Path: `/api/messages`
- Auth: `Bearer Token`
- Query：
  - `scope` - 默认家长为 `family`，孩子为 `user`
  - `userId` - `scope=user` 时可选
- Body: 无

成功响应：
- Status: `200`
- Body：`data.messages`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `MESSAGE_GET_FAILED`

### 9.2 批量标记已读

- Method: `PATCH`
- Path: `/api/messages/read-all`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `scope`
  - `userId`
  - `readTime`

成功响应：
- Status: `200`
- Body：`data.count`

常见错误：
- `403` - `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `MESSAGE_ALL_READ_FAILED`

### 9.3 标记单条已读

- Method: `PATCH`
- Path: `/api/messages/:messageId/read`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `readTime`

成功响应：
- Status: `200`
- Body：消息对象

常见错误：
- `404` - `MESSAGE_NOT_FOUND`
- `500` - `MESSAGE_READ_FAILED`

### 9.4 删除消息

- Method: `DELETE`
- Path: `/api/messages/:messageId`
- Auth: `Bearer Token`
- Query: 无
- Body: 无

成功响应：
- Status: `200`
- Body：`data.messageId`

常见错误：
- `404` - `MESSAGE_NOT_FOUND`
- `500` - `MESSAGE_DELETE_FAILED`

---

## 10. Analytics 接口

### 10.1 查询统一分析读模型

- Method: `POST`
- Path: `/api/analytics/read-model/query`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `scope` - `user | family`
  - `monthKey` - 月份键，格式 `YYYY-MM`
  - `userId` - `scope=user` 时必填
  - `childUserIds` - `scope=family` 时可选；不传表示当前家庭全部 active child，传空数组表示显式空结果

成功响应：
- Status: `200`
- Body：
  - `data.snapshot.scope`
  - `data.snapshot.scopeKey`
  - `data.snapshot.subjectUserIds`
  - `data.snapshot.monthKey`
  - `data.snapshot.signature`
  - `data.snapshot.expiresAt`
  - `data.snapshot.mode`
  - `data.snapshot.tasks`
  - `data.snapshot.records`
  - `data.snapshot.summary`
  - `data.snapshot.chartModel`
  - `data.snapshot.refreshedAt`

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `ANALYTICS_READ_MODEL_QUERY_FAILED`

### 10.2 查询任务完成统计

- Method: `POST`
- Path: `/api/analytics/task-completion-stats/query`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `scope` - `user | family`
  - `dateRange` - `today | week | month`
  - `userId` - `scope=user` 时必填
  - `childUserIds` - `scope=family` 时可选

成功响应：
- Status: `200`
- Body：
  - `data.stats.totalTasks`
  - `data.stats.completedTasks`
  - `data.stats.completionRate`
  - `data.stats.typeCounts`
  - `data.stats.statusCounts`

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `ANALYTICS_TASK_COMPLETION_STATS_QUERY_FAILED`

### 10.3 查询即将过期星星

- Method: `POST`
- Path: `/api/analytics/upcoming-expiry/query`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `scope` - `user | family`
  - `days` - 正整数，默认 `7`
  - `userId` - `scope=user` 时必填
  - `childUserIds` - `scope=family` 时可选

成功响应：
- Status: `200`
- Body：
  - `data.items[]`
  - `data.items[].id`
  - `data.items[].points`
  - `data.items[].expiryDate`
  - `data.items[].expiryDateStr`
  - `data.items[].type`

说明：
- 当前产品口径下，`scope=family` 返回空数组，用于保持与前端既有行为一致

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `ANALYTICS_UPCOMING_EXPIRY_QUERY_FAILED`

### 10.4 查询任务星星日历事实

- Method: `POST`
- Path: `/api/analytics/task-star-calendar/query`
- Auth: `Bearer Token`
- Query: 无
- Body：
  - `scope` - `user | family`
  - `userId` - `scope=user` 时必填
  - `childUserIds` - `scope=family` 时可选

成功响应：
- Status: `200`
- Body：
  - `data.records[]`
  - `data.records[].id`
  - `data.records[].title`
  - `data.records[].time`
  - `data.records[].timestamp`
  - `data.records[].points`
  - `data.records[].type`
  - `data.records[].source`

说明：
- 任务完成加星、未完成必做扣星、补做退星都由后端按事实字段统一生成

常见错误：
- `400` - `INVALID_PARAMS`
- `403` - `PERMISSION_DENIED` / `FAMILY_MEMBER_ACCESS_DENIED`
- `500` - `ANALYTICS_TASK_STAR_CALENDAR_QUERY_FAILED`

---

## 11. 相关文档

- 前端服务层接口：[services-guide.md](./services-guide.md)
- 仓储接口：[repositories.md](./repositories.md)
- 项目测试策略总览：[testing-strategy.md](../development/testing-strategy.md)
- 后端真实数据库集成测试说明：[backend/test/README.md](../../backend/test/README.md)
