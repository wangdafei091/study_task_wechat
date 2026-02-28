# 组件开发指南

本文档介绍学习任务微信小程序的组件开发规范、常用组件列表和API说明。

---

## 组件开发规范

### 组件目录结构

```
components/
├── [component-name]/
│   ├── index.js          # 组件逻辑
│   ├── index.json        # 组件配置
│   ├── index.wxml        # 组件模板
│   └── index.wxss        # 组件样式
```

### 命名规范

- **组件目录**：kebab-case（小写字母 + 连字符）
  - ✅ `progress-ring/`, `float-menu/`, `task-card/`
  - ❌ `progressRing/`, `FloatMenu/`

- **组件文件**：`index.js`, `index.json`, `index.wxml`, `index.wxss`
- **组件名称**：PascalCase（大驼峰命名）
  - ✅ `ProgressRing`, `FloatMenu`, `TaskCard`
  - ❌ `progress-ring`, `float-menu`

### 组件注册

在页面的 `json` 配置文件中注册组件：

```json
{
  "usingComponents": {
    "progress-ring": "/components/progressRing/index",
    "float-menu": "/components/float-menu/index",
    "task-card": "/components/card/index"
  }
}
```

### 组件开发原则

1. **单一职责**：每个组件只负责一个明确的功能
2. **可复用性**：通过 properties 接收参数，通过 events 通知父组件
3. **样式隔离**：组件样式只影响组件内部，避免污染页面样式
4. **性能优化**：避免频繁调用 setData，合并数据更新

---

## 常用组件列表

### 1. ProgressRing - 进度环组件

显示圆形进度环，支持不同大小和颜色。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `percent` | Number | 0 | 百分比进度 (0-100) |
| `size` | String | `'medium'` | 环大小：`'large'`, `'medium'`, `'small'` 或具体数值 |
| `type` | String | `'default'` | 环类型：`'default'`, `'habit'`, `'study'`, `'interest'` |
| `color` | String | `'#4285F4'` | 自定义颜色（type 为 default 时使用） |
| `showText` | Boolean | `true` | 是否显示进度文本 |
| `centerContent` | String | `''` | 自定义中心内容（插槽） |
| `enableHover` | Boolean | `true` | 是否启用悬停效果 |
| `borderWidth` | Number | `8` | 边框宽度（rpx） |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `tap` | `{ type, percent }` | 用户点击进度环时触发 |

#### 使用示例

```xml
<!-- 页面中使用组件 -->
<progress-ring
  percent="{{completionRate}}"
  size="large"
  type="study"
  bind:tap="onProgressRingTap"
/>
```

```javascript
// 页面 JS 中处理事件
Page({
  onProgressRingTap(event) {
    console.log('点击进度环', event.detail);
  }
});
```

---

### 2. FloatMenu - 浮动菜单组件

可配置的浮动菜单，支持多种位置和样式。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `menuItems` | Array | `[]` | 菜单项配置数组 |
| `position` | String | `'bottom-right'` | 菜单位置：`'bottom-right'`, `'bottom-left'`, `'top-right'`, `'top-left'` |
| `zIndex` | Number | `100` | 菜单层级 |
| `mainButtonClass` | String | `''` | 主按钮样式类 |
| `defaultIcon` | String | `'＋'` | 默认展开图标 |
| `closeIcon` | String | `'×'` | 关闭图标 |
| `themeColor` | String | `''` | 主题颜色（空值使用默认） |
| `buttonSize` | Number | `110` | 主按钮尺寸（rpx） |
| `itemSize` | Number | `100` | 菜单项尺寸（rpx） |
| `disableVibrate` | Boolean | `false` | 是否禁用震动反馈 |
| `animationDuration` | Number | `300` | 显示动画持续时间（毫秒） |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `itemtap` | `{ index, item }` | 用户点击菜单项时触发 |
| `close` | - | 用户点击关闭按钮或外部区域时触发 |

#### 菜单项配置

```javascript
const menuItems = [
  {
    icon: 'edit',        // 图标名称
    text: '编辑',       // 显示文本
    action: 'edit'      // 动作标识
    style: ''          // 自定义样式类
  },
  {
    icon: 'delete',
    text: '删除',
    action: 'delete',
    style: 'danger'
  }
];
```

---

### 3. TaskCard - 任务卡片组件

显示任务信息的卡片组件。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `task` | Object | `{}` | 任务对象（包含 id, title, type, status, points 等） |
| `showCheckbox` | Boolean | `true` | 是否显示复选框 |
| `showStars` | Boolean | `true` | 是否显示星星数 |
| `showRequiredBadge` | Boolean | `true` | 是否显示必做任务标记 |
| `isReadOnly` | Boolean | `false` | 是否只读模式 |
| `isExpanded` | Boolean | `false` | 是否展开详情 |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `tap` | `{ taskId }` | 用户点击卡片时触发 |
| `checkboxchange` | `{ taskId, checked }` | 复选框状态变化时触发 |
| `expandchange` | `{ taskId, expanded }` | 展开/折叠状态变化时触发 |

