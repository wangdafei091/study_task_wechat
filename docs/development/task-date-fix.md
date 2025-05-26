# 任务日期不匹配问题修复

## 问题描述

用户创建每周二重复的任务时，虽然选择了周二作为重复星期，但任务在热力图中显示在周一，与用户预期不符。

## 问题分析

### 根本原因

1. **日期和星期的对应关系**
   - 用户在2025-05-26（周一）创建任务
   - 选择了周二作为重复星期（JavaScript中 `getDay()` 返回值为2）
   - 但原始任务被创建在周一，与选择的重复星期不匹配

2. **任务创建流程问题**
   - 系统直接使用用户选择的开始日期创建原始任务
   - 没有检查开始日期的星期是否与选择的重复星期匹配
   - 重复任务生成逻辑正确，但原始任务日期错误

3. **JavaScript星期几定义**
   ```javascript
   // getDay() 返回值
   0 = 周日, 1 = 周一, 2 = 周二, 3 = 周三, 4 = 周四, 5 = 周五, 6 = 周六
   ```

### 具体表现

从日志分析可以看到：
```
'newTask.repeat.days': [2]  // 用户选择了周二
'newTask.repeat.startDate': '2025-05-26'  // 周一
'newTask.repeat.endDate': '2025-05-31'    // 周六
```

- 原始任务创建在2025-05-26（周一）
- 重复任务正确生成在2025-05-27（周二）
- 热力图显示任务在周一，因为原始任务确实在周一

## 解决方案

### 方案1：自动调整任务日期（已实施）

**修复位置**：`services/task-service.js` 的 `createTask` 方法

**修复逻辑**：
1. 在任务验证通过后、保存前检查自定义重复任务
2. 如果开始日期的星期不在选择的重复星期中，自动调整到第一个符合条件的日期
3. 同时更新任务的 `date` 字段和 `repeat.startDate` 字段

**代码实现**：
```javascript
// 修复自定义重复任务的日期不匹配问题
if (task.repeat && task.repeat.type === 'custom' && task.repeat.days && task.repeat.days.length > 0) {
  const startDate = new Date(task.date);
  const startDayOfWeek = startDate.getDay();
  
  // 检查开始日期的星期是否在选择的重复星期中
  if (!task.repeat.days.includes(startDayOfWeek.toString())) {
    // 找到第一个符合条件的日期
    const endDate = new Date(task.repeat.endDate);
    let adjustedDate = new Date(startDate);
    
    for (let i = 0; i <= 13; i++) {
      const currentDay = adjustedDate.getDay();
      if (task.repeat.days.includes(currentDay.toString()) && adjustedDate <= endDate) {
        task.date = dateUtils.formatDate(adjustedDate);
        task.repeat.startDate = task.date;
        break;
      }
      adjustedDate.setDate(adjustedDate.getDate() + 1);
    }
  }
}
```

### 方案2：改进用户界面提示（已实施）

**修复位置**：`pages/task-edit/task-edit.js` 的冲突检查逻辑

**修复内容**：
- 更新警告文本，明确告知用户系统会自动调整日期
- 从"系统将只创建符合条件的任务实例"改为"系统将自动调整到第一个符合条件的日期"

### 方案3：完善日志记录（已实施）

**修复位置**：`services/task-service.js` 的 `_generateRepeatTasks` 方法

**改进内容**：
- 添加详细的重复任务生成日志
- 记录每个生成的任务日期和对应的星期
- 便于调试和问题排查

## 修复效果

### 修复前
- 用户选择周二重复，任务显示在周一
- 热力图显示与用户预期不符
- 用户困惑为什么任务不在选择的星期

### 修复后
- 用户选择周二重复，任务自动调整到周二
- 热力图正确显示任务在周二
- 用户界面给出明确的调整提示
- 详细日志便于问题排查

## 测试验证

创建了测试脚本 `test/task-date-fix-test.js` 来验证修复效果：

### 测试用例1：需要调整的情况
- 输入：周一创建周二重复任务
- 预期：任务日期自动调整到周二
- 验证：检查任务日期和重复任务生成

### 测试用例2：无需调整的情况
- 输入：周二创建周二重复任务
- 预期：任务日期保持不变
- 验证：确保不会误调整正确的日期

## 注意事项

1. **向后兼容性**：修复不影响现有任务，只对新创建的任务生效
2. **日期范围限制**：如果在指定日期范围内找不到符合条件的日期，会返回错误
3. **用户体验**：界面会明确提示用户日期调整行为
4. **日志记录**：详细记录调整过程，便于问题排查

## 相关文件

- `services/task-service.js` - 核心修复逻辑
- `pages/task-edit/task-edit.js` - 用户界面改进
- `test/task-date-fix-test.js` - 测试验证
- `docs/development/task-date-fix.md` - 本文档

## 修复优化记录

### 2025-05-26 第二次优化

**问题**：用户反馈创建周二重复任务仍然失败，错误信息为"无法在指定日期范围内找到符合重复条件的日期"

**根本原因分析**：
- 日期比较时的时间部分不一致导致比较失败
- `adjustedDate` 和 `endDate` 可能包含不同的时间信息
- 搜索范围（14天）在某些边界情况下不够

**优化方案**：
1. **标准化日期比较**：重置所有日期对象的时间为午夜（00:00:00）
2. **扩大搜索范围**：从14天扩大到21天
3. **详细日志记录**：记录每次日期检查的详细信息
4. **改进错误信息**：提供更具体的错误描述

**关键代码改进**：
```javascript
// 标准化日期比较，确保准确性
endDate.setHours(0, 0, 0, 0);
adjustedDate.setHours(0, 0, 0, 0);

// 详细的条件检查和日志
const dayMatches = task.repeat.days.includes(currentDay.toString());
const dateInRange = adjustedDate <= endDate;
logger.debug('TaskService', `检查日期: ${dateStr} (星期${currentDay}), 星期匹配=${dayMatches}, 日期范围内=${dateInRange}`);
```

**验证测试**：
- 创建了 `test/task-date-fix-validation.js` 验证脚本
- 包含4个测试用例，覆盖各种场景
- 确保修复的稳定性和准确性

## 后续优化建议

1. **智能日期建议**：在用户选择重复星期时，自动建议合适的开始日期
2. **批量调整**：为现有的不匹配任务提供批量调整功能
3. **用户教育**：在帮助文档中说明重复任务的日期匹配规则 