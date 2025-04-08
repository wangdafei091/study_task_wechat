# 浮动菜单组件 (Float Menu)

一个可高度自定义的浮动菜单组件，适用于微信小程序。

## 功能特点

- 支持多种位置定位（右下角、左下角、右上角、左上角）
- 可配置的菜单项（图标、标签、样式）
- 支持自定义主题颜色
- 支持自定义按钮和菜单项大小
- 动画效果可配置
- 支持无障碍访问（ARIA属性）
- 适配不同屏幕尺寸和方向

## 使用方法

### 1. 引入组件

在需要使用组件的页面的 `.json` 文件中添加组件引用：

```json
{
  "usingComponents": {
    "float-menu": "/components/float-menu/float-menu"
  }
}
```

### 2. 添加组件到页面

在页面的 `.wxml` 文件中使用组件：

```xml
<float-menu 
  menuItems="{{menuItems}}"
  position="bottom-right"
  bind:itemtap="handleMenuItemTap"
  bind:statechange="handleMenuStateChange"
/>
```

### 3. 在页面JS中配置菜单项和处理事件

在页面的 `.js` 文件中配置菜单项和处理事件：

```javascript
Page({
  data: {
    // 浮动菜单项配置
    menuItems: [
      {
        id: 'study',
        type: 'study-task',
        icon: '📚',
        label: '学习',
        ariaLabel: '创建学习任务'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯',
        ariaLabel: '创建习惯任务'
      }
    ]
  },
  
  // 处理菜单项点击
  handleMenuItemTap: function(e) {
    const item = e.detail.item;
    
    // 根据菜单项ID执行不同的操作
    switch(item.id) {
      case 'study':
        // 处理学习任务
        break;
      case 'habit':
        // 处理习惯任务
        break;
    }
  },
  
  // 处理菜单状态变化
  handleMenuStateChange: function(e) {
    const isOpen = e.detail.isOpen;
    // 可以根据菜单状态做一些额外操作
  }
})
```

## 组件属性说明

| 属性名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| menuItems | Array | [] | 菜单项配置数组 |
| position | String | 'bottom-right' | 菜单位置，可选值：'bottom-right', 'bottom-left', 'top-right', 'top-left' |
| zIndex | Number | 100 | 菜单层级 |
| mainButtonClass | String | '' | 主按钮样式类 |
| defaultIcon | String | '＋' | 默认图标 |
| closeIcon | String | '×' | 关闭图标 |
| themeColor | String | '' | 主题颜色，可设置为任何有效的CSS颜色值 |
| buttonSize | Number | 110 | 主按钮尺寸，单位rpx |
| itemSize | Number | 100 | 菜单项尺寸，单位rpx |
| disableVibrate | Boolean | false | 是否禁用震动反馈 |
| animationDuration | Number | 300 | 动画持续时间，单位毫秒 |

## 菜单项配置说明

每个菜单项（menuItems数组中的元素）可以包含以下属性：

| 属性名 | 类型 | 说明 |
|---|---|---|
| id | String | 菜单项唯一标识 |
| type | String | 菜单项类型，用于应用对应的预设样式 |
| icon | String | 菜单项图标 |
| label | String | 菜单项标签文本 |
| ariaLabel | String | 无障碍标签 |
| style | String | 菜单项自定义样式 |

## 事件说明

| 事件名 | 说明 | 参数 |
|---|---|---|
| itemtap | 点击菜单项时触发 | {index: 点击的菜单项索引, item: 被点击的菜单项对象} |
| statechange | 菜单状态变化时触发 | {isOpen: 菜单是否展开} |

## 示例

### 基础使用

```xml
<float-menu 
  menuItems="{{menuItems}}"
/>
```

### 自定义位置

```xml
<float-menu 
  menuItems="{{menuItems}}"
  position="top-left"
/>
```

### 自定义主题颜色

```xml
<float-menu 
  menuItems="{{menuItems}}"
  themeColor="#FF5722"
/>
```

### 自定义大小

```xml
<float-menu 
  menuItems="{{menuItems}}"
  buttonSize="130"
  itemSize="110"
/>
```

### 禁用震动反馈

```xml
<float-menu 
  menuItems="{{menuItems}}"
  disableVibrate="{{true}}"
/>
``` 