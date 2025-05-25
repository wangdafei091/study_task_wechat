# 任务位置稳定性优化

## 问题描述

在首页今日任务列表中，当用户点击任务完成后，任务会发生位置跳跃现象：
- 已完成的任务会自动排到未完成任务的后面
- 导致用户操作流程被打断，影响连续完成任务的体验
- 造成界面"不稳定"的感觉，降低用户信任感

## 根本原因

任务仓库的排序方法 `_sortTasksByHabitAndTime` 中包含了完成状态排序逻辑：
```javascript
// 原有的排序逻辑
if (a.status !== b.status) {
  return a.status - b.status; // 未完成(0) < 已完成(1)
}
```

这导致每次任务状态变更后，系统会重新排序任务列表，将已完成任务移到后面。

## 解决方案

### 1. 修改排序逻辑
**文件**: `repositories/task-repository.js`

移除完成状态排序，改为：
- 必做任务优先
- 习惯任务优先  
- 开始时间早的优先
- 创建时间排序（保持稳定性）

### 2. 增强视觉区分
**文件**: `components/index-task-item/index-task-item.wxss`

通过CSS变量统一管理已完成任务的视觉效果：
- 整体透明度降至80%
- 背景变为浅灰色渐变
- 文字颜色变淡但保持可读性
- 标签降低饱和度
- 左侧色条变细并渐变淡出
- 绿色勾选框保持高亮并添加微光效果

### 3. 添加状态切换动画
**文件**: `components/index-task-item/index-task-item.js`

添加平滑的完成状态切换动画：
- 轻微缩放效果
- 透明度平滑过渡
- 配合轻微震动反馈

## 技术实现细节

### CSS变量定义
```css
.task-item {
  --completed-opacity: 0.8;
  --completed-text-color: #888888;
  --completed-secondary-text: #aaaaaa;
  --completed-hint-text: #bbbbbb;
  --completed-bg-start: #fafbfc;
  --completed-bg-end: #f6f8fa;
  --completed-border: rgba(0, 0, 0, 0.008);
  --completed-tag-opacity: 0.65;
  --completed-tag-saturation: 0.6;
  --completed-bar-width: 4rpx;
  --completed-bar-opacity: 0.4;
}
```

### 动画效果
```css
@keyframes task-complete {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.01); opacity: 0.9; }
  100% { transform: scale(1); opacity: var(--completed-opacity); }
}
```

### 排序逻辑优化
```javascript
return [...tasks].sort((a, b) => {
  // 1. 必做任务优先
  const aRequired = a.isRequired || false;
  const bRequired = b.isRequired || false;
  if (aRequired !== bRequired) {
    return aRequired ? -1 : 1;
  }
  
  // 2. 习惯任务优先
  if (a.type === 'habit' && b.type !== 'habit') return -1;
  if (a.type !== 'habit' && b.type === 'habit') return 1;
  
  // 3. 开始时间早的优先
  if (a.startTime && b.startTime) {
    return a.startTime.localeCompare(b.startTime);
  }
  
  // 4. 创建时间排序保持稳定
  return (a.createTime || 0) - (b.createTime || 0);
});
```

## 设计原则

### 视觉和谐性
- 与页面整体设计风格保持一致
- 使用与进度条相同的缓动函数
- 避免与小鸡动画、圆环动画产生视觉冲突

### 用户体验优化
- **位置稳定**: 任务完成后保持原有位置
- **状态清晰**: 通过视觉效果明确区分完成状态
- **操作连续**: 用户可以连续完成多个任务
- **成就感保持**: 已完成任务仍然可见

### 性能考虑
- 使用CSS变量便于主题切换
- 动画使用GPU加速属性
- 避免重排和重绘

## 效果验证

### 预期效果
1. 任务完成后位置保持不变
2. 已完成任务有明显但优雅的视觉区分
3. 不影响页面其他动效的正常运行
4. 提升用户连续完成任务的体验

### 测试场景
- 连续完成多个任务
- 取消任务完成状态
- 与进度条动画同时触发
- 不同类型任务的视觉效果

## 后续优化建议

1. **用户设置**: 可考虑添加"隐藏已完成任务"的用户选项
2. **批量操作**: 提供批量完成任务的功能
3. **动画优化**: 根据用户反馈进一步调整动画效果
4. **主题适配**: 确保在不同主题下的视觉效果

## 更新日期
2024年12月19日

## 相关文件
- `repositories/task-repository.js` - 排序逻辑修改
- `components/index-task-item/index-task-item.wxss` - 视觉样式优化
- `components/index-task-item/index-task-item.js` - 动画逻辑添加
- `pages/index/index.js` - 日志记录优化 