---

### 4. UpcomingTask - 即将开始任务组件

显示即将开始的任务信息组件。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `task` | Object | `{}` | 任务对象 |
| `timeLeft` | Number | `0` | 剩余时间（分钟） |
| `showCountdown` | Boolean | `true` | 是否显示倒计时 |

---

### 5. Card - 通用卡片组件

通用卡片容器组件，提供统一的卡片样式。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `padding` | String | `'30rpx'` | 卡片内边距 |
| `borderRadius` | Number | `16` | 卡片圆角（rpx） |
| `backgroundColor` | String | `'#FFFFFF'` | 背景颜色 |
| `shadow` | Boolean | `true` | 是否显示阴影 |

#### Slot

| 插槽名 | 说明 |
|--------|------|
| `default` | 卡片内容 |

---

### 6. ProgressBar - 进度条组件

水平或垂直进度条组件。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `percent` | Number | `0` | 百分比进度 (0-100) |
| `height` | Number | `8` | 进度条高度（rpx） |
| `borderRadius` | Number | `4` | 圆角（rpx） |
| `color` | String | `'#4285F4'` | 进度条颜色 |
| `backgroundColor` | String | `'#E0E0E0'` | 背景颜色 |

---

### 7. DatePicker - 日期选择器组件

日期选择组件，支持选择日期和范围。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `selectedDate` | String | `''` | 选中的日期 (YYYY-MM-DD) |
| `minDate` | String | `''` | 最小可选日期 |
| `maxDate` | String | `''` | 最大可选日期 |
| `disabledDates` | Array | `[]` | 禁用的日期列表 |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `datechange` | `{ date }` | 日期变化时触发 |

---

### 8. UserSwitcher - 用户切换组件

用户角色切换组件（家长/孩子）。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `currentUser` | Object | `{}` | 当前用户对象 |
| `users` | Array | `[]` | 所有用户列表 |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `userchange` | `{ user }` | 用户切换时触发 |

---

### 9. IndexTaskItem - 首页任务项组件

首页专用的任务项组件。

#### Properties

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `task` | Object | `{}` | 任务对象 |
| `isExpanded` | Boolean | `false` | 是否展开详情 |
| `isReadOnly` | Boolean | `false` | 是否只读 |

---

## 组件开发最佳实践

### 1. 性能优化

```javascript
// ❌ 避免：频繁调用 setData
this.setData({ prop1: value1 });
this.setData({ prop2: value2 });
this.setData({ prop3: value3 });

// ✅ 推荐：合并数据更新
this.setData({
  prop1: value1,
  prop2: value2,
  prop3: value3
});
```

### 2. 事件通信

```javascript
// 子组件中触发事件
this.triggerEvent('customevent', {
  detail: {
    value: someValue
  }
});

// 父组件中监听事件
<my-component bind:customevent="onCustomEvent" />

Page({
  onCustomEvent(event) {
    console.log('收到自定义事件', event.detail);
  }
});
```

### 3. 样式隔离

```css
/* ✅ 推荐：使用组件特有的 class 前缀 */
.my-component-wrapper {
  /* 组件样式 */
}

/* ❌ 避免：过于通用的 class 名称 */
.card {
  /* 可能影响其他卡片组件 */
}
```

### 4. 属性默认值处理

```javascript
Component({
  properties: {
    title: {
      type: String,
      value: '默认标题',  // 提供默认值
      observer(newVal) {
        // 监听属性变化
      }
    }
  }
});
```

---

## 组件样式规范

### 卡片样式

```css
.card {
  padding: 30rpx;
  border-radius: 16rpx;
  background: #FFFFFF;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}
```

### 按钮样式

```css
.button {
  height: 90rpx;
  border-radius: 8rpx;
  padding: 0 30rpx;
  font-size: 28rpx;
  font-weight: 400;
}
```

### 文本样式

```css
.text-title {
  font-size: 32rpx;
  font-weight: 500;
  color: #333333;
}

.text-body {
  font-size: 28rpx;
  font-weight: 400;
  color: #666666;
}

.text-caption {
  font-size: 24rpx;
  font-weight: 400;
  color: #999999;
}
```

---

## 组件复用指南

### 查找可用组件

使用以下命令查找现有组件：

```bash
find components/ -name "*.json" | xargs grep -l "usingComponents"
```

### 创建新组件

1. 在 `components/` 下创建组件目录
2. 创建四个文件：`index.js`, `index.json`, `index.wxml`, `index.wxss`
3. 参考本文档的命名规范和开发原则
4. 在需要使用组件的页面 `json` 中注册组件

### 组件测试

1. 创建测试页面
2. 在测试页面中测试组件的各个属性
3. 测试组件的事件触发和响应
4. 测试组件在不同设备和屏幕尺寸下的表现

---

**最后更新**：2026-02-28
**维护者**：项目维护团队
