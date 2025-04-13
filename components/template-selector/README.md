# 任务模板选择器组件 (template-selector)

## 概述
任务模板选择器组件是一个通用的UI组件，用于展示和选择常用任务模板。组件支持不同任务类型的样式定制，提供选择和自定义两种交互模式。该组件被设计为高度可复用、易于集成的通用组件。

## 功能特性
- 展示任务模板列表
- 支持多种任务类型样式(学习/习惯/整理)
- 提供模板选择和自定义两种交互模式
- 支持最大显示数量限制
- 提供选中状态视觉反馈
- 触觉反馈增强交互体验
- 自定义标题和按钮文本
- 全局组件注册便于复用

## 组件接口

### 属性
| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| templates | Array | [] | 模板数据列表 |
| selectedId | String | '' | 已选中模板的ID |
| type | String | 'study' | 任务类型(study/habit/clock/bag) |
| showCustom | Boolean | true | 是否显示自定义按钮 |
| maxDisplay | Number | 7 | 最大显示模板数量 |
| customText | String | '自定义' | 自定义按钮文本 |
| title | String | '常用任务' | 组件标题 |

### 事件
| 事件名 | 参数 | 说明 |
|-------|------|------|
| select | {templateId, template} | 选择模板时触发 |
| custom | {type} | 点击自定义按钮时触发 |

## 使用示例

### WXML
```html
<!-- 学习任务模板选择器 -->
<template-selector 
  templates="{{studyTemplates}}" 
  selectedId="{{selectedTemplate}}"
  type="study"
  bind:select="handleTemplateSelect"
  bind:custom="handleCustomSelect">
</template-selector>

<!-- 习惯任务模板选择器 -->
<template-selector 
  templates="{{habitTemplates}}" 
  selectedId="{{selectedTemplate}}"
  type="habit"
  title="生活习惯"
  bind:select="handleTemplateSelect"
  bind:custom="handleCustomSelect">
</template-selector>
```

### JS
```javascript
/**
 * 处理模板选择事件
 */
handleTemplateSelect: function(e) {
  const templateId = e.detail.templateId;
  const template = e.detail.template;
  
  // 使用选中的模板数据
  this.setData({
    selectedTemplate: templateId,
    'task.title': template.name,
    'task.description': template.description || '',
    // 其他属性设置...
  });
},

/**
 * 处理自定义选择事件
 */
handleCustomSelect: function(e) {
  const taskType = e.detail.type;
  
  // 进入自定义模式
  this.setData({
    selectedTemplate: '',
    customMode: true,
    // 其他属性重置...
  });
}
```

### JSON (全局注册)
```json
{
  "usingComponents": {
    "template-selector": "/components/template-selector/template-selector"
  }
}
```

## 样式定制
组件根据不同任务类型自动应用不同的样式：
- `study`: 蓝色主题 (#4285F4)
- `clock`: 绿色主题 (#34A853)
- `bag`: 黄色主题 (#FBBC04)

## 最佳实践
- 提供合适的模板数据，包含id、name和shortName字段
- 根据用户的选择及时处理select和custom事件
- 适当限制maxDisplay以避免UI过于拥挤
- 保持模板数据结构的一致性